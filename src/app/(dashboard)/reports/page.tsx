import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodPicker } from "@/components/reports/period-picker";
import { TrendChart } from "@/components/reports/trend-chart";
import { PnlTable } from "@/components/reports/pnl-table";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { toVnd, fmtMoney, totalsList, BOOKED, vnToday, type Totals } from "@/lib/money";
import { DOC_OPEN, CIT_STATUS } from "@/lib/review";
import { fmtMonth } from "@/lib/format";
import { intlLocale } from "@/i18n/config";
import { MONTH, addMonths, monthsBetween, monthStart, buildPnl } from "@/lib/pnl";

// Months the report accepts: typed years outside this range fall back to the default.
const MIN_MONTH = "2000-01";

// P&L counts income and expenses only — transfers, capital and loans are not
// profit — and only reviewed or posted entries; drafts wait for review.
const PNL = { type: { in: ["INCOME", "EXPENSE"] }, ...BOOKED };
const fmt = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

// One breakdown: each row's amount and share of the total, then the total.
function Lines({ rows, total, color, emptyText, totalText }: {
  rows: [string, number][]; total: number; color: string; emptyText: string; totalText: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map(([name, amt]) => (
        <div key={name} className="flex items-center justify-between text-sm">
          <span>{name}</span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{total > 0 ? Math.round((amt / total) * 100) : 0}%</span>
            <span className={`font-medium ${color}`}>{fmt(amt)}</span>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{emptyText}</p>}
      <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
        <span>{totalText}</span><span className={color}>{fmt(total)}</span>
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; month?: string }> }) {
  await requirePageSession(); // second line behind the proxy
  const tr = await getTranslations("reports");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const sp = await searchParams;
  const thisMonth = vnToday().slice(0, 7);
  // ?from=&to= months; an old ?month= link shows that one month; default: the last six months.
  const maxMonth = addMonths(thisMonth, 12);
  const valid = (m?: string) => !!m && MONTH.test(m) && m >= MIN_MONTH && m <= maxMonth;
  let from = valid(sp.from) ? sp.from! : valid(sp.month) ? sp.month! : addMonths(thisMonth, -5);
  let to = valid(sp.to) ? sp.to! : valid(sp.month) ? sp.month! : thisMonth;
  if (from > to) [from, to] = [to, from];
  const months = monthsBetween(from, to);
  from = months[0]; // a range over 20 years keeps its latest months
  const start = monthStart(from), end = monthStart(addMonths(to, 1));
  // The same number of months just before, for the comparison on the cards.
  const prevStart = monthStart(addMonths(from, -months.length));

  const [txns, prevTxns, drafts, rejected, firstEntry, lastEntry] = await Promise.all([
    prisma.transaction.findMany({ where: { ...PNL, date: { gte: start, lt: end } }, include: { category: true, project: true }, orderBy: { date: "asc" } }),
    prisma.transaction.findMany({ where: { ...PNL, date: { gte: prevStart, lt: start } }, select: { type: true, amount: true, exchangeRate: true, vndAmount: true } }),
    prisma.transaction.count({ where: { type: { in: ["INCOME", "EXPENSE"] }, status: "DRAFT", date: { gte: start, lt: end } } }),
    prisma.transaction.count({ where: { type: { in: ["INCOME", "EXPENSE"] }, status: "REJECTED", date: { gte: start, lt: end } } }),
    prisma.transaction.findFirst({ where: PNL, orderBy: { date: "asc" }, select: { date: true } }),
    prisma.transaction.findFirst({ where: PNL, orderBy: { date: "desc" }, select: { date: true } }),
  ]);
  const firstMonth = firstEntry ? firstEntry.date.toISOString().slice(0, 7) : thisMonth;
  const lastMonth = lastEntry ? lastEntry.date.toISOString().slice(0, 7) : thisMonth;

  const pnl = buildPnl(txns, months, tr("uncategorized"));
  const totalIncome = pnl.revenue.total, totalExpense = pnl.cost.total, net = pnl.netTotal;
  const prevNet =
    prevTxns.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0) -
    prevTxns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const delta = net - prevNet;
  // Only compare with months the books fully cover; before that the "growth" is just the start of the books.
  const comparable = !!firstEntry && monthStart(firstMonth) <= prevStart;
  const perMonth = (v: number) => v / months.length;

  // Per-project breakdown for the period
  const projMap = new Map<string, { name: string; inc: number; exp: number }>();
  for (const t of txns) {
    const key = t.projectId ?? "__none__";
    const row = projMap.get(key) ?? { name: t.project?.name ?? tr("noProject"), inc: 0, exp: 0 };
    if (t.type === "INCOME") row.inc += toVnd(t); else row.exp += toVnd(t);
    projMap.set(key, row);
  }
  const projectRows = [...projMap.values()].map((p) => ({ ...p, net: p.inc - p.exp })).sort((a, b) => b.net - a.net);

  // Tax review — kept apart from the P&L: an expense is in the books once
  // recorded, but deductible or VAT-claimable only once reviewed.
  const expenses = txns.filter((t) => t.type === "EXPENSE");
  // A reversal and the entry it cancels net to zero and need no further review.
  const cancelled = new Set(txns.flatMap((t) => (t.reversalOfId ? [t.reversalOfId, t.id] : [])));
  const live = (t: { id: string }) => !cancelled.has(t.id);
  const cit = Object.keys(CIT_STATUS).map((k) => [tc(`review.cit.${k}`), expenses.filter((t) => t.citStatus === k).reduce((a, t) => a + toVnd(t), 0)] as [string, number]);
  const vatClaimable: Totals = {};
  for (const t of expenses) if (t.vatStatus === "CLAIMABLE" && t.vatAmount) vatClaimable[t.currency] = (vatClaimable[t.currency] ?? 0) + t.vatAmount;
  const vatPending = expenses.filter((t) => live(t) && t.vatStatus === "PENDING").length;
  const docsOpen = DOC_OPEN.map((k) => {
    const rows = txns.filter((t) => live(t) && t.docStatus === k);
    return { key: k, label: tc(`review.doc.${k}`), count: rows.length, vnd: rows.reduce((a, t) => a + toVnd(t), 0) };
  }).filter((d) => d.count > 0);

  const short = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(intlLocale(locale), { timeZone: "UTC", month: "short", year: "2-digit" });
  const labels = months.map(short);
  const period = months.length === 1 ? fmtMonth(from, locale) : tr("period.range", { from: fmtMonth(from, locale), to: fmtMonth(to, locale) });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{tr("page.title")}</h1>
          <p className="text-muted-foreground mt-1">{tr("page.subtitle", { month: period })}</p>
          {drafts > 0 && (
            <Link href="/ledger?view=drafts" className="inline-block mt-2 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:underline">
              {tr("page.draftsNotIncluded", { count: drafts })}
            </Link>
          )}
          {rejected > 0 && (
            <Link href="/ledger?view=rejected" className="inline-block mt-2 ml-2 text-xs px-2 py-1 rounded bg-red-100 text-red-800 hover:underline">
              {tr("page.rejectedNotIncluded", { count: rejected })}
            </Link>
          )}
        </div>
        <PeriodPicker from={from} to={to} thisMonth={thisMonth} earliest={firstMonth} latest={lastMonth} min={MIN_MONTH} max={maxMonth} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-revenue)" }} />{tr("cards.income")}</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totalIncome)}</div>
            {months.length > 1 && <p className="text-xs text-muted-foreground mt-1">{tr("cards.perMonth", { amount: fmt(perMonth(totalIncome)) })}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "var(--chart-cost)" }} />{tr("cards.expenses")}</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totalExpense)}</div>
            {months.length > 1 && <p className="text-xs text-muted-foreground mt-1">{tr("cards.perMonth", { amount: fmt(perMonth(totalExpense)) })}</p>}
          </CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{tr("cards.netProfit")}</CardTitle>
            <TrendingUp className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(net)}</div>
            <p className="text-xs opacity-75 mt-1">
              {comparable
                ? tr("cards.vsPrevious", { arrow: delta >= 0 ? "▲" : "▼", amount: fmt(Math.abs(delta)), count: months.length })
                : tr("cards.noEarlier")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr("trend.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{tr("trend.subtitle")}</p>
        </CardHeader>
        <CardContent>
          <TrendChart labels={labels} revenue={pnl.revenue.perMonth} cost={pnl.cost.perMonth} net={pnl.net} locale={locale} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("detail.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{tr("detail.subtitle")}</p>
          {pnl.provisional > 0 && <p className="text-xs text-amber-800">{tr("detail.provisionalNote", { count: pnl.provisional })}</p>}
        </CardHeader>
        <CardContent className="p-0">
          <PnlTable pnl={pnl} labels={labels} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{tr("byProject.title")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{tr("byProject.project")}</TableHead>
                <TableHead className="text-right">{tr("byProject.income")}</TableHead>
                <TableHead className="text-right">{tr("byProject.expenses")}</TableHead>
                <TableHead className="text-right">{tr("byProject.net")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectRows.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{fmt(p.inc)}</TableCell>
                  <TableCell className="text-right">{fmt(p.exp)}</TableCell>
                  <TableCell className={`text-right font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{fmt(p.net)}</TableCell>
                </TableRow>
              ))}
              {projectRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">{tr("byProject.empty")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("tax.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{tr("tax.intro")}</p>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">{tr("tax.citTitle")}</p>
            <Lines rows={cit} total={totalExpense} color="text-foreground" emptyText={tr("lines.empty")} totalText={tr("lines.total")} />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">{tr("tax.inputVat")}</p>
              <div className="flex items-center justify-between text-sm">
                <span>{tr("tax.claimable")}</span>
                <span className="font-medium">{totalsList(vatClaimable).map(([c, v]) => fmtMoney(v, c)).join(" + ") || fmt(0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>{tr("tax.vatPending")}</span>
                <span className={`font-medium ${vatPending ? "text-amber-700" : ""}`}>{vatPending}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">{tr("tax.docsTitle")}</p>
              {docsOpen.map((d) => (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <span>{d.label} <span className="text-xs text-muted-foreground">· {tr("tax.entryCount", { count: d.count })}</span></span>
                  <span className={`font-medium ${d.key === "MISSING" ? "text-red-600" : "text-amber-700"}`}>{fmt(d.vnd)}</span>
                </div>
              ))}
              {docsOpen.length === 0 && <p className="text-sm text-muted-foreground">{tr("tax.allDocs")}</p>}
              {docsOpen.length > 0 && <Link href="/ledger?view=docs" className="text-xs text-primary hover:underline">{tr("tax.openLedger")}</Link>}
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportDownloads key={`${from}_${to}`} defaultFrom={`${from}-01`} defaultTo={new Date(+end - 86400000).toISOString().slice(0, 10)} />
    </div>
  );
}
