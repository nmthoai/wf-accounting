import { getTranslations, getLocale } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Paperclip, Plus } from "lucide-react";
import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { isPnl, isMoneyIn, toVnd, fmtMoney, fmtVnd, vnToday } from "@/lib/money";
import { RowActions, PostThrough } from "@/components/ledger/ledger-actions";
import { DOC_OPEN } from "@/lib/review";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, DOC_TONE, ENTRY_STATUS_TONE, ENTRY_TYPE_TONE } from "@/components/wf/ledger-ui";

// Entries cancelled by a reversal (and the reversals) need no further review.
const LIVE: Prisma.TransactionWhereInput = { reversalOfId: null, reversedBy: { is: null } };
// Review views: drafts waiting for the owner, entries the owner sent back for
// correction, entries whose invoice/receipt is still to be found, and expenses
// whose CIT or VAT treatment is undecided.
const VIEWS: Record<"drafts" | "rejected" | "docs" | "tax", Prisma.TransactionWhereInput> = {
  drafts: { status: "DRAFT" },
  rejected: { status: "REJECTED" },
  docs: { type: { in: ["INCOME", "EXPENSE"] }, docStatus: { in: DOC_OPEN }, ...LIVE },
  tax: { type: "EXPENSE", OR: [{ citStatus: "PENDING" }, { vatStatus: "PENDING" }], ...LIVE },
};

// The last day of the previous month — the usual "post through" date.
function lastMonthEnd() {
  const [y, m] = vnToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
}

