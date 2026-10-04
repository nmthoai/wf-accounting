import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Paperclip } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { TYPE_LABEL, RATE_SOURCE_LABEL, STATUS_LABEL, isPnl, isMoneyIn, toVnd, fmtMoney, fmtVnd } from "@/lib/money";
import { RowActions, PostThrough } from "@/components/ledger/ledger-actions";
import { DOC_STATUS, DOC_BADGE, DOC_OPEN, CIT_STATUS, VAT_STATUS } from "@/lib/review";

const badge: Record<string, string> = {
  INCOME: "bg-green-100 text-green-700",
  EXPENSE: "bg-red-100 text-red-700",
  CAPITAL_IN: "bg-violet-100 text-violet-700",
  LOAN_IN: "bg-sky-100 text-sky-700",
  LOAN_REPAY: "bg-sky-100 text-sky-700",
  OTHER_IN: "bg-amber-100 text-amber-700",
  OTHER_OUT: "bg-amber-100 text-amber-700",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-amber-100 text-amber-700",
  REVIEWED: "bg-blue-50 text-blue-700",
  POSTED: "bg-slate-200 text-slate-700",
};

// Entries cancelled by a reversal (and the reversals) need no further review.
const LIVE: Prisma.TransactionWhereInput = { reversalOfId: null, reversedBy: { is: null } };
// Review views: drafts waiting for the owner, entries whose invoice/receipt is
// still to be found, and expenses whose CIT or VAT treatment is undecided.
const VIEWS: Record<"drafts" | "docs" | "tax", Prisma.TransactionWhereInput> = {
  drafts: { status: "DRAFT" },
  docs: { type: { in: ["INCOME", "EXPENSE"] }, docStatus: { in: DOC_OPEN }, ...LIVE },
  tax: { type: "EXPENSE", OR: [{ citStatus: "PENDING" }, { vatStatus: "PENDING" }], ...LIVE },
};

// The last day of the previous month — the usual "post through" date.
function lastMonthEnd() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
}

const taxTone = (s: string, good: string) => (s === "PENDING" ? "text-amber-700" : s === good ? "text-green-700" : "text-muted-foreground");

export default async function LedgerPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view === "drafts" || sp.view === "docs" || sp.view === "tax" ? sp.view : null;
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const [draftCount, docsCount, taxCount, reviewedCount] = await Promise.all([
    prisma.transaction.count({ where: VIEWS.drafts }),
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Ledger</h1>
          <p className="text-muted-foreground mt-1">All recorded transactions</p>
        </div>
        <Link href="/entry">
          <Button>New Entry</Button>
        </Link>
      </div>

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm w-fit flex-wrap">
          {([[null, "All"], ["drafts", `Drafts (${draftCount})`], ["docs", `Documents to find (${docsCount})`], ["tax", `Tax review pending (${taxCount})`]] as const).map(([v, text]) => (
            <Link key={text} href={v ? `/ledger?view=${v}` : "/ledger"}
              className={`px-3 py-1 rounded-md font-medium transition-all ${view === v ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</Link>
          ))}
        </div>
        {isAdmin && <PostThrough defaultDate={lastMonthEnd()} reviewedCount={reviewedCount} />}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead className="text-right">Amount (VND)</TableHead>
                <TableHead className="w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium whitespace-nowrap">{t.date.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge[t.type] ?? "bg-slate-200 text-slate-700"}`}>
                        {TYPE_LABEL[t.type] ?? t.type}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${STATUS_BADGE[t.status] ?? ""}`}>
                        {STATUS_LABEL[t.status] ?? t.status}{t.reversalOfId ? " · reversal" : t.reversedBy ? " · reversed" : ""}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{t.account?.name ?? <span className="text-amber-700">— none —</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span>{isPnl(t.type) ? (t.category?.name || "Uncategorized") : <span className="text-muted-foreground">—</span>}</span>
                      {t.project && <span className="text-xs text-muted-foreground">{t.project.name}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="truncate" title={t.description || ""}>{t.description}</span>
                      {t.allocations.map((a) => (
                        <span key={a.id} className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700"
                          title={a.kind === "FEE" ? "Evidenced fee linked to this invoice/bill" : "Settles this invoice/bill — don't add a manual duplicate"}>
                          {a.kind === "FEE" ? "fee → " : "→ "}{a.invoice.number || (a.invoice.direction === "PAYABLE" ? "bill" : "invoice")}
                        </span>
                      ))}
                      {t.type === "INCOME" && t.allocations.length === 0 && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700" title="Not matched to any invoice yet — link it from the Invoices page">
                          not matched
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{t.invoiceNumber || "-"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 items-start">
                      {t.attachments.length > 0 ? (
                        <div className="flex gap-2">
                          {t.attachments.map(a => (
                            <a key={a.id} href={`/api/uploads/${a.filePath.split('/').pop()}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700" title={a.fileName}>
                              <Paperclip className="h-4 w-4" />
                            </a>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                      {t.bankLineId && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-green-50 text-green-700 border border-green-200" title="Matched to a bank statement line">
                          on statement
                        </span>
                      )}
                      {isPnl(t.type) && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${DOC_BADGE[t.docStatus] ?? ""}`} title={t.reviewNote ?? undefined}>
                          {DOC_STATUS[t.docStatus] ?? t.docStatus}
                        </span>
                      )}
                      {t.type === "EXPENSE" && (
                        <span className="text-[10px] whitespace-nowrap">
                          <span className={taxTone(t.citStatus, "DEDUCTIBLE")} title="CIT deductibility">CIT: {CIT_STATUS[t.citStatus] ?? t.citStatus}</span>
                          <span className="text-muted-foreground"> · </span>
                          <span className={taxTone(t.vatStatus, "CLAIMABLE")} title="Input VAT">
                            VAT: {VAT_STATUS[t.vatStatus] ?? t.vatStatus}{t.vatStatus === "CLAIMABLE" && t.vatAmount ? ` ${fmtMoney(t.vatAmount, t.currency)}` : ""}
                          </span>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <div className="flex flex-col items-end">
                      <span className={`${isMoneyIn(t) ? "text-green-700" : ""} ${t.reversedBy ? "line-through text-muted-foreground" : ""}`}>
                        {isMoneyIn(t) ? "+" : "−"}{fmtMoney(Math.abs(t.amount), t.currency)}
                      </span>
                      {t.currency !== "VND" && (
                        <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
                          {fmtVnd(Math.abs(toVnd(t)))} · @{new Intl.NumberFormat("vi-VN").format(Math.round(t.exchangeRate * 100) / 100)}
                          {t.rateSource && ` ${RATE_SOURCE_LABEL[t.rateSource] ?? t.rateSource}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {/* Income/expense open in the entry form; transfers, capital and loans on the Accounts page. */}
                    <RowActions id={t.id} href={isPnl(t.type) ? `/entry/${t.id}` : "/accounts"} status={t.status} isAdmin={isAdmin} />
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    {view ? "Nothing here — all clear." : 'No transactions found. Click "New Entry" to add one.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
