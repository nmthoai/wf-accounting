import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "@/app/actions/ledger";
import { Trash2, Paperclip } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { TYPE_LABEL, RATE_SOURCE_LABEL, isPnl, isInflow, toVnd, fmtMoney, fmtVnd } from "@/lib/money";

const badge: Record<string, string> = {
  INCOME: "bg-green-100 text-green-700",
  EXPENSE: "bg-red-100 text-red-700",
  CAPITAL_IN: "bg-violet-100 text-violet-700",
  LOAN_IN: "bg-sky-100 text-sky-700",
  LOAN_REPAY: "bg-sky-100 text-sky-700",
  OTHER_IN: "bg-amber-100 text-amber-700",
  OTHER_OUT: "bg-amber-100 text-amber-700",
};

export default async function LedgerPage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: {
      category: true,
      attachments: true,
      invoice: true,
      project: true,
      account: true,
      allocations: { include: { invoice: { select: { number: true, direction: true } } } },
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
                <TableHead>Attachments</TableHead>
                <TableHead className="text-right">Amount (VND)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium whitespace-nowrap">{t.date.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge[t.type] ?? "bg-slate-200 text-slate-700"}`}>
                      {TYPE_LABEL[t.type] ?? t.type}
                    </span>
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
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <div className="flex flex-col items-end">
                      <span className={isInflow(t.type) ? "text-green-700" : ""}>
                        {isInflow(t.type) ? "+" : "−"}{fmtMoney(t.amount, t.currency)}
                      </span>
                      {t.currency !== "VND" && (
                        <span className="text-xs text-muted-foreground font-normal whitespace-nowrap">
                          {fmtVnd(toVnd(t))} · @{new Intl.NumberFormat("vi-VN").format(Math.round(t.exchangeRate * 100) / 100)}
                          {t.rateSource && ` ${RATE_SOURCE_LABEL[t.rateSource] ?? t.rateSource}`}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {/* Income/expense edit in the entry form; transfers, capital and loans on the Accounts page. */}
                      <Link href={isPnl(t.type) ? `/entry/${t.id}` : "/accounts"}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit-2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </Button>
                      </Link>
                      {isAdmin && (
                        <form action={deleteTransaction.bind(null, t.id)}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No transactions found. Click "New Entry" to add one.
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
