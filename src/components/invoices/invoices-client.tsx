"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2, Send, CheckCircle2, Ban, Trash2, AlertTriangle } from "lucide-react";
import { createInvoice, sendInvoice, markInvoicePaid, voidInvoice, deleteInvoice } from "@/app/actions/invoices";

type Invoice = {
  id: string; number: string; clientName: string | null; projectName: string | null;
  issueDate: string; dueDate: string; paidDate: string | null;
  currency: string; amount: number; amountVnd: number; status: string; overdue: boolean; notes: string | null;
};
type Opt = { id: string; name: string };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
const money = (i: { currency: string; amount: number }) =>
  i.currency === "USD" ? "$" + new Intl.NumberFormat("en-US").format(i.amount) : vnd(i.amount);

export function InvoicesClient({
  invoices, clients, projects, defaultUsdRate, summary,
}: {
  invoices: Invoice[]; clients: Opt[]; projects: Opt[]; defaultUsdRate: number;
  summary: { outstanding: number; overdueTotal: number; draftCount: number; paidThisCount: number };
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

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
    fd.set("clientId", clientId);
    fd.set("projectId", projectId);
    fd.set("currency", currency);
    try {
      const res = await createInvoice(fd);
      if (!res.success) { setErr(res.message || "Could not create invoice."); return; }
      form.reset();
      setClientId(""); setProjectId(""); setCurrency("VND"); setShowForm(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  function statusBadge(i: Invoice) {
    if (i.overdue) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Overdue</span>;
    const map: Record<string, string> = {
      DRAFT: "bg-gray-200 text-gray-600", SENT: "bg-amber-100 text-amber-700",
      PAID: "bg-green-100 text-green-700", VOID: "bg-gray-100 text-gray-400 line-through",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[i.status] || ""}`}>{i.status}</span>;
  }

  return (
    <div className="space-y-6">
      {/* AR summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Outstanding (AR)</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{vnd(summary.outstanding)}</div>
            <p className="text-xs text-muted-foreground mt-1">Sent, awaiting payment</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Overdue</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{vnd(summary.overdueTotal)}</div>
            <p className="text-xs text-muted-foreground mt-1">Past due date</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Drafts / Paid</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.draftCount} / {summary.paidThisCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Draft vs paid invoices</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setShowForm((s) => !s)} className="gap-2">
          <Plus className="h-4 w-4" />{showForm ? "Close" : "New Invoice"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle>New invoice</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="number">Invoice number</Label>
                <Input id="number" name="number" placeholder="INV-2026-001" required />
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
                {currency === "USD" && <p className="text-xs text-muted-foreground">Converts at {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={(v) => setClientId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{clientId ? <span>{clients.find(c => c.id === clientId)?.name}</span> : <span className="text-muted-foreground">No client</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No client</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">No project</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No project</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                <Input id="notes" name="notes" placeholder="Work description, terms…" />
              </div>
              {err && <p className="text-sm text-destructive md:col-span-2">{err}</p>}
              <Button type="submit" disabled={creating} className="md:col-span-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create draft"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 divide-y">
          {invoices.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 p-4 flex-wrap">
              <div className="flex flex-col min-w-[160px]">
                <span className="text-sm font-medium flex items-center gap-2">{i.number} {statusBadge(i)}</span>
                <span className="text-xs text-muted-foreground">
                  {[i.clientName, i.projectName].filter(Boolean).join(" · ") || "—"} · due {i.dueDate}
                  {i.paidDate && ` · paid ${i.paidDate}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-semibold">{money(i)}</div>
                  {i.currency === "USD" && <div className="text-xs text-muted-foreground">{vnd(i.amountVnd)}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {i.status === "DRAFT" && (
                    <Button variant="outline" size="sm" className="h-8 gap-1" disabled={busyId === i.id} onClick={() => run(i.id, () => sendInvoice(i.id))}>
                      <Send className="h-3.5 w-3.5" /> Send
                    </Button>
                  )}
                  {i.status === "SENT" && (
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-green-700" disabled={busyId === i.id}
                      onClick={() => { if (confirm(`Mark ${i.number} as paid? This records an income transaction.`)) run(i.id, () => markInvoicePaid(i.id)); }}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
                    </Button>
                  )}
                  {(i.status === "DRAFT" || i.status === "SENT") && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Void" disabled={busyId === i.id}
                      onClick={() => { if (confirm(`Void ${i.number}?`)) run(i.id, () => voidInvoice(i.id)); }}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {i.status !== "PAID" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" disabled={busyId === i.id}
                      onClick={() => { if (confirm(`Delete ${i.number}?`)) run(i.id, () => deleteInvoice(i.id)); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {invoices.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No invoices yet. Click &quot;New Invoice&quot; to create one.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
