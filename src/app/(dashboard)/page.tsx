import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Wallet, TrendingUp, Plus } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { computeBalances, cashPosition, totalsList, settlement, isMoneyIn, isPnl, isBooked, valueIn, fmtMoney, BOOKED_ALLOCATIONS, type Totals , vnTodayStart } from "@/lib/money";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, PanelHead, Stat, StatStrip } from "@/components/wf/ledger-ui";
import { GiniBadge } from "@/components/gini/gini-avatar";
import { ViewNote } from "@/components/wf/view-note";
import { getView } from "@/lib/view";

export default async function DashboardPage() {
  const session = await requirePageSession(); // second line behind the proxy
  // `tr`, not `t`: the transaction loops below already use `t`.
  const tr = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const [view, transactions, accounts, openInvoices, projectList] = await Promise.all([
    getView(session.user.id),
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
  const drafts = transactions.filter((t) => t.status === "DRAFT").length;
  const rejected = transactions.filter((t) => t.status === "REJECTED").length;
  const cancelled = new Set(transactions.map((t) => t.reversalOfId).filter(Boolean));
  const counted = (t: { id: string; reversalOfId: string | null }) => !t.reversalOfId && !cancelled.has(t.id);

  // All-time performance in the user's view currency — income and expenses
  // only; transfers, capital and loans move money but are not profit.
  const income = booked.filter(t => t.type === "INCOME");
  const expense = booked.filter(t => t.type === "EXPENSE");
  const totalIncome = income.reduce((acc, t) => acc + valueIn(view, t), 0);
  const totalExpense = expense.reduce((acc, t) => acc + valueIn(view, t), 0);
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
  // fees), totalled per currency (plus a converted total in the USD view).
  // AR = clients owe me, AP = I owe vendors.
  const now = vnTodayStart(); // overdue from the day after the due date
  const comingItem = (i: typeof openInvoices[number]) => ({
    id: i.id,
    label: i.direction === "PAYABLE" ? (i.vendor?.name ?? tr("coming.vendor")) : (i.client?.name ?? tr("coming.client")),
    sub: [i.number, i.project?.name, i.status === "PARTIAL" ? tr("coming.partPaid") : null].filter(Boolean).join(" · "),
    amount: settlement(i.amount, i.allocations).difference,
    currency: i.currency,
    exchangeRate: i.exchangeRate,
    due: fmtDate(i.dueDate, locale),
    overdue: i.dueDate < now,
  });
  const totalOf = (items: ReturnType<typeof comingItem>[]) => {
    const t: Totals = {};
    for (const i of items) t[i.currency] = (t[i.currency] ?? 0) + i.amount;
    const lines = totalsList(t);
    const text = lines.map(([c, v]) => fmtMoney(v, c)).join(" · ") || fmtMoney(0, view.currency);
    // In the USD view, amounts not already all in USD also get one converted
    // total — an estimate at the Settings rate.
    if (view.currency === "VND" || lines.length === 0 || (lines.length === 1 && lines[0][0] === view.currency)) return text;
    const total = items.reduce((s, i) => s + valueIn(view, i), 0);
    return `${text} · ${tr("coming.viewTotal", { amount: fmtMoney(total, view.currency) })}`;
  };
  const comingOut = openInvoices.filter((i) => i.direction === "PAYABLE").map(comingItem);
  const comingIn = openInvoices.filter((i) => i.direction === "RECEIVABLE").map(comingItem);
  const apOutstanding = totalOf(comingOut);
  const arOutstanding = totalOf(comingIn);

  // Top projects by net profit, in the view currency — grouped from the
  // transactions already fetched (no extra query).
  const projName = new Map(projectList.map((p) => [p.id, p.name]));
  const projAgg = new Map<string, { inc: number; exp: number; n: number }>();
  for (const t of booked) {
    if (!t.projectId || !isPnl(t.type)) continue;
    const a = projAgg.get(t.projectId) ?? { inc: 0, exp: 0, n: 0 };
    if (t.type === "INCOME") a.inc += valueIn(view, t); else a.exp += valueIn(view, t);
    a.n++;
    projAgg.set(t.projectId, a);
  }
  const topProjects = [...projAgg.entries()]
    .map(([id, a]) => ({ id, name: projName.get(id) ?? "—", net: a.inc - a.exp, txns: a.n }))
    .sort((x, y) => y.net - x.net)
    .slice(0, 5);

  const cashSubtitle = accounts.length > 0
    ? tr("cards.cashSubtitle", { count: accounts.filter((a) => a.type === "BANK" || a.type === "CASH").length })
    : tr("cards.cashNoAccounts");
  // Summary figures follow the view; cash, accounts and invoices stay in their own currency.
  const money = (v: number) => fmtMoney(v, view.currency);

  const comingRows = (items: ReturnType<typeof comingItem>[]) => items.slice(0, 4).map((i) => (
    <li key={i.id}>
      <div className="min-w-0">
        <p className="truncate text-foreground">{i.label}</p>
        {i.sub && <p className="truncate text-[12px] text-muted-foreground">{i.sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {i.overdue && <Chip tone="neg" mono>{tr("coming.overdue")}</Chip>}
        <span className="wf-num hidden text-[12px] text-muted-foreground sm:inline">{tr("coming.due", { date: i.due })}</span>
        <span className="wf-figure min-w-[7.5rem] text-right">{fmtMoney(i.amount, i.currency)}</span>
      </div>
    </li>
  ));

  return (
    <div>
      <PageHeader
        section="dashboard"
        title={tr("page.title")}
        description={tr("page.subtitle")}
        meta={(drafts > 0 || rejected > 0 || view.currency !== "VND") && (
          <>
            <ViewNote view={view} />
            {drafts > 0 && (
              <Link href="/ledger?view=drafts" className="wf-chip wf-chip--warn wf-chip--dot">{tr("page.draftsWaiting", { count: drafts })}</Link>
            )}
            {rejected > 0 && (
              <Link href="/ledger?view=rejected" className="wf-chip wf-chip--neg wf-chip--dot">{tr("page.rejectedWaiting", { count: rejected })}</Link>
            )}
          </>
        )}
        actions={
          <Button render={<Link href="/entry" />} nativeButton={false}><Plus />{tr("page.newEntry")}</Button>
        }
      />

      <StatStrip className="lg:grid-cols-4">
        <Stat label={tr("cards.cashTitle")} icon={Wallet} emphasis sub={cashSubtitle}>
          {liquid.length === 0 && fmtMoney(0, "VND")}
          {liquid.map(([c, v], i) => (i === 0 ? <span key={c}>{fmtMoney(v, c)}</span> : <small key={c}>{fmtMoney(v, c)}</small>))}
        </Stat>
        <Stat label={tr("cards.netSurplusTitle")} icon={TrendingUp} tone={netSurplus >= 0 ? "pos" : "neg"} sub={tr("cards.netSurplusSubtitle")}>
          {money(netSurplus)}
        </Stat>
        <Stat label={tr("cards.totalIncomeTitle")} icon={ArrowDownLeft} tone="pos" sub={tr("cards.entries", { count: income.filter(counted).length })}>
          {money(totalIncome)}
        </Stat>
        <Stat label={tr("cards.totalExpensesTitle")} icon={ArrowUpRight} tone="neg" sub={tr("cards.entries", { count: expense.filter(counted).length })}>
          {money(totalExpense)}
        </Stat>
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <PanelHead
            title={tr("accounts.title")}
            count={accountList.length}
            actions={<Button variant="outline" size="sm" render={<Link href="/accounts" />} nativeButton={false}>{tr("accounts.manage")}</Button>}
          />
          <ul className="wf-rows flex-1">
            {accountList.map((a) => {
              const b = balances.get(a.id) ?? 0;
              return (
                <li key={a.id}>
                  <div className="min-w-0">
                    <p className="truncate text-foreground">{a.name}</p>
                    <p className="wf-label mt-1">{tc(`accountType.${a.type}`)} · {a.currency}</p>
                  </div>
                  <span className={cn("wf-figure", b < 0 && "text-neg")}>{fmtMoney(b, a.currency)}</span>
                </li>
              );
            })}
            {accountList.length === 0 && <li className="text-muted-foreground">{tr("accounts.empty")}</li>}
          </ul>
          {(ownerTotals.length > 0 || unclassified > 0) && (
            <div className="grid gap-2 border-t border-border bg-muted/40 px-5 py-4 text-[13px]">
              {ownerTotals.map(([c, v]) => (
                <p key={c} className={cn("flex items-center gap-2", v < 0 ? "text-neg" : "text-warn")}>
                  <ArrowLeftRight className="size-4 shrink-0" aria-hidden="true" />
                  {v < 0 ? tr("accounts.companyOwesOwner", { amount: fmtMoney(-v, c) }) : tr("accounts.ownerHolds", { amount: fmtMoney(v, c) })}
                </p>
              ))}
              {unclassified > 0 && (
                <Link href="/accounts" className="wf-chip wf-chip--warn wf-chip--dot justify-self-start">
                  {tr("accounts.needClassifying", { count: unclassified })}
                </Link>
              )}
            </div>
          )}
        </Card>

        <Card className="lg:col-span-8">
          <PanelHead
            title={tr("coming.title")}
            count={comingOut.length + comingIn.length}
            actions={<Button variant="outline" size="sm" render={<Link href="/invoices" />} nativeButton={false}>{tr("coming.viewAll")}</Button>}
          />
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-neg">
            <p className="flex items-center gap-2 font-semibold"><ArrowUpRight className="size-4" aria-hidden="true" />{tr("coming.goingOut")}</p>
            <p className="wf-figure">{apOutstanding}</p>
          </div>
          <ul className="wf-rows">
            {comingRows(comingOut)}
            {comingOut.length === 0 && <li className="text-muted-foreground">{tr("coming.nothingToPay")}</li>}
          </ul>
          <div className="flex items-center justify-between gap-3 border-y border-border px-5 py-3 text-pos">
            <p className="flex items-center gap-2 font-semibold"><ArrowDownLeft className="size-4" aria-hidden="true" />{tr("coming.comingIn")}</p>
            <p className="wf-figure">{arOutstanding}</p>
          </div>
          <ul className="wf-rows">
            {comingRows(comingIn)}
            {comingIn.length === 0 && <li className="text-muted-foreground">{tr("coming.nothingIn")}</li>}
          </ul>
        </Card>

        <Card className="lg:col-span-8">
          <PanelHead
            title={tr("recent.title")}
            actions={<Button variant="outline" size="sm" render={<Link href="/ledger" />} nativeButton={false}>{tr("recent.viewAll")}</Button>}
          />
          <ul className="wf-rows">
            {recentTransactions.map((t) => {
              const moneyIn = isMoneyIn(t);
              return (
                <li key={t.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    {moneyIn
                      ? <ArrowDownLeft className="size-4 shrink-0 text-pos" aria-hidden="true" />
                      : <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-foreground">
                        <span className="truncate">{isPnl(t.type) ? (t.category?.name || tr("recent.uncategorized")) : tc(`type.${t.type}`)}</span>
                        {t.status === "DRAFT" && <Chip tone="warn" mono>{tc("status.DRAFT")}</Chip>}
                        {t.status === "REJECTED" && <Chip tone="neg" mono>{tc("status.REJECTED")}</Chip>}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        <span className="wf-num">{fmtDate(t.date, locale)}</span>{t.description ? ` · ${t.description}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={cn("wf-figure", moneyIn && "text-pos")}>
                    {moneyIn ? "+" : "\u2212"}{fmtMoney(Math.abs(t.amount), t.currency)}
                  </span>
                </li>
              );
            })}
            {recentTransactions.length === 0 && <li className="text-muted-foreground">{tr("recent.empty")}</li>}
          </ul>
        </Card>

        <div className="grid content-start gap-6 lg:col-span-4">
          <Card>
            <PanelHead title={tr("quickActions.title")} />
            <ul className="wf-rows">
              {[
                { href: "/gini", title: tr("quickActions.gini"), sub: tr("quickActions.giniSub"), gini: true },
                { href: "/entry", title: tr("quickActions.logIncome"), sub: tr("quickActions.logIncomeSub"), icon: ArrowDownLeft },
                { href: "/entry", title: tr("quickActions.logExpense"), sub: tr("quickActions.logExpenseSub"), icon: ArrowUpRight },
                { href: "/accounts", title: tr("quickActions.transfers"), sub: tr("quickActions.transfersSub"), icon: ArrowLeftRight },
              ].map((a) => (
                <li key={a.title} className="p-0!">
                  <Link href={a.href} className="group flex w-full items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-secondary/45">
                    {a.gini ? (
                      <GiniBadge className="size-9" />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong text-primary">
                        {a.icon && <a.icon className="size-4" aria-hidden="true" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-foreground">{a.title}</span>
                      <span className={cn("block truncate text-[12px]", a.gini ? "wf-label mt-1 text-agent-text" : "text-muted-foreground")}>{a.sub}</span>
                    </span>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-[3px] group-hover:text-primary" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <PanelHead
              title={tr("topProjects.title")}
              actions={<Button variant="outline" size="sm" render={<Link href="/projects" />} nativeButton={false}>{tr("topProjects.projects")}</Button>}
            />
            <ul className="wf-rows">
              {topProjects.map((p) => (
                <li key={p.id}>
                  <Link href={`/projects/${p.id}`} className="min-w-0 truncate text-foreground hover:text-primary">{p.name}</Link>
                  <span className={cn("wf-figure", p.net >= 0 ? "text-primary" : "text-neg")}>{money(p.net)}</span>
                </li>
              ))}
              {topProjects.length === 0 && <li className="text-muted-foreground">{tr("topProjects.empty")}</li>}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
