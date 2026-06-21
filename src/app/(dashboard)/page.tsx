import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Convert a transaction to VND (USD rows carry the exchangeRate used at entry time).
const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;

export default async function DashboardPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: { category: true },
  });

  const latestBalance = await prisma.bankBalance.findFirst({
    orderBy: { date: "desc" },
  });

  // All-time performance (in VND)
  const income = transactions.filter(t => t.type === "INCOME");
  const expense = transactions.filter(t => t.type === "EXPENSE");
  const totalIncome = income.reduce((acc, t) => acc + toVnd(t), 0);
  const totalExpense = expense.reduce((acc, t) => acc + toVnd(t), 0);
  const netSurplus = totalIncome - totalExpense; // profit / surplus

  // Cash on Hand is anchored to the most recent bank-balance update, then we
  // layer on only the movements recorded AFTER that update (the snapshot already
  // reflects everything up to its own date). No bank update yet → derive from 0.
  const anchorDate = latestBalance?.date ?? null;
  const movementsSince = anchorDate
    ? transactions.filter(t => t.date > anchorDate)
    : transactions;
  const incomeSince = movementsSince.filter(t => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
  const expenseSince = movementsSince.filter(t => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const cashOnHand = (latestBalance?.balance ?? 0) + incomeSince - expenseSince;
  const sinceCount = anchorDate ? movementsSince.length : transactions.length;

  const recentTransactions = transactions.slice(0, 5);

  // Accounts receivable (sent, not yet paid) + overdue
  const openInvoices = await prisma.invoice.findMany({ where: { status: "SENT" } });
  const now = new Date();
  const arOutstanding = openInvoices.reduce((a, i) => a + i.amount * i.exchangeRate, 0);
  const arOverdue = openInvoices.filter((i) => i.dueDate < now).reduce((a, i) => a + i.amount * i.exchangeRate, 0);

  // Top projects by net profit (cash-basis from linked transactions)
  const projects = await prisma.project.findMany({ include: { transactions: true } });
  const topProjects = projects
    .map((p) => {
      const inc = p.transactions.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
      const exp = p.transactions.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
      return { id: p.id, name: p.name, net: inc - exp, txns: p.transactions.length };
    })
    .filter((p) => p.txns > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 5);

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  const formatDate = (d: Date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);

  const formatTransactionAmount = (t: any) => {
    if (t.currency === "USD") {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount);
    }
    return formatVnd(t.amount);
  };

  const cashSubtitle = latestBalance
    ? `Bank update ${formatDate(latestBalance.date)} + ${sinceCount} since`
    : "Derived from all transactions";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Financial overview for WorkFactory</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash on Hand</CardTitle>
            <Wallet className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatVnd(cashOnHand)}</div>
            <p className="text-xs opacity-75 mt-1">{cashSubtitle}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Surplus</CardTitle>
            <TrendingUp className={`h-4 w-4 ${netSurplus >= 0 ? "text-green-500" : "text-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netSurplus >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatVnd(netSurplus)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Income − Expenses (all time)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatVnd(totalIncome)}</div>
            <p className="text-xs text-muted-foreground mt-1">{income.length} entries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatVnd(totalExpense)}</div>
            <p className="text-xs text-muted-foreground mt-1">{expense.length} entries</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Accounts Receivable</CardTitle>
            <Link href="/invoices"><Button variant="outline" size="sm">Invoices</Button></Link>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-xl font-bold text-amber-600">{formatVnd(arOutstanding)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-xl font-bold text-red-600">{formatVnd(arOverdue)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Top Projects by Profit</CardTitle>
            <Link href="/projects"><Button variant="outline" size="sm">Projects</Button></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className={`font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{formatVnd(p.net)}</span>
              </div>
            ))}
            {topProjects.length === 0 && <p className="text-sm text-muted-foreground">Tag transactions to a project to see profit here.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
            </div>
            <Link href="/ledger">
              <Button variant="outline" size="sm">View All</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {recentTransactions.map(t => (
                <div key={t.id} className="flex items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${t.type === "INCOME" ? "bg-green-100" : "bg-red-100"}`}>
                    {t.type === "INCOME" ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{t.category?.name || "Uncategorized"}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  </div>
                  <div className={`ml-auto font-medium ${t.type === "INCOME" ? "text-green-600" : ""}`}>
                    {t.type === "INCOME" ? "+" : "-"}{formatTransactionAmount(t)}
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No transactions yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href="/entry" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">Log Income</div>
            </Link>
            <Link href="/entry" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <ArrowDownRight className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">Log Expense</div>
            </Link>
            <Link href="/settings" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">Update Bank Balance</div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
