"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, CheckCircle2, Ban, Trash2, AlertTriangle, Paperclip, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { createInvoice, markInvoicePaid, voidInvoice, deleteInvoice } from "@/app/actions/invoices";

type Invoice = {
  id: string; number: string | null; direction: string; party: string | null; projectName: string | null; categoryName: string | null;
  issueDate: string; dueDate: string; paidDate: string | null;
  currency: string; amount: number; amountVnd: number; status: string; overdue: boolean; attachment: string | null;
};
type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
const money = (i: { currency: string; amount: number }) =>
  i.currency === "USD" ? "$" + new Intl.NumberFormat("en-US").format(i.amount) : vnd(i.amount);

export function InvoicesClient({
  invoices, clients, vendors, projects, categories, defaultUsdRate, summary,
}: {
  invoices: Invoice[]; clients: Opt[]; vendors: Opt[]; projects: Opt[]; categories: Cat[]; defaultUsdRate: number;
  summary: { arOutstanding: number; apOutstanding: number; arOverdue: number; apOverdue: number };
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
  const shown = openOnly ? invoices.filter((i) => i.status === "OPEN") : invoices;
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
    setCreating(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
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
      OPEN: "bg-amber-100 text-amber-700", PAID: "bg-green-100 text-green-700", VOID: "bg-gray-100 text-gray-400 line-through",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[i.status] || ""}`}>{i.status}</span>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-green-600" />Owed to you (AR)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{vnd(summary.arOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.arOverdue > 0 ? <span className="text-red-600">{vnd(summary.arOverdue)} overdue</span> : "Nothing overdue"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-600" />You owe (AP)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{vnd(summary.apOutstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">{summary.apOverdue > 0 ? <span className="text-red-600">{vnd(summary.apOverdue)} overdue</span> : "Nothing overdue"}</p>
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
            <div key={i.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
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
                  <div className={`text-sm font-semibold ${i.direction === "PAYABLE" ? "text-red-600" : "text-green-700"}`}>{money(i)}</div>
                  {i.currency === "USD" && <div className="text-xs text-muted-foreground">{vnd(i.amountVnd)}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {i.status === "OPEN" && (
                    <Dialog>
                      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 text-green-700" disabled={busyId === i.id} />}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Mark {i.number || (i.direction === "PAYABLE" ? "bill" : "invoice")} paid</DialogTitle>
                        </DialogHeader>
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const fd = new FormData(e.currentTarget);
                            await run(i.id, () => markInvoicePaid(i.id, fd));
                          }}
                          className="space-y-4 pt-2"
                        >
                          <p className="text-sm text-muted-foreground">
                            Records the {i.direction === "PAYABLE" ? "expense" : "income"} transaction in the ledger, dated below.
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor={`pd-${i.id}`}>Payment date</Label>
                            <Input id={`pd-${i.id}`} name="paidDate" type="date" defaultValue={today} required />
                          </div>
                          <Button type="submit" className="w-full">Confirm payment</Button>
                        </form>
                      </DialogContent>
                    </Dialog>
                  )}
                  {i.status === "OPEN" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Void" disabled={busyId === i.id}
                      onClick={() => { if (confirm("Void this?")) run(i.id, () => voidInvoice(i.id)); }}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {i.status !== "PAID" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" disabled={busyId === i.id}
                      onClick={() => { if (confirm("Delete this?")) run(i.id, () => deleteInvoice(i.id)); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {shown.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">{openOnly ? "Nothing outstanding — all settled." : "Nothing yet. Add a receivable (client owes you) or a payable (you owe a vendor)."}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
