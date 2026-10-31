import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/reports/month-picker";
import { CircleCheck, CircleHelp, Download, ListChecks, Paperclip, TrendingUp, TriangleAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { collect, currentMonth, isFutureMonth, openQuestions, summarize } from "@/lib/handover";
import { fmtMoney, fmtVnd, vnToday } from "@/lib/money";
import { fmtMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, Notice, PanelHead, Stat, StatStrip } from "@/components/wf/ledger-ui";
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
  const asked = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  // A month that hasn't started can't be handed over: show the current one and say so.
  const future = !!asked && isFutureMonth(asked);
  const month = future ? currentMonth() : asked ?? lastMonth();
  const data = await collect(month);
  const s = summarize(data);
  const open = openQuestions(data, locale, fmtMoney);
  const label = fmtMonth(month, locale);

  // What should be true before the package goes to the accountant.
  const checks = [
    { ok: s.drafts === 0, text: s.drafts === 0 ? t("page.checks.noDrafts") : t("page.checks.drafts", { count: s.drafts }), href: "/ledger?view=drafts" },
    ...(s.rejected > 0 ? [{ ok: false, text: t("page.checks.rejected", { count: s.rejected }), href: "/ledger?view=rejected" }] : []),
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
  for (const q of open) for (const a of new Set(q.issues.map((i) => i.area))) byArea.set(a, (byArea.get(a) ?? 0) + 1);
  const net = s.income - s.expense;

  return (
    <div>
      <PageHeader
        section="handover"
        title={t("page.title")}
        description={t("page.subtitle", { month: label })}
        actions={<MonthPicker month={month} basePath="/handover" max={currentMonth()} />}
      />

      {future && <Notice tone="warning" className="mb-6">{t("page.futureMonth", { month: fmtMonth(asked, locale), current: label })}</Notice>}

      <StatStrip className="lg:grid-cols-4">
        <Stat label={t("page.cards.entries")} icon={ListChecks} sub={t("page.cards.entriesDetail", { posted: s.posted, reviewed: s.reviewed, drafts: s.drafts })}>
          {s.entries}
        </Stat>
        <Stat label={t("page.cards.net")} icon={TrendingUp} tone={net >= 0 ? "info" : "neg"} emphasis sub={t("page.cards.netDetail", { income: fmtVnd(s.income), expense: fmtVnd(s.expense) })}>
          {fmtVnd(net)}
        </Stat>
        <Stat
          label={t("page.cards.questions")}
          icon={CircleHelp}
          tone={open.length > 0 ? "warn" : "neutral"}
          sub={[...byArea.entries()].map(([a, n]) => t("page.cards.areaCount", { count: n, area: a.toLowerCase() })).join(" · ") || t("page.cards.nothingOpen")}
        >
          {open.length}
        </Stat>
        <Stat label={t("page.cards.evidence")} icon={Paperclip} sub={t("page.cards.evidenceDetail")}>
          {s.evidence}
        </Stat>
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-5 lg:self-start">
          <PanelHead title={t("page.send.title")} />
          <p className="border-b border-border px-5 py-3 text-[13px] text-muted-foreground">{t("page.send.description")}</p>
          <ol className="wf-rows">
            {checks.map((c, i) => (
              <li key={c.text} className="p-0!">
                <Link href={c.href} className="flex w-full items-start gap-3 px-5 py-3 transition-colors duration-150 hover:bg-secondary/45">
                  <span className="wf-num w-5 shrink-0 pt-px text-[12px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {c.ok
                    ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-pos" aria-hidden="true" />
                    : <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />}
                  <span className={cn("min-w-0", c.ok ? "text-foreground" : "text-warn")}>{c.text}</span>
                </Link>
              </li>
            ))}
          </ol>
          <div className="border-t border-border p-5">
            <Button className="h-auto min-h-9 w-full py-2 leading-snug whitespace-normal" render={<a href={`/api/handover?month=${month}`} />} nativeButton={false}>
              <Download />{t("page.send.download", { month: label })}
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <PanelHead title={t("page.open.title")} count={open.length} />
          <p className="border-b border-border px-5 py-3 text-[13px] text-muted-foreground">{t("page.open.description", { sheet: t("sheets.openQuestions") })}</p>
          <ul className="wf-rows">
            {open.slice(0, 30).map((q, i) => (
              <li key={i} className="items-start">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {[...new Set(q.issues.map((x) => x.area))].map((a) => <Chip key={a} tone="warn" mono>{a}</Chip>)}
                    <span className="font-medium text-foreground">{q.item}</span>
                  </p>
                  {q.issues.map((x, j) => (
                    <span key={j} className="mt-1 block text-[12px] text-muted-foreground">{q.issues.length > 1 ? `${x.area}: ${x.detail}` : x.detail}</span>
                  ))}
                </div>
                <span className="wf-figure shrink-0">{q.amount}</span>
              </li>
            ))}
            {open.length > 30 && <li className="text-[12px] text-muted-foreground">{t("page.open.more", { count: open.length - 30 })}</li>}
            {open.length === 0 && <li className="text-muted-foreground">{t("page.open.none")}</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
