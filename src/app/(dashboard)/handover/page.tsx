import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/reports/month-picker";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { collect, questions, summarize } from "@/lib/handover";
import { fmtMoney, fmtVnd, vnToday } from "@/lib/money";

// Last month by default — the one usually being handed over.
function lastMonth() {
  const [y, m] = vnToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePageSession(); // second line behind the proxy
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : lastMonth();
  const data = await collect(month);
  const s = summarize(data);
  const open = questions(data);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  // What should be true before the package goes to the accountant.
  const checks = [
    { ok: s.drafts === 0, text: s.drafts === 0 ? "No drafts waiting for review" : `${s.drafts} draft ${s.drafts === 1 ? "entry" : "entries"} not reviewed — excluded from the figures`, href: "/ledger?view=drafts" },
    { ok: s.reviewed === 0, text: s.reviewed === 0 ? "Every reviewed entry is posted" : `${s.reviewed} reviewed ${s.reviewed === 1 ? "entry is" : "entries are"} not posted yet — post the month from the ledger`, href: "/ledger" },
    ...s.bank.map((b) => ({
      ok: b.covered && b.agrees && b.open === 0,
      text: !b.covered ? `${b.name}: no bank statement imported for this month`
        : b.agrees && b.open === 0 ? `${b.name}: statement and app agree (${fmtMoney(b.closing, b.currency)})`
          : `${b.name}: statement ${fmtMoney(b.closing, b.currency)} vs app ${fmtMoney(b.app, b.currency)} · ${b.open} lines to reconcile`,
      href: "/bank",
    })),
    { ok: s.missingDocs === 0, text: s.missingDocs === 0 ? "Every entry has its document" : `${s.missingDocs} ${s.missingDocs === 1 ? "entry" : "entries"} still missing documents`, href: "/ledger?view=docs" },
  ];
  const byArea = new Map<string, number>();
  for (const q of open) byArea.set(q.area, (byArea.get(q.area) ?? 0) + 1);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Accountant handover</h1>
          <p className="text-muted-foreground mt-1">{label} · ledger, invoices, bank reconciliation, missing documents and open questions — with the evidence</p>
        </div>
        <MonthPicker month={month} basePath="/handover" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Entries</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.entries}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.posted} posted · {s.reviewed} reviewed · {s.drafts} drafts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Income − expenses</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtVnd(s.income - s.expense)}</div>
            <p className="text-xs text-muted-foreground mt-1">{fmtVnd(s.income)} in · {fmtVnd(s.expense)} out</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Open questions</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{open.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{[...byArea.entries()].map(([a, n]) => `${n} ${a.toLowerCase()}`).join(" · ") || "Nothing open"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Evidence files</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.evidence}</div>
            <p className="text-xs text-muted-foreground mt-1">Included in the package, linked from each entry</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Before you send it</CardTitle>
          <CardDescription>The package can go at any time; these show what the accountant will see as open.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {checks.map((c) => (
            <Link key={c.text} href={c.href} className="flex items-center gap-2 text-sm hover:underline">
              {c.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />}
              <span className={c.ok ? "" : "text-amber-800"}>{c.text}</span>
            </Link>
          ))}
          <div className="pt-4">
            <a href={`/api/handover?month=${month}`}>
              <Button className="gap-2"><Download className="h-4 w-4" />Download {label} package (.zip)</Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open questions in the package</CardTitle>
          <CardDescription>Also listed in the workbook&apos;s &ldquo;Open questions&rdquo; sheet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {open.slice(0, 30).map((q, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-sm border-b last:border-0 pb-2">
              <div className="min-w-0">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 mr-2">{q.area}</span>
                <span className="font-medium">{q.item}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{q.detail}</p>
              </div>
              <span className="text-xs whitespace-nowrap">{q.amount}</span>
            </div>
          ))}
          {open.length > 30 && <p className="text-xs text-muted-foreground">…and {open.length - 30} more in the package.</p>}
          {open.length === 0 && <p className="text-sm text-muted-foreground">Nothing open for this month.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
