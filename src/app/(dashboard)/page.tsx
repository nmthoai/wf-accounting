import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: { category: true },
  });

  const latestBalance = await prisma.bankBalance.findFirst({
    orderBy: { date: "desc" },
  });

  const totalIncome = transactions.filter(t => t.type === "INCOME").reduce((acc, t) => acc + (t.amount * t.exchangeRate), 0);
  const totalExpense = transactions.filter(t => t.type === "EXPENSE").reduce((acc, t) => acc + (t.amount * t.exchangeRate), 0);

  const recentTransactions = transactions.slice(0, 5);

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  
  const formatTransactionAmount = (t: any) => {
    if (t.currency === "USD") {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount);
    }
    return formatVnd(t.amount);
  };

  const bankBalance = latestBalance?.balance || 0;
  const totalCash = bankBalance + totalIncome;
  const netAmount = totalCash - totalExpense;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Financial overview for WorkFactory</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cash</CardTitle>
            <Wallet className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatVnd(totalCash)}</div>
            <p className="text-xs opacity-75 mt-1">
              Bank Balance + Income
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Amount</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatVnd(netAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total Cash - Expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatVnd(totalExpense)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
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
