import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { computeBalances, cashPosition, totalsList, settlement, isMoneyIn, isPnl, isBooked, toVnd, fmtMoney, BOOKED_ALLOCATIONS, type Totals , vnTodayStart } from "@/lib/money";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate } from "@/lib/format";

export default async function DashboardPage() {
  await requirePageSession(); // second line behind the proxy
  // `tr`, not `t`: the transaction loops below already use `t`.
  const tr = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const [transactions, accounts, openInvoices, projectList] = await Promise.all([
    prisma.transaction.findMany({ orderBy: { date: "desc" }, include: { category: true } }),
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.invoice.findMany({
      where: { status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { dueDate: "asc" },
      include: { client: true, vendor: true, project: true, allocations: BOOKED_ALLOCATIONS },
    }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);

  // Drafts are not in the books until reviewed. A reversal and the entry it
  // cancels stay in the totals (they net to zero) but not in the counts.
  const booked = transactions.filter(isBooked);
  const drafts = transactions.length - booked.length;
  const cancelled = new Set(transactions.map((t) => t.reversalOfId).filter(Boolean));
  const counted = (t: { id: string; reversalOfId: string | null }) => !t.reversalOfId && !cancelled.has(t.id);

  // All-time performance (in VND) — income and expenses only; transfers,
  // capital and loans move money but are not profit.
  const income = booked.filter(t => t.type === "INCOME");
  const expense = booked.filter(t => t.type === "EXPENSE");
  const totalIncome = income.reduce((acc, t) => acc + toVnd(t), 0);
  const totalExpense = expense.reduce((acc, t) => acc + toVnd(t), 0);
  const netSurplus = totalIncome - totalExpense; // profit / surplus

  // Cash = real balances per account (opening + every movement since), kept per
  // currency — VND and USD are never added together or revalued.
  const balances = computeBalances(accounts, booked);
  const position = cashPosition(accounts, balances);
  const liquid = totalsList(position.liquid);
  const ownerTotals = totalsList(position.owner);
  const accountList = accounts.filter((a) => a.isActive || (balances.get(a.id) ?? 0) !== 0);
  const unclassified = transactions.filter((t) => (t.type === "OTHER_IN" || t.type === "OTHER_OUT") && t.status !== "POSTED" && counted(t)).length;

  const recentTransactions = transactions.slice(0, 5);

  // Coming payments: what's still open on each invoice (gross − payments − evidenced
  // fees), totalled per currency. AR = clients owe me, AP = I owe vendors.
  const now = vnTodayStart(); // overdue from the day after the due date
  const comingItem = (i: typeof openInvoices[number]) => ({
    id: i.id,
    label: i.direction === "PAYABLE" ? (i.vendor?.name ?? tr("coming.vendor")) : (i.client?.name ?? tr("coming.client")),
    sub: [i.number, i.project?.name, i.status === "PARTIAL" ? tr("coming.partPaid") : null].filter(Boolean).join(" · "),
    amount: settlement(i.amount, i.allocations).difference,
    currency: i.currency,
    due: fmtDate(i.dueDate, locale),
    overdue: i.dueDate < now,
  });
  const totalOf = (items: ReturnType<typeof comingItem>[]) => {
    const t: Totals = {};
    for (const i of items) t[i.currency] = (t[i.currency] ?? 0) + i.amount;
    return totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ") || fmtMoney(0, "VND");
  };
  const comingOut = openInvoices.filter((i) => i.direction === "PAYABLE").map(comingItem);
  const comingIn = openInvoices.filter((i) => i.direction === "RECEIVABLE").map(comingItem);
  const apOutstanding = totalOf(comingOut);
  const arOutstanding = totalOf(comingIn);

  // Top projects by net profit — grouped from the transactions already fetched (no extra query).
  const projName = new Map(projectList.map((p) => [p.id, p.name]));
  const projAgg = new Map<string, { inc: number; exp: number; n: number }>();
  for (const t of booked) {
    if (!t.projectId || !isPnl(t.type)) continue;
    const a = projAgg.get(t.projectId) ?? { inc: 0, exp: 0, n: 0 };
    if (t.type === "INCOME") a.inc += toVnd(t); else a.exp += toVnd(t);
    a.n++;
    projAgg.set(t.projectId, a);
  }
  const topProjects = [...projAgg.entries()]
    .map(([id, a]) => ({ id, name: projName.get(id) ?? "—", net: a.inc - a.exp, txns: a.n }))
    .sort((x, y) => y.net - x.net)
    .slice(0, 5);

  const formatVnd = (amount: number) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
  };
  const cashSubtitle = accounts.length > 0
    ? tr("cards.cashSubtitle", { count: accounts.filter((a) => a.type === "BANK" || a.type === "CASH").length })
    : tr("cards.cashNoAccounts");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{tr("page.title")}</h1>
          <p className="text-muted-foreground mt-1">{tr("page.subtitle")}</p>
          {drafts > 0 && (
            <Link href="/ledger?view=drafts" className="inline-block mt-2 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:underline">
              {tr("page.draftsWaiting", { count: drafts })}
            </Link>
          )}
        </div>
        <Link href="/entry">
          <Button className="gap-2"><Plus className="h-4 w-4" />{tr("page.newEntry")}</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("cards.cashTitle")}</CardTitle>
            <Wallet className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            {liquid.length === 0 && <div className="text-2xl font-bold">{formatVnd(0)}</div>}
            {liquid.map(([c, v], i) => (
              <div key={c} className={i === 0 ? "text-2xl font-bold" : "text-lg font-semibold"}>{fmtMoney(v, c)}</div>
            ))}
            <p className="text-xs opacity-75 mt-1">{cashSubtitle}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("cards.netSurplusTitle")}</CardTitle>
            <TrendingUp className={`h-4 w-4 ${netSurplus >= 0 ? "text-green-500" : "text-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netSurplus >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatVnd(netSurplus)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{tr("cards.netSurplusSubtitle")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("cards.totalIncomeTitle")}</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatVnd(totalIncome)}</div>
            <p className="text-xs text-muted-foreground mt-1">{tr("cards.entries", { count: income.filter(counted).length })}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("cards.totalExpensesTitle")}</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatVnd(totalExpense)}</div>
            <p className="text-xs text-muted-foreground mt-1">{tr("cards.entries", { count: expense.filter(counted).length })}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{tr("accounts.title")}</CardTitle>
            <Link href="/accounts"><Button variant="outline" size="sm">{tr("accounts.manage")}</Button></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {accountList.map((a) => {
              const b = balances.get(a.id) ?? 0;
              return (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{a.name}</span>
                  <span className={`font-medium ${b < 0 ? "text-red-600" : ""}`}>{fmtMoney(b, a.currency)}</span>
                </div>
              );
            })}
            {accountList.length === 0 && <p className="text-xs text-muted-foreground">{tr("accounts.empty")}</p>}
            {ownerTotals.map(([c, v]) => (
              <p key={c} className={`text-xs border-t pt-2 ${v < 0 ? "text-red-600" : "text-amber-700"}`}>
                {v < 0 ? tr("accounts.companyOwesOwner", { amount: fmtMoney(-v, c) }) : tr("accounts.ownerHolds", { amount: fmtMoney(v, c) })}
              </p>
            ))}
            {unclassified > 0 && (
              <Link href="/accounts" className="block text-xs text-amber-700 border-t pt-2 hover:underline">
                {tr("accounts.needClassifying", { count: unclassified })}
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{tr("coming.title")}</CardTitle>
            <Link href="/invoices"><Button variant="outline" size="sm">{tr("coming.viewAll")}</Button></Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-red-600">{tr("coming.goingOut")}</span>
                <span className="font-semibold text-red-600">{apOutstanding}</span>
              </div>
              <div className="space-y-1">
                {comingOut.slice(0, 4).map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{i.label}{i.sub ? <span className="text-muted-foreground"> · {i.sub}</span> : null}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {i.overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">{tr("coming.overdue")}</span>}
                      <span className="text-muted-foreground text-xs">{tr("coming.due", { date: i.due })}</span>
                      <span className="font-medium">{fmtMoney(i.amount, i.currency)}</span>
                    </span>
                  </div>
                ))}
                {comingOut.length === 0 && <p className="text-xs text-muted-foreground">{tr("coming.nothingToPay")}</p>}
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-green-700">{tr("coming.comingIn")}</span>
                <span className="font-semibold text-green-700">{arOutstanding}</span>
              </div>
              <div className="space-y-1">
                {comingIn.slice(0, 4).map((i) => (
                  <div key={i.id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{i.label}{i.sub ? <span className="text-muted-foreground"> · {i.sub}</span> : null}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {i.overdue && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">{tr("coming.overdue")}</span>}
                      <span className="text-muted-foreground text-xs">{tr("coming.due", { date: i.due })}</span>
                      <span className="font-medium">{fmtMoney(i.amount, i.currency)}</span>
                    </span>
                  </div>
                ))}
                {comingIn.length === 0 && <p className="text-xs text-muted-foreground">{tr("coming.nothingIn")}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{tr("topProjects.title")}</CardTitle>
            <Link href="/projects"><Button variant="outline" size="sm">{tr("topProjects.projects")}</Button></Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProjects.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name}</span>
                <span className={`font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{formatVnd(p.net)}</span>
              </div>
            ))}
            {topProjects.length === 0 && <p className="text-sm text-muted-foreground">{tr("topProjects.empty")}</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{tr("recent.title")}</CardTitle>
            </div>
            <Link href="/ledger">
              <Button variant="outline" size="sm">{tr("recent.viewAll")}</Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {recentTransactions.map(t => (
                <div key={t.id} className="flex items-center">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-full ${isMoneyIn(t) ? "bg-green-100" : "bg-red-100"}`}>
                    {isMoneyIn(t) ? <ArrowUpRight className="h-4 w-4 text-green-600" /> : <ArrowDownRight className="h-4 w-4 text-red-600" />}
                  </div>
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">{isPnl(t.type) ? (t.category?.name || tr("recent.uncategorized")) : tc(`type.${t.type}`)}</p>
                    <p className="text-sm text-muted-foreground">
                      {t.description}
                      {t.status === "DRAFT" && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{tr("recent.draft")}</span>}
                    </p>
                  </div>
                  <div className={`ml-auto font-medium ${isMoneyIn(t) ? "text-green-600" : ""}`}>
                    {isMoneyIn(t) ? "+" : "-"}{fmtMoney(Math.abs(t.amount), t.currency)}
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  {tr("recent.empty")}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>{tr("quickActions.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Link href="/entry" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <ArrowUpRight className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">{tr("quickActions.logIncome")}</div>
            </Link>
            <Link href="/entry" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <ArrowDownRight className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">{tr("quickActions.logExpense")}</div>
            </Link>
            <Link href="/accounts" className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors">
              <div className="bg-primary/10 p-2 rounded-full">
                <Wallet className="h-4 w-4 text-primary" />
              </div>
              <div className="font-medium">{tr("quickActions.transfers")}</div>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
