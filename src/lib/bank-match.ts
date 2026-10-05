import { prisma } from "@/lib/prisma";
import { accountDelta, fmtMoney, EPS } from "@/lib/money";
import { getT } from "@/i18n/server";

// VND lines are whole đồng; a foreign entry valued in VND may carry a fraction.
export const tolerance = (currency: string) => (currency === "VND" ? 0.5 : EPS);

type Entry = { type: string; amount: number; exchangeRate: number; vndAmount: number | null; accountId: string | null };

// Can these entries be reconciled to the bank line, together with the entries
// already matched to it (except `replacing`)? Returns the problem, in the
// user's language, or null.
export async function bankLinkProblem(lineId: string, entries: Entry[], replacing: string[] = []) {
  const t = await getT("bank");
  const line = await prisma.bankLine.findUnique({ where: { id: lineId }, include: { account: true, entries: true } });
  if (!line) return t("errors.lineGone");
  const cur = line.account.currency;
  let total = line.entries.filter((e) => !replacing.includes(e.id)).reduce((a, e) => a + Math.abs(accountDelta(e, cur)), 0);
  for (const e of entries) {
    if (e.accountId !== line.accountId) return t("errors.otherAccount", { account: line.account.name });
    const d = accountDelta(e, cur);
    if (Math.sign(d) !== Math.sign(line.amount)) {
      return line.amount > 0 ? t("errors.lineInEntryOut") : t("errors.lineOutEntryIn");
    }
    total += Math.abs(d);
  }
  if (total > Math.abs(line.amount) + tolerance(cur)) return t("errors.moreThanLine", { amount: fmtMoney(Math.abs(line.amount), cur) });
  return null;
}
