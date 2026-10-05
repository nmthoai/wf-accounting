import { prisma } from "@/lib/prisma";
import { accountDelta, fmtMoney, EPS } from "@/lib/money";
import { getT } from "@/i18n/server";

// VND lines are whole đồng; a foreign entry valued in VND may carry a fraction.
export const tolerance = (currency: string) => (currency === "VND" ? 0.5 : EPS);

// How much of a bank line its matched entries explain, in the line's direction.
// Signed: a bank fee withheld from a receipt on the line reduces it.
export const explained = (line: { amount: number }, entries: Parameters<typeof accountDelta>[0][], currency: string) =>
  Math.sign(line.amount) * entries.reduce((s, e) => s + accountDelta(e, currency), 0);

type Entry = {
  id?: string; type: string; amount: number; exchangeRate: number; vndAmount: number | null; accountId: string | null;
  deductedFromId?: string | null;
};

// Can these entries be reconciled to the bank line, together with the entries
// already matched to it (except `replacing`)? Every entry moves money the same
// way as the line, except a bank fee withheld from a receipt that is on the
// line too: the line then shows the net. Returns the problem, in the user's
// language, or null.
export async function bankLinkProblem(lineId: string, entries: Entry[], replacing: string[] = []) {
  const t = await getT("bank");
  const line = await prisma.bankLine.findUnique({ where: { id: lineId }, include: { account: true, entries: true } });
  if (!line) return t("errors.lineGone");
  const cur = line.account.currency;
  for (const e of entries) {
    if (e.accountId !== line.accountId) return t("errors.otherAccount", { account: line.account.name });
  }
  const all: Entry[] = [...line.entries.filter((e) => !replacing.includes(e.id)), ...entries];
  const onLine = new Set(all.map((e) => e.id).filter(Boolean));
  let net = 0;
  for (const e of all) {
    const d = accountDelta(e, cur);
    const withheldFee = !!e.deductedFromId && onLine.has(e.deductedFromId);
    if (Math.sign(d) !== Math.sign(line.amount) && !withheldFee) {
      return line.amount > 0 ? t("errors.lineInEntryOut") : t("errors.lineOutEntryIn");
    }
    net += d;
  }
  if (Math.sign(net) === -Math.sign(line.amount) || Math.abs(net) > Math.abs(line.amount) + tolerance(cur)) {
    return t("errors.moreThanLine", { amount: fmtMoney(Math.abs(line.amount), cur) });
  }
  return null;
}
