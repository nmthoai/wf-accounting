import { prisma } from "@/lib/prisma";
import { BalanceClient } from "@/components/balance/balance-client";

const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;

export default async function BalancePage() {
  const movements = await prisma.bankBalance.findMany({ orderBy: { date: "desc" } });
  const txns = await prisma.transaction.findMany({ select: { type: true, amount: true, exchangeRate: true } });

  const income = txns.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
  const expense = txns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const opening = movements.filter((m) => m.type === "OPENING").reduce((a, m) => a + m.amount, 0);
  const deposits = movements.filter((m) => m.type === "DEPOSIT").reduce((a, m) => a + m.amount, 0);
  const withdrawals = movements.filter((m) => m.type === "WITHDRAWAL").reduce((a, m) => a + m.amount, 0);
  const cashOnHand = opening + deposits - withdrawals + income - expense;

  const rows = movements.map((m) => ({
    id: m.id, type: m.type, amount: m.amount,
    date: m.date.toISOString().slice(0, 10), description: m.description,
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Balance</h1>
        <p className="text-muted-foreground mt-1">Your bank cash — opening balance, deposits and withdrawals</p>
      </div>
      <BalanceClient
        movements={rows}
        hasOpening={movements.some((m) => m.type === "OPENING")}
        summary={{ opening, deposits, withdrawals, income, expense, cashOnHand }}
      />
    </div>
  );
}
