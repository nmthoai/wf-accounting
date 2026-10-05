import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/reports/month-picker";
import { Download, CheckCircle2, AlertTriangle } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { collect, questions, summarize } from "@/lib/handover";
import { fmtMoney, fmtVnd, vnToday } from "@/lib/money";
import { fmtMonth } from "@/lib/format";
import type { Locale } from "@/i18n/config";

// Last month by default — the one usually being handed over.
function lastMonth() {
  const [y, m] = vnToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
}

export default async function HandoverPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requirePageSession(); // second line behind the proxy
  const t = await getTranslations("handover");
  const locale = (await getLocale()) as Locale;
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : lastMonth();
  const data = await collect(month);
  const s = summarize(data);
  const open = questions(data, locale);
  const label = fmtMonth(month, locale);

  // What should be true before the package goes to the accountant.
  const checks = [
    { ok: s.drafts === 0, text: s.drafts === 0 ? t("page.checks.noDrafts") : t("page.checks.drafts", { count: s.drafts }), href: "/ledger?view=drafts" },
    { ok: s.reviewed === 0, text: s.reviewed === 0 ? t("page.checks.allPosted") : t("page.checks.notPosted", { count: s.reviewed }), href: "/ledger" },
    ...s.bank.map((b) => ({
      ok: b.covered && b.agrees && b.open === 0,
      text: !b.covered ? t("page.checks.bankNoStatement", { name: b.name })
        : b.agrees && b.open === 0 ? t("page.checks.bankAgrees", { name: b.name, closing: fmtMoney(b.closing, b.currency) })
          : t("page.checks.bankDiffers", { name: b.name, closing: fmtMoney(b.closing, b.currency), app: fmtMoney(b.app, b.currency), open: b.open }),
      href: "/bank",
    })),
    { ok: s.missingDocs === 0, text: s.missingDocs === 0 ? t("page.checks.allDocs") : t("page.checks.missingDocs", { count: s.missingDocs }), href: "/ledger?view=docs" },
  ];
  const byArea = new Map<string, number>();
  for (const q of open) byArea.set(q.area, (byArea.get(q.area) ?? 0) + 1);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{t("page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.subtitle", { month: label })}</p>
        </div>
        <MonthPicker month={month} basePath="/handover" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("page.cards.entries")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.entries}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("page.cards.entriesDetail", { posted: s.posted, reviewed: s.reviewed, drafts: s.drafts })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("page.cards.net")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtVnd(s.income - s.expense)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("page.cards.netDetail", { income: fmtVnd(s.income), expense: fmtVnd(s.expense) })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("page.cards.questions")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{open.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{[...byArea.entries()].map(([a, n]) => t("page.cards.areaCount", { count: n, area: a.toLowerCase() })).join(" · ") || t("page.cards.nothingOpen")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("page.cards.evidence")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.evidence}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("page.cards.evidenceDetail")}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.send.title")}</CardTitle>
          <CardDescription>{t("page.send.description")}</CardDescription>
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
              <Button className="gap-2"><Download className="h-4 w-4" />{t("page.send.download", { month: label })}</Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.open.title")}</CardTitle>
          <CardDescription>{t("page.open.description", { sheet: t("sheets.openQuestions") })}</CardDescription>
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
          {open.length > 30 && <p className="text-xs text-muted-foreground">{t("page.open.more", { count: open.length - 30 })}</p>}
          {open.length === 0 && <p className="text-sm text-muted-foreground">{t("page.open.none")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
