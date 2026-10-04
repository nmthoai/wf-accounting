"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Plus, Loader2, Ban, Trash2, AlertTriangle, Paperclip, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import { createInvoice, voidInvoice, deleteInvoice, unlinkAllocation } from "@/app/actions/invoices";
import { uploadProblem } from "@/lib/upload-limit";
import { EditInvoiceDialog } from "@/components/invoices/edit-invoice-dialog";
import { RecordPaymentDialog, LinkEntryDialog, type Candidate } from "@/components/invoices/payment-dialogs";
import type { AccountOpt } from "@/components/accounts/account-select";
import { EPS, fmtMoney, fmtVnd, totalsList, type Totals } from "@/lib/money";

type Invoice = {
  id: string; number: string | null; direction: string; party: string | null; projectName: string | null; categoryName: string | null;
  clientId: string | null; vendorId: string | null; projectId: string | null; categoryId: string | null; notes: string | null;
  issueDate: string; dueDate: string; paidDate: string | null;
  currency: string; amount: number; status: string; overdue: boolean; attachment: string | null;
  received: number; fees: number; difference: number;
  allocations: { id: string; kind: string; amount: number; date: string; accountName: string; description: string | null }[];
};
type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };

// One line per currency — currencies are never added together.
const Totals = ({ t, className }: { t: Totals; className: string }) => {
  const lines = totalsList(t);
  if (lines.length === 0) return <div className={className}>{fmtVnd(0)}</div>;
  return <>{lines.map(([c, v]) => <div key={c} className={className}>{fmtMoney(v, c)}</div>)}</>;
};
const totalsText = (t: Totals) => totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ");

