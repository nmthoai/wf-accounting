import { prisma } from "@/lib/prisma";
import { accountDelta, fmtMoney, EPS } from "@/lib/money";

// VND lines are whole đồng; a foreign entry valued in VND may carry a fraction.
export const tolerance = (currency: string) => (currency === "VND" ? 0.5 : EPS);

type Entry = { type: string; amount: number; exchangeRate: number; vndAmount: number | null; accountId: string | null };

// Can these entries be reconciled to the bank line, together with the entries
// already matched to it (except `replacing`)? Returns the problem, or null.
export async function bankLinkProblem(lineId: string, entries: Entry[], replacing: string[] = []) {
  const line = await prisma.bankLine.findUnique({ where: { id: lineId }, include: { account: true, entries: true } });
  if (!line) return "That bank line no longer exists.";
  const cur = line.account.currency;
  let total = line.entries.filter((e) => !replacing.includes(e.id)).reduce((a, e) => a + Math.abs(accountDelta(e, cur)), 0);
  for (const e of entries) {
    if (e.accountId !== line.accountId) return `The bank line is on ${line.account.name} — the entry must be too.`;
    const d = accountDelta(e, cur);
    if (Math.sign(d) !== Math.sign(line.amount)) {
      return line.amount > 0 ? "The bank line is money in; this entry is money out." : "The bank line is money out; this entry is money in.";
    }
    total += Math.abs(d);
  }
  if (total > Math.abs(line.amount) + tolerance(cur)) return `That's more than the bank line (${fmtMoney(Math.abs(line.amount), cur)}).`;
  return null;
}
