import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { vnTodayStart } from "@/lib/money";
import { taxFlags, latestReturns, parseLines, addQuarters, quarterOf, quarterRange, noteIsStale, type Flag } from "@/lib/tax";
import { TaxClient, type ReturnView, type FlagView } from "@/components/tax/tax-client";

// The declarations the accountant filed, as the owner records them: kept apart from
// the books and compared with them quarter by quarter. An internal record — not a
// declaration, not a statement of compliance (rules WF-DEV-10).
export default async function TaxPage() {
  const session = await requirePageSession();
  const t = await getTranslations("tax");
  if (session.user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-serif font-bold text-primary">{t("page.title")}</h1>
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("page.ownerOnly")}</CardContent></Card>
      </div>
    );
  }
  const locale = await getLocale();

  const [returns, income, bankOut, notes] = await Promise.all([
    prisma.taxReturn.findMany({ include: { files: { select: { id: true, fileName: true }, orderBy: { createdAt: "asc" } } } }),
    // The books, read for totals only: booked income by quarter, and where it was received.
    prisma.transaction.findMany({
      where: { type: "INCOME" },
      select: {
        id: true, date: true, type: true, status: true, amount: true, currency: true, exchangeRate: true, vndAmount: true, rateSource: true,
        reversalOfId: true, reversedBy: { select: { id: true } }, account: { select: { type: true } },
      },
    }),
    prisma.bankLine.findMany({ where: { amount: { lt: 0 } }, select: { txnDate: true, amount: true, description: true, counterparty: true } }),
    prisma.taxFlagNote.findMany(),
  ]);

  const rows = returns.map((r) => ({
    id: r.id, form: r.form, period: r.period, supplement: r.supplement, lines: parseLines(r.lines), filedDate: r.filedDate, dueDate: r.dueDate,
  }));
  const { flags, comparison } = taxFlags({
    returns: rows,
    income: income.map((x) => ({ ...x, accountType: x.account?.type ?? null, cancelled: !!x.reversalOfId || !!x.reversedBy })),
    bankOut: bankOut.map((b) => ({ date: b.txnDate, amount: b.amount, description: b.description, counterparty: b.counterparty })),
    today: vnTodayStart(),
  });

  const noteOf = new Map(notes.map((n) => [n.key, n]));
  const view = (f: Flag): FlagView => {
    const n = noteOf.get(f.key);
    if (!n) return { ...f, note: null, changedFrom: null };
    // A note made when the figure was different no longer settles the flag.
    const stale = noteIsStale(n.figure, f.figure, f.kind === "math" || f.kind === "creditChain");
    // The day the note was made, in Vietnam.
    const at = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(n.updatedAt);
    return { ...f, note: { text: n.note, user: n.user, at }, changedFrom: stale ? n.figure : null };
  };

  // Quarters: every one with a return, plus those the flags say are missing, newest first.
  const latest = latestReturns(rows);
  const periods = [...new Set([...rows.map((r) => r.period), ...flags.filter((f) => f.kind === "missingReturn").map((f) => f.period!)])]
    .sort((a, b) => +quarterRange(b).start - +quarterRange(a).start);
  const returnViews: ReturnView[] = returns.map((r) => ({
    id: r.id, form: r.form, period: r.period, template: r.template, supplement: r.supplement,
    filedDate: r.filedDate?.toISOString().slice(0, 10) ?? null, dueDate: r.dueDate?.toISOString().slice(0, 10) ?? null,
    submissionRef: r.submissionRef, preparedBy: r.preparedBy, notes: r.notes, lines: parseLines(r.lines),
    files: r.files.map((f) => ({ id: f.id, name: f.fileName, url: `/api/tax/files/${f.id}` })),
    latest: latest.get(`${r.form}|${r.period}`)?.id === r.id,
  }));

  return (
    <TaxClient
      flags={flags.map(view)}
      returns={returnViews}
      periods={periods}
      comparison={comparison}
      defaultPeriod={addQuarters(quarterOf(vnTodayStart()), -1)}
      locale={locale}
    />
  );
}