const taxTone = (s: string, good: string) => (s === "PENDING" ? "text-warn" : s === good ? "text-pos" : "text-muted-foreground");

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "drafts" || sp.view === "rejected" || sp.view === "docs" || sp.view === "tax" ? sp.view : null;
  const session = await requirePageSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const tl = await getTranslations("ledger"); // `t` is a transaction below
  const tc = await getTranslations("common");
  const locale = await getLocale();
  // A stored code's label, or the code itself if it has none.
  const label = (key: string, raw: string) => (tc.has(key) ? tc(key) : raw);
  const [draftCount, rejectedCount, docsCount, taxCount, reviewedCount] = await Promise.all([
    prisma.transaction.count({ where: VIEWS.drafts }),
    prisma.transaction.count({ where: VIEWS.rejected }),
    prisma.transaction.count({ where: VIEWS.docs }),
    prisma.transaction.count({ where: VIEWS.tax }),
    prisma.transaction.count({ where: { status: "REVIEWED" } }),
  ]);
  const transactions = await prisma.transaction.findMany({
    where: view ? VIEWS[view] : undefined,
    orderBy: { date: "desc" },
    include: {
      category: true,
      attachments: true,
      invoice: true,
      project: true,
      account: true,
      allocations: { include: { invoice: { select: { number: true, direction: true } } } },
      reversedBy: { select: { id: true } },
    },
  });
  // Why each rejected entry was sent back: its latest rejection.
  const rejectedIds = transactions.filter((t) => t.status === "REJECTED").map((t) => t.id);
  const rejections = new Map<string, string>();
  if (rejectedIds.length) {
    const rows = await prisma.changeLog.findMany({ where: { action: "REJECT", entityId: { in: rejectedIds } }, orderBy: { createdAt: "desc" } });
    for (const r of rows) if (!rejections.has(r.entityId) && r.reason) rejections.set(r.entityId, r.reason);
  }

  const views = [
    [null, tl("tabs.all")],
    ["drafts", tl("tabs.drafts", { count: draftCount })],
    ["rejected", tl("tabs.rejected", { count: rejectedCount })],
    ["docs", tl("tabs.docs", { count: docsCount })],
    ["tax", tl("tabs.tax", { count: taxCount })],
  ] as const;

  return (
    <div>
      <PageHeader
        section="ledger"
        title={tl("page.title")}
        description={tl("page.subtitle")}
        actions={<Button render={<Link href="/entry" />} nativeButton={false}><Plus />{tl("page.newEntry")}</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="wf-seg" role="group" aria-label={tl("tabs.label")}>
          {views.map(([v, text]) => (
            <Link key={v ?? "all"} href={v ? `/ledger?view=${v}` : "/ledger"} aria-current={view === v ? "page" : undefined}>{text}</Link>
          ))}
        </div>
        {isAdmin && <PostThrough defaultDate={lastMonthEnd()} reviewedCount={reviewedCount} />}
      </div>

      {/* Below 2xl the account and invoice number fold under the date and the
          description, so the amount and the actions stay in view. */}
      <Card className="mt-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tl("table.date")}</TableHead>
              <TableHead>{tl("table.type")}</TableHead>
              <TableHead className="hidden 2xl:table-cell">{tl("table.account")}</TableHead>
              <TableHead>{tl("table.category")}</TableHead>
              <TableHead>{tl("table.description")}</TableHead>
              <TableHead className="hidden 2xl:table-cell">{tl("table.invoiceNumber")}</TableHead>
              <TableHead>{tl("table.evidence")}</TableHead>
              <TableHead className="text-right">{tl("table.amountVnd")}</TableHead>
              <TableHead><span className="sr-only">{tl("table.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((t) => {
              const moneyIn = isMoneyIn(t);
              const statusText = t.reversalOfId ? tl("row.reversal", { status: label(`status.${t.status}`, t.status) })
                : t.reversedBy ? tl("row.reversed", { status: label(`status.${t.status}`, t.status) })
                : label(`status.${t.status}`, t.status);
              const account = t.account?.name ?? <span className="text-warn">{tl("row.noAccount")}</span>;
              const unmatched = t.type === "INCOME" && t.allocations.length === 0;
              const hasEvidence = isPnl(t.type) || !!t.bankLineId || t.attachments.length > 0;
              return (
                <TableRow
                  key={t.id}
                  className={cn("[&>td]:py-3 [&>td]:align-top", t.status === "DRAFT" && "bg-warn/4", t.status === "REJECTED" && "bg-neg/4")}
                >
                  <TableCell>
                    <span className="wf-num text-foreground">{fmtDate(t.date, locale)}</span>
                    <span className="block text-[12px] text-muted-foreground 2xl:hidden">{account}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1.5">
                      <Chip tone={ENTRY_TYPE_TONE[t.type] ?? "neutral"}>{label(`type.${t.type}`, t.type)}</Chip>
                      <Chip tone={ENTRY_STATUS_TONE[t.status] ?? "neutral"} mono dot>{statusText}</Chip>
                      {rejections.has(t.id) && (
                        <span className="max-w-[14rem] text-[12px] leading-snug whitespace-normal text-neg">
                          {tl("row.rejectedReason", { reason: rejections.get(t.id)! })}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell">{account}</TableCell>
                  <TableCell className="min-w-[8rem] whitespace-normal">
                    {isPnl(t.type)
                      ? <span className="text-foreground">{t.category?.name || tl("row.uncategorized")}</span>
                      : <span className="text-muted-foreground">—</span>}
                    {t.project && <span className="block text-[12px] text-muted-foreground">{t.project.name}</span>}
                  </TableCell>
                  <TableCell className="min-w-[12rem] whitespace-normal">
                    <span className="text-foreground [overflow-wrap:anywhere]">{t.description}</span>
                    {(t.allocations.length > 0 || unmatched) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {t.allocations.map((a) => (
                          <Chip key={a.id} tone="info" title={a.kind === "FEE" ? tl("row.feeTitle") : tl("row.settlesTitle")}>
                            {tl(a.kind === "FEE" ? "row.feeLink" : "row.settlesLink", { ref: a.invoice.number || (a.invoice.direction === "PAYABLE" ? tl("row.bill") : tl("row.invoice")) })}
                          </Chip>
                        ))}
                        {unmatched && <Chip tone="warn" title={tl("row.notMatchedTitle")}>{tl("row.notMatched")}</Chip>}
                      </div>
                    )}
                    {t.invoiceNumber && (
                      <span className="mt-1 block text-[12px] text-muted-foreground 2xl:hidden">
                        {tl("table.invoiceNumber")} <span className="wf-num">{t.invoiceNumber}</span>
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden 2xl:table-cell">
                    {t.invoiceNumber ? <span className="wf-num">{t.invoiceNumber}</span> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {hasEvidence ? (
                      <div className="flex flex-col items-start gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isPnl(t.type) && (
                            <Chip tone={DOC_TONE[t.docStatus] ?? "neutral"} title={t.reviewNote ?? undefined}>
                              {label(`review.doc.${t.docStatus}`, t.docStatus)}
                            </Chip>
                          )}
                          {t.bankLineId && <Chip tone="info" title={tl("row.onStatementTitle")}>{tl("row.onStatement")}</Chip>}
                          {t.attachments.map((a) => (
                            <a key={a.id} href={`/api/uploads/${a.filePath.split("/").pop()}`} target="_blank" rel="noreferrer"
                              className="text-primary transition-colors duration-150 hover:text-primary-hover" title={a.fileName} aria-label={a.fileName}>
                              <Paperclip className="size-4" aria-hidden="true" />
                            </a>
                          ))}
                        </div>
                        {t.type === "EXPENSE" && (
                          <div className="text-[12px] leading-snug">
                            <span className={cn("block", taxTone(t.citStatus, "DEDUCTIBLE"))} title={tl("row.citTitle")}>
                              {tl("row.cit", { status: label(`review.cit.${t.citStatus}`, t.citStatus) })}
                            </span>
                            <span className={cn("block", taxTone(t.vatStatus, "CLAIMABLE"))} title={tl("row.vatTitle")}>
                              {t.vatStatus === "CLAIMABLE" && t.vatAmount
                                ? tl("row.vatWithAmount", { status: label(`review.vat.${t.vatStatus}`, t.vatStatus), amount: fmtMoney(t.vatAmount, t.currency) })
                                : tl("row.vat", { status: label(`review.vat.${t.vatStatus}`, t.vatStatus) })}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn("wf-figure", moneyIn && "text-pos", t.reversedBy && "text-muted-foreground line-through")}>
                      {moneyIn ? "+" : "−"}{fmtMoney(Math.abs(t.amount), t.currency)}
                    </span>
                    {t.currency !== "VND" && (
                      <>
                        <span className="block text-[12px] text-muted-foreground">{fmtVnd(Math.abs(toVnd(t)))}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          @{new Intl.NumberFormat("vi-VN").format(Math.round(t.exchangeRate * 100) / 100)}
                          {t.rateSource && ` ${label(`rateSource.${t.rateSource}`, t.rateSource)}`}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* Income/expense open in the entry form; transfers, capital and loans on the Accounts page. */}
                    <RowActions id={t.id} href={isPnl(t.type) ? `/entry/${t.id}` : "/accounts"} status={t.status} isAdmin={isAdmin} />
                  </TableCell>
                </TableRow>
              );
            })}
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {view ? tl("page.emptyView") : tl("page.empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
