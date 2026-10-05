import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthPicker } from "@/components/reports/month-picker";
import { ReportDownloads } from "@/components/reports/report-downloads";
import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react";
import Link from "next/link";
import { toVnd, fmtMoney, totalsList, BOOKED, vnToday, type Totals } from "@/lib/money";
import { DOC_STATUS, DOC_OPEN, CIT_STATUS } from "@/lib/review";

// P&L counts income and expenses only — transfers, capital and loans are not
// profit — and only reviewed or posted entries; drafts wait for review.
const PNL = { type: { in: ["INCOME", "EXPENSE"] }, ...BOOKED };
const fmt = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
    prevStart: new Date(Date.UTC(y, m - 2, 1)),
  };
}

function byCategory(txns: { type: string; amount: number; exchangeRate: number; vndAmount: number | null; category: { name: string } | null }[], type: string) {
  const map = new Map<string, number>();
  for (const t of txns.filter((x) => x.type === type)) {
    const key = t.category?.name || "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + toVnd(t));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePageSession(); // second line behind the proxy
  const sp = await searchParams;
  const now = new Date();
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month)
    ? sp.month
    : vnToday().slice(0, 7);
  const { start, end, prevStart } = monthBounds(month);

  const [txns, prevTxns, drafts] = await Promise.all([
    prisma.transaction.findMany({ where: { ...PNL, date: { gte: start, lt: end } }, include: { category: true, project: true } }),
    prisma.transaction.findMany({ where: { ...PNL, date: { gte: prevStart, lt: start } }, select: { type: true, amount: true, exchangeRate: true, vndAmount: true } }),
    prisma.transaction.count({ where: { type: { in: ["INCOME", "EXPENSE"] }, status: "DRAFT", date: { gte: start, lt: end } } }),
  ]);

  // Per-project breakdown for the month
  const projMap = new Map<string, { name: string; inc: number; exp: number }>();
  for (const t of txns) {
    const key = t.projectId ?? "__none__";
    const row = projMap.get(key) ?? { name: t.project?.name ?? "(No project)", inc: 0, exp: 0 };
    if (t.type === "INCOME") row.inc += toVnd(t); else row.exp += toVnd(t);
    projMap.set(key, row);
  }
  const projectRows = [...projMap.values()].map((p) => ({ ...p, net: p.inc - p.exp })).sort((a, b) => b.net - a.net);

  const income = byCategory(txns, "INCOME");
  const expense = byCategory(txns, "EXPENSE");
  const totalIncome = income.reduce((a, [, v]) => a + v, 0);
  const totalExpense = expense.reduce((a, [, v]) => a + v, 0);
  const net = totalIncome - totalExpense;

  // Tax review — kept apart from the P&L: an expense is in the books once
  // recorded, but deductible or VAT-claimable only once reviewed.
  const expenses = txns.filter((t) => t.type === "EXPENSE");
  // A reversal and the entry it cancels net to zero and need no further review.
  const cancelled = new Set(txns.flatMap((t) => (t.reversalOfId ? [t.reversalOfId, t.id] : [])));
  const live = (t: { id: string }) => !cancelled.has(t.id);
  const cit = Object.keys(CIT_STATUS).map((k) => [CIT_STATUS[k], expenses.filter((t) => t.citStatus === k).reduce((a, t) => a + toVnd(t), 0)] as [string, number]);
  const vatClaimable: Totals = {};
  for (const t of expenses) if (t.vatStatus === "CLAIMABLE" && t.vatAmount) vatClaimable[t.currency] = (vatClaimable[t.currency] ?? 0) + t.vatAmount;
  const vatPending = expenses.filter((t) => live(t) && t.vatStatus === "PENDING").length;
  const docsOpen = DOC_OPEN.map((k) => {
    const rows = txns.filter((t) => live(t) && t.docStatus === k);
    return { label: DOC_STATUS[k], count: rows.length, vnd: rows.reduce((a, t) => a + toVnd(t), 0) };
  }).filter((d) => d.count > 0);

  const prevNet =
    prevTxns.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0) -
    prevTxns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const delta = net - prevNet;

  const label = new Date(start).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  // Defaults for the Excel export range: year-to-date.
  const exportFrom = `${vnToday().slice(0, 4)}-01-01`;
  const exportTo = now.toISOString().slice(0, 10);

  const Lines = ({ rows, total, color }: { rows: [string, number][]; total: number; color: string }) => (
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
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No entries this month.</p>}
      <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
        <span>Total</span><span className={color}>{fmt(total)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Profit &amp; Loss</h1>
          <p className="text-muted-foreground mt-1">{label} · cash-basis (paid income &amp; expenses) · reviewed and posted entries</p>
          {drafts > 0 && (
            <Link href="/ledger?view=drafts" className="inline-block mt-2 text-xs px-2 py-1 rounded bg-amber-100 text-amber-800 hover:underline">
              {drafts} draft {drafts === 1 ? "entry" : "entries"} this month not included — waiting for review →
            </Link>
          )}
        </div>
        <MonthPicker month={month} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{fmt(totalIncome)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expenses</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{fmt(totalExpense)}</div></CardContent>
        </Card>
        <Card className="bg-primary text-primary-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 opacity-75" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(net)}</div>
            <p className="text-xs opacity-75 mt-1">
              {delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))} vs last month
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-green-700">Income by category</CardTitle></CardHeader>
          <CardContent><Lines rows={income} total={totalIncome} color="text-green-700" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-red-700">Expenses by category</CardTitle></CardHeader>
          <CardContent><Lines rows={expense} total={totalExpense} color="text-red-600" /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Profit by project</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectRows.map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right text-green-600">{fmt(p.inc)}</TableCell>
                  <TableCell className="text-right text-red-600">{fmt(p.exp)}</TableCell>
                  <TableCell className={`text-right font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{fmt(p.net)}</TableCell>
                </TableRow>
              ))}
              {projectRows.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground">No entries this month.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax review</CardTitle>
          <p className="text-sm text-muted-foreground">Kept apart from the P&amp;L: recording an expense doesn&apos;t make it deductible or its VAT claimable. These are the decisions recorded so far.</p>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">CIT deductibility of this month&apos;s expenses</p>
            <Lines rows={cit} total={totalExpense} color="text-foreground" />
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Input VAT</p>
              <div className="flex items-center justify-between text-sm">
                <span>Claimable (invoice on file)</span>
                <span className="font-medium">{totalsList(vatClaimable).map(([c, v]) => fmtMoney(v, c)).join(" + ") || fmt(0)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Expenses with VAT not yet reviewed</span>
                <span className={`font-medium ${vatPending ? "text-amber-700" : ""}`}>{vatPending}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Documents still to find</p>
              {docsOpen.map((d) => (
                <div key={d.label} className="flex items-center justify-between text-sm">
                  <span>{d.label} <span className="text-xs text-muted-foreground">· {d.count} {d.count === 1 ? "entry" : "entries"}</span></span>
                  <span className={`font-medium ${d.label === DOC_STATUS.MISSING ? "text-red-600" : "text-amber-700"}`}>{fmt(d.vnd)}</span>
                </div>
              ))}
              {docsOpen.length === 0 && <p className="text-sm text-muted-foreground">Every entry this month has its invoice or receipt.</p>}
              {docsOpen.length > 0 && <Link href="/ledger?view=docs" className="text-xs text-primary hover:underline">Open in the ledger →</Link>}
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportDownloads defaultFrom={exportFrom} defaultTo={exportTo} />
    </div>
  );
}
