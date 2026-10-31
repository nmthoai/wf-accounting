import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PeriodPicker } from "@/components/reports/period-picker";
import { TrendChart } from "@/components/reports/trend-chart";
import { PnlTable } from "@/components/reports/pnl-table";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { TrendingUp, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { toVnd, fmtMoney, totalsList, BOOKED, vnToday, type Totals } from "@/lib/money";
import { DOC_OPEN, CIT_STATUS } from "@/lib/review";
import { fmtMonth } from "@/lib/format";
import { intlLocale } from "@/i18n/config";
import { MONTH, addMonths, monthsBetween, monthStart, buildPnl } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { Bar, Chip, DOC_TONE, PanelHead, Stat, StatStrip } from "@/components/wf/ledger-ui";

// Months the report accepts: typed years outside this range fall back to the default.
const MIN_MONTH = "2000-01";

// P&L counts income and expenses only — transfers, capital and loans are not
// profit — and only reviewed or posted entries; drafts wait for review.
const PNL = { type: { in: ["INCOME", "EXPENSE"] }, ...BOOKED };
const fmt = (n: number) => fmtMoney(n, "VND");

// One breakdown: each row's amount and share of the total as a bar, then the total.
function Lines({ rows, total, tone, emptyText, totalText }: {
  rows: [string, number][]; total: number; tone?: "pos" | "neg"; emptyText: string; totalText: string;
}) {
  return (
    <ul className="wf-rows">
      {rows.map(([name, amt]) => {
        const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
        return (
          <li key={name} className="block">
            {/* In a narrow panel the figures drop under the label rather than cut it. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 truncate text-foreground" title={name}>{name}</span>
              <span className="ml-auto flex shrink-0 items-baseline gap-3">
                <span className="wf-num text-[12px] text-muted-foreground">{pct}%</span>
                <span className="wf-figure">{fmt(amt)}</span>
              </span>
            </div>
            <Bar pct={pct} tone={tone} />
          </li>
        );
      })}
      {rows.length === 0 && <li className="text-muted-foreground">{emptyText}</li>}
      <li className="border-t-2 border-border-strong font-semibold text-foreground">
        <span>{totalText}</span>
        <span className={cn("wf-figure", tone === "pos" && "text-pos", tone === "neg" && "text-neg")}>{fmt(total)}</span>
      </li>
    </ul>
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
    <div>
      <PageHeader
        section="reports"
        title={tr("page.title")}
        description={tr("page.subtitle", { month: period })}
        meta={(drafts > 0 || rejected > 0) && (
          <>
            {drafts > 0 && (
              <Link href="/ledger?view=drafts" className="wf-chip wf-chip--warn wf-chip--dot">{tr("page.draftsNotIncluded", { count: drafts })}</Link>
            )}
            {rejected > 0 && (
              <Link href="/ledger?view=rejected" className="wf-chip wf-chip--neg wf-chip--dot">{tr("page.rejectedNotIncluded", { count: rejected })}</Link>
            )}
          </>
        )}
        actions={<PeriodPicker from={from} to={to} thisMonth={thisMonth} earliest={firstMonth} latest={lastMonth} min={MIN_MONTH} max={maxMonth} />}
      />

      <StatStrip className="lg:grid-cols-3">
        <Stat label={tr("cards.income")} icon={ArrowDownLeft} tone="pos"
          sub={months.length > 1 && tr("cards.perMonth", { amount: fmt(perMonth(totalIncome)) })}>
          {fmt(totalIncome)}
        </Stat>
        <Stat label={tr("cards.expenses")} icon={ArrowUpRight} tone="neg"
          sub={months.length > 1 && tr("cards.perMonth", { amount: fmt(perMonth(totalExpense)) })}>
          {fmt(totalExpense)}
        </Stat>
        <Stat label={tr("cards.netProfit")} icon={TrendingUp} tone={net >= 0 ? "info" : "neg"} emphasis
          sub={comparable
            ? <span className={delta >= 0 ? "text-pos" : "text-neg"}>{tr("cards.vsPrevious", { arrow: delta >= 0 ? "▲" : "▼", amount: fmt(Math.abs(delta)), count: months.length })}</span>
            : tr("cards.noEarlier")}>
          {fmt(net)}
        </Stat>
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <PanelHead title={tr("trend.title")} />
          <p className="border-b border-border px-5 py-3 text-[13px] text-muted-foreground">{tr("trend.subtitle")}</p>
          <CardContent>
            <TrendChart labels={labels} revenue={pnl.revenue.perMonth} cost={pnl.cost.perMonth} net={pnl.net} locale={locale} />
          </CardContent>
        </Card>

        <PnlTable pnl={pnl} labels={labels} className="lg:col-span-12" />

        <Card className="lg:col-span-12">
          <PanelHead title={tr("byProject.title")} count={projectRows.length} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr("byProject.project")}</TableHead>
                <TableHead className="text-right">{tr("byProject.income")}</TableHead>
                <TableHead className="text-right">{tr("byProject.expenses")}</TableHead>
                <TableHead className="text-right">{tr("byProject.net")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectRows.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-semibold text-foreground">{p.name}</TableCell>
                  <TableCell className="text-right text-pos">{fmt(p.inc)}</TableCell>
                  <TableCell className="text-right">{fmt(p.exp)}</TableCell>
                  <TableCell className={cn("text-right font-semibold", p.net >= 0 ? "text-primary" : "text-neg")}>{fmt(p.net)}</TableCell>
                </TableRow>
              ))}
              {projectRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{tr("byProject.empty")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="lg:col-span-8">
          <PanelHead title={tr("tax.title")} />
          <p className="border-b border-border px-5 py-3 text-[13px] text-muted-foreground">{tr("tax.intro")}</p>
          <div className="grid flex-1 md:grid-cols-2 md:divide-x md:divide-border">
            <section aria-labelledby="tax-cit">
              <p id="tax-cit" className="wf-label px-5 pt-4 pb-1">{tr("tax.citTitle")}</p>
              <Lines rows={cit} total={totalExpense} emptyText={tr("lines.empty")} totalText={tr("lines.total")} />
            </section>
            <div className="border-t border-border md:border-t-0">
              <section aria-labelledby="tax-vat">
                <p id="tax-vat" className="wf-label px-5 pt-4 pb-1">{tr("tax.inputVat")}</p>
                <ul className="wf-rows">
                  <li>
                    <span className="text-foreground">{tr("tax.claimable")}</span>
                    <span className="wf-figure">{totalsList(vatClaimable).map(([c, v]) => fmtMoney(v, c)).join(" + ") || fmt(0)}</span>
                  </li>
                  <li>
                    <span className="text-foreground">{tr("tax.vatPending")}</span>
                    <span className={cn("wf-figure", vatPending > 0 && "text-warn")}>{vatPending}</span>
                  </li>
                </ul>
              </section>
              <section aria-labelledby="tax-docs" className="border-t border-border">
                <p id="tax-docs" className="wf-label px-5 pt-4 pb-1">{tr("tax.docsTitle")}</p>
                <ul className="wf-rows">
                  {docsOpen.map((d) => (
                    // In a narrow panel the amount takes its own line instead of overlapping the chip.
                    <li key={d.label} className="flex-wrap">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Chip tone={DOC_TONE[d.key] ?? "neutral"}>{d.label}</Chip>
                        <span className="text-[12px] text-muted-foreground">{tr("tax.entryCount", { count: d.count })}</span>
                      </span>
                      <span className={cn("wf-figure ml-auto", d.key === "MISSING" && "text-neg")}>{fmt(d.vnd)}</span>
                    </li>
                  ))}
                  {docsOpen.length === 0 && <li className="text-muted-foreground">{tr("tax.allDocs")}</li>}
                  {docsOpen.length > 0 && (
                    <li>
                      <Link href="/ledger?view=docs" className="text-[13px] font-semibold text-primary hover:underline">{tr("tax.openLedger")}</Link>
                    </li>
                  )}
                </ul>
              </section>
            </div>
          </div>
        </Card>

        <ReportDownloads key={`${from}_${to}`} defaultFrom={`${from}-01`} defaultTo={new Date(+end - 86400000).toISOString().slice(0, 10)} className="lg:col-span-4" />
      </div>
    </div>
  );
}
