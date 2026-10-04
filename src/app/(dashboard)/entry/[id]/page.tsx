import { prisma } from "@/lib/prisma";
import { EntryForm } from "../entry-form";
import { redirect } from "next/navigation";
import { defaultUsdRate } from "@/lib/fx";
import { auth } from "@/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryStatus } from "@/components/ledger/entry-status";
import { STATUS_LABEL, TYPE_LABEL, fmtMoney } from "@/lib/money";
import { DOC_STATUS, PURPOSE_STATUS, CIT_STATUS, VAT_STATUS } from "@/lib/review";

const FIELD: Record<string, string> = {
  type: "Type", date: "Date", amount: "Amount", currency: "Currency", exchangeRate: "Rate", vndAmount: "VND settled",
  rateSource: "Rate source", accountId: "Account", loanId: "Loan", description: "Description", invoiceNumber: "Invoice #",
  categoryId: "Category", projectId: "Project", vendorId: "Vendor", docStatus: "Document", purposeStatus: "Business purpose",
  citStatus: "CIT", vatStatus: "Input VAT", vatAmount: "VAT amount", reviewNote: "Review note", status: "Status",
  bankLineId: "Bank line", invoice: "Invoice",
};
const ACTION: Record<string, string> = {
  CREATE: "Created", UPDATE: "Changed", REVIEW: "Approved", POST: "Posted", REVERSE: "Reversed", DELETE: "Deleted",
  MATCH: "Matched to a bank line", UNMATCH: "Unmatched from a bank line", LINK: "Linked", UNLINK: "Unlinked",
};

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, usdRate, accounts, categories, projects, vendors, transaction, history, allProjects] = await Promise.all([
    auth(),
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.transaction.findUnique({ where: { id }, include: { attachments: true, reversalOf: true, reversedBy: true } }),
    prisma.changeLog.findMany({ where: { entity: "Transaction", entityId: id }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);

  if (!transaction) {
    redirect("/ledger");
  }
  // Transfers, capital and loans are edited on the Accounts page.
  if (transaction.type !== "INCOME" && transaction.type !== "EXPENSE") {
    redirect("/accounts");
  }
  const correctionOf = transaction.correctionOfId
    ? await prisma.transaction.findUnique({ where: { id: transaction.correctionOfId } })
    : null;

  const ref = (t: { id: string; date: Date; amount: number; currency: string; description: string | null } | null) =>
    t ? { id: t.id, label: `${t.date.toISOString().slice(0, 10)} · ${fmtMoney(Math.abs(t.amount), t.currency)}${t.description ? ` · ${t.description}` : ""}` } : null;

  // History values are stored raw; show names and labels.
  const names: Record<string, Map<string, string>> = {
    accountId: new Map(accounts.map((a) => [a.id, a.name])),
    categoryId: new Map(categories.map((c) => [c.id, c.name])),
    projectId: new Map(allProjects.map((p) => [p.id, p.name])),
    vendorId: new Map(vendors.map((v) => [v.id, v.name])),
  };
  const labels: Record<string, Record<string, string>> = {
    status: STATUS_LABEL, type: TYPE_LABEL, docStatus: DOC_STATUS, purposeStatus: PURPOSE_STATUS, citStatus: CIT_STATUS, vatStatus: VAT_STATUS,
  };
  const show = (field: string | null, v: string | null) =>
    v === null ? "—" : field && names[field] ? names[field].get(v) ?? v : field && labels[field] ? labels[field][v] ?? v : v;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{transaction.status === "POSTED" ? "Posted Entry" : "Edit Entry"}</h1>
        <p className="text-muted-foreground mt-1">
          {transaction.createdBy ? `Entered by ${transaction.createdBy}` : "Update transaction details"}
        </p>
      </div>

      <EntryStatus
        id={transaction.id}
        status={transaction.status}
        isAdmin={session?.user?.role === "ADMIN"}
        reversalOf={ref(transaction.reversalOf)}
        reversedBy={ref(transaction.reversedBy)}
        correctionOf={ref(correctionOf)}
      />

      <EntryForm
        categories={categories}
        projects={projects}
        vendors={vendors}
        accounts={accounts}
        defaultUsdRate={usdRate}
        isAdmin={session?.user?.role === "ADMIN"}
        initialData={transaction}
        locked={transaction.status === "POSTED"}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="text-sm border-b last:border-0 pb-2">
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {ACTION[h.action] ?? h.action}{h.field && h.action !== "MATCH" && h.action !== "UNMATCH" ? ` · ${FIELD[h.field] ?? h.field}` : ""}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{h.user ? ` · ${h.user}` : ""}
                </span>
              </div>
              {h.action === "UPDATE" && (
                <p className="text-xs text-muted-foreground">{show(h.field, h.oldValue)} → <span className="text-foreground">{show(h.field, h.newValue)}</span></p>
              )}
              {(h.action === "CREATE" || h.action === "DELETE" || h.action === "LINK" || h.action === "UNLINK") && (
                <p className="text-xs text-muted-foreground">{h.newValue ?? h.oldValue}</p>
              )}
              {h.reason && <p className="text-xs">Reason: {h.reason}</p>}
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-muted-foreground">No changes recorded since history began (4 Oct 2026).</p>}
        </CardContent>
      </Card>
    </div>
  );
}
