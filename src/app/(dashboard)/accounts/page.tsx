import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { computeBalances, cashPosition, isPnl, type Totals } from "@/lib/money";
import { AccountsClient, type MovementRow } from "@/components/accounts/accounts-client";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function AccountsPage() {
  const session = await auth();
  const [accounts, txns, loans] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { transactions: true } } } }),
    prisma.transaction.findMany({
      orderBy: { date: "desc" },
      select: {
        id: true, type: true, amount: true, currency: true, exchangeRate: true, vndAmount: true,
        accountId: true, date: true, description: true, transferId: true, loanId: true,
      },
    }),
    prisma.loan.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  const bal = computeBalances(accounts, txns);
  const position = cashPosition(accounts, bal);
  // Capital contributed, per currency (never converted).
  const capital: Totals = {};
  for (const t of txns) if (t.type === "CAPITAL_IN") capital[t.currency] = (capital[t.currency] ?? 0) + t.amount;

  const loanRows = loans.map((l) => {
    const ts = txns.filter((t) => t.loanId === l.id);
    const received = ts.filter((t) => t.type === "LOAN_IN").reduce((a, t) => a + t.amount, 0);
    const repaid = ts.filter((t) => t.type === "LOAN_REPAY").reduce((a, t) => a + t.amount, 0);
    return { id: l.id, lender: l.lender, currency: l.currency, notes: l.notes, received, repaid, outstanding: received - repaid };
  });

  // Everything that isn't income/expense. The two legs of a transfer collapse into one row.
  const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
  const lenderOf = new Map(loans.map((l) => [l.id, l.lender]));
  const movements: MovementRow[] = [];
  const seenTransfers = new Set<string>();
  for (const t of txns) {
    if (isPnl(t.type)) continue;
    if (t.transferId) {
      if (seenTransfers.has(t.transferId)) continue;
      seenTransfers.add(t.transferId);
      const legs = txns.filter((x) => x.transferId === t.transferId);
      const out = legs.find((x) => x.type === "TRANSFER_OUT");
      const inn = legs.find((x) => x.type === "TRANSFER_IN");
      if (!out || !inn) continue;
      const usdLeg = [out, inn].find((x) => x.currency === "USD");
      movements.push({
        isTransfer: true, id: out.id, transferId: t.transferId, date: iso(t.date)!, description: t.description,
        fromAccountId: out.accountId, fromName: nameOf.get(out.accountId ?? "") ?? "—", amountOut: out.amount, currencyOut: out.currency,
        toAccountId: inn.accountId, toName: nameOf.get(inn.accountId ?? "") ?? "—", amountIn: inn.amount, currencyIn: inn.currency,
        rate: out.currency !== inn.currency && usdLeg ? usdLeg.exchangeRate : null,
      });
    } else {
      movements.push({
        isTransfer: false, kind: t.type, id: t.id, date: iso(t.date)!, description: t.description,
        accountId: t.accountId, accountName: nameOf.get(t.accountId ?? "") ?? "—",
        amount: t.amount, currency: t.currency, loanId: t.loanId, lender: t.loanId ? lenderOf.get(t.loanId) ?? null : null,
      });
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Accounts</h1>
        <p className="text-muted-foreground mt-1">Where the money sits — bank, cash, owner-paid, deposits — plus transfers, capital and loans</p>
      </div>
      <AccountsClient
        isAdmin={session?.user?.role === "ADMIN"}
        position={{ ...position, capital }}
        accounts={accounts.map((a) => ({
          id: a.id, name: a.name, type: a.type, currency: a.currency, isActive: a.isActive, notes: a.notes,
          openingBalance: a.openingBalance, openingDate: iso(a.openingDate),
          balance: bal.get(a.id) ?? 0, movementCount: a._count.transactions,
        }))}
        loans={loanRows}
        movements={movements}
      />
    </div>
  );
}