export function InvoicesClient({
  invoices, clients, vendors, projects, categories, accounts, candidates, defaultUsdRate, summary,
}: {
  invoices: Invoice[]; clients: Opt[]; vendors: Opt[]; projects: Opt[]; categories: Cat[]; accounts: AccountOpt[];
  candidates: Candidate[]; defaultUsdRate: number;
  summary: { ar: Totals; ap: Totals; arOverdue: Totals; apOverdue: Totals };
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [partyId, setPartyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const parties = direction === "PAYABLE" ? vendors : clients;
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = openOnly ? invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL") : invoices;
  // Receivables become income; payables become an expense — show the matching categories.
  const cats = categories.filter((c) => c.type === (direction === "PAYABLE" ? "EXPENSE" : "INCOME"));

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try {
      const res = await fn();
      if (!res.success && res.message) alert(res.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tooBig = uploadProblem(fd.getAll("files") as File[]);
    if (tooBig) { setErr(tooBig); return; }
    setCreating(true);
    setErr("");
    fd.set("direction", direction);
    fd.set("clientId", direction === "RECEIVABLE" ? partyId : "");
    fd.set("vendorId", direction === "PAYABLE" ? partyId : "");
    fd.set("projectId", projectId);
    fd.set("categoryId", categoryId);
    fd.set("currency", currency);
    try {
      const res = await createInvoice(fd);
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      form.reset();
      setPartyId(""); setProjectId(""); setCategoryId(""); setCurrency("VND"); setShowForm(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  function statusBadge(i: Invoice) {
    if (i.overdue) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Overdue</span>;
    const map: Record<string, string> = {
      OPEN: "bg-amber-100 text-amber-700", PARTIAL: "bg-orange-100 text-orange-700",
      PAID: "bg-green-100 text-green-700", VOID: "bg-gray-100 text-gray-400 line-through",
    };
    const text: Record<string, string> = { OPEN: "Open", PARTIAL: "Part paid", PAID: "Paid", VOID: "Void" };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[i.status] || ""}`}>{text[i.status] ?? i.status}</span>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-green-600" />Owed to you (AR)</CardTitle></CardHeader>
          <CardContent>
            <Totals t={summary.ar} className="text-2xl font-bold text-green-600" />
            <p className="text-xs text-muted-foreground mt-1">{totalsList(summary.arOverdue).length > 0 ? <span className="text-red-600">{totalsText(summary.arOverdue)} overdue</span> : "Nothing overdue"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-600" />You owe (AP)</CardTitle></CardHeader>
          <CardContent>
            <Totals t={summary.ap} className="text-2xl font-bold text-red-600" />
            <p className="text-xs text-muted-foreground mt-1">{totalsList(summary.apOverdue).length > 0 ? <span className="text-red-600">{totalsText(summary.apOverdue)} overdue</span> : "Nothing overdue"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          <button type="button" onClick={() => setOpenOnly(false)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${!openOnly ? "bg-white shadow-sm" : "text-muted-foreground"}`}>All</button>
          <button type="button" onClick={() => setOpenOnly(true)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${openOnly ? "bg-white shadow-sm" : "text-muted-foreground"}`}>Open only</button>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="gap-2"><Plus className="h-4 w-4" />{showForm ? "Close" : "New invoice / bill"}</Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex bg-muted p-1 rounded-lg">
                <button type="button" onClick={() => { setDirection("RECEIVABLE"); setPartyId(""); setCategoryId(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${direction === "RECEIVABLE" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
                  Receivable — a client owes me
                </button>
                <button type="button" onClick={() => { setDirection("PAYABLE"); setPartyId(""); setCategoryId(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${direction === "PAYABLE" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
                  Payable — I owe a vendor
                </button>
              </div>

              <div className="space-y-2">
                <Label>{direction === "PAYABLE" ? "Vendor" : "Client"}</Label>
                <Select value={partyId} onValueChange={(v) => setPartyId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">Select {direction === "PAYABLE" ? "vendor" : "client"}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    {parties.length === 0 && <SelectItem value="empty" disabled>Add one in Projects first</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project (optional)</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">No project</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{categoryId ? <span>{cats.find(c => c.id === categoryId)?.name}</span> : <span className="text-muted-foreground">No category</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {cats.length === 0 && <SelectItem value="empty" disabled>Add {direction === "PAYABLE" ? "expense" : "income"} categories in Settings</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="number">Invoice/bill number (optional)</Label>
                <Input id="number" name="number" placeholder="from the PDF" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="amount">Amount</Label>
                  <div className="flex bg-muted p-0.5 rounded text-xs font-medium">
                    <span onClick={() => setCurrency("VND")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "VND" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>VND</span>
                    <span onClick={() => setCurrency("USD")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "USD" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>USD</span>
                  </div>
                </div>
                <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required />
                {currency === "USD" && <p className="text-xs text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">Issue date</Label>
                <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due date</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input id="notes" name="notes" placeholder="Work / terms…" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="files">Attach the PDF (optional)</Label>
                <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf" />
              </div>
              {err && <p className="text-sm text-destructive md:col-span-2">{err}</p>}
              <Button type="submit" disabled={creating} className="md:col-span-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 divide-y">
          {shown.map((i) => (
            <div key={i.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col min-w-[180px]">
                <span className="text-sm font-medium flex items-center gap-2">
                  {i.direction === "PAYABLE"
                    ? <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                    : <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />}
                  {i.number || (i.direction === "PAYABLE" ? "Bill" : "Invoice")} {statusBadge(i)}
                  {i.attachment && <a href={`/api/uploads/${i.attachment.split('/').pop()}`} target="_blank" rel="noreferrer" className="text-blue-500" title="View PDF"><Paperclip className="h-3.5 w-3.5" /></a>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[i.party, i.projectName, i.categoryName].filter(Boolean).join(" · ") || "—"} · due {i.dueDate}
                  {i.paidDate && ` · paid ${i.paidDate}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`text-sm font-semibold ${i.direction === "PAYABLE" ? "text-red-600" : "text-green-700"}`}>{fmtMoney(i.amount, i.currency)}</div>
                  {i.allocations.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {i.direction === "PAYABLE" ? "paid" : "received"} {fmtMoney(i.received, i.currency)}
                      {i.fees > EPS && ` · fees ${fmtMoney(i.fees, i.currency)}`}
                    </div>
                  )}
                  {i.allocations.length > 0 && i.difference > EPS && i.status !== "VOID" && (
                    <div className="text-xs font-medium text-amber-700" title="Gross minus payments and evidenced fees. Not assumed to be a fee.">
                      unmatched difference {fmtMoney(i.difference, i.currency)}
                    </div>
                  )}
                  {i.difference < -EPS && <div className="text-xs font-medium text-red-600">overpaid by {fmtMoney(-i.difference, i.currency)}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {i.status !== "VOID" && (
                    <EditInvoiceDialog invoice={i} clients={clients} vendors={vendors} projects={projects} categories={categories} defaultUsdRate={defaultUsdRate} />
                  )}
                  {(i.status === "OPEN" || i.status === "PARTIAL") && <RecordPaymentDialog invoice={i} accounts={accounts} defaultUsdRate={defaultUsdRate} />}
                  {i.status !== "VOID" && <LinkEntryDialog invoice={i} candidates={candidates} />}
                  {i.allocations.length === 0 && i.status === "OPEN" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Void" disabled={busyId === i.id}
                      onClick={() => { if (confirm("Void this?")) run(i.id, () => voidInvoice(i.id)); }}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {i.allocations.length === 0 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" disabled={busyId === i.id}
                      onClick={() => { if (confirm("Delete this?")) run(i.id, () => deleteInvoice(i.id)); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {i.allocations.length > 0 && (
              <div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                  {expanded === i.id ? "Hide" : "Show"} {i.allocations.length} linked {i.allocations.length === 1 ? "entry" : "entries"}
                </button>
                {expanded === i.id && (
                  <div className="mt-2 space-y-1">
                    {i.allocations.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-md px-3 py-1.5 text-xs">
                        <span>
                          <span className={`mr-2 px-1.5 py-0.5 rounded font-medium ${a.kind === "FEE" ? "bg-slate-200 text-slate-700" : "bg-green-100 text-green-700"}`}>
                            {a.kind === "FEE" ? "Evidenced fee" : "Payment"}
                          </span>
                          {a.date} · {a.accountName}{a.description ? ` · ${a.description}` : ""}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{fmtMoney(a.amount, i.currency)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title="Unlink (the ledger entry stays)"
                            disabled={busyId === a.id}
                            onClick={() => { if (confirm("Unlink this entry from the invoice? The ledger entry itself stays.")) run(a.id, () => unlinkAllocation(a.id)); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
          {shown.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">{openOnly ? "Nothing outstanding — all settled." : "Nothing yet. Add a receivable (client owes you) or a payable (you owe a vendor)."}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
