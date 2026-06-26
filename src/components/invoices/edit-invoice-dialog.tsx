"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { updateInvoice } from "@/app/actions/invoices";

type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };
type Invoice = {
  id: string; number: string | null; direction: string; status: string;
  clientId: string | null; vendorId: string | null; projectId: string | null; categoryId: string | null;
  issueDate: string; dueDate: string; currency: string; amount: number; notes: string | null;
};

export function EditInvoiceDialog({
  invoice, clients, vendors, projects, categories, defaultUsdRate,
}: {
  invoice: Invoice; clients: Opt[]; vendors: Opt[]; projects: Opt[]; categories: Cat[]; defaultUsdRate: number;
}) {
  const router = useRouter();
  const isReceivable = invoice.direction === "RECEIVABLE";
  const parties = isReceivable ? clients : vendors;

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [partyId, setPartyId] = useState((isReceivable ? invoice.clientId : invoice.vendorId) ?? "");
  const [projectId, setProjectId] = useState(invoice.projectId ?? "");
  const [categoryId, setCategoryId] = useState(invoice.categoryId ?? "");
  const [currency, setCurrency] = useState(invoice.currency);

  // Receivables become income; payables an expense — show the matching categories.
  const cats = categories.filter((c) => c.type === (isReceivable ? "INCOME" : "EXPENSE"));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    fd.set("clientId", isReceivable ? partyId : "");
    fd.set("vendorId", isReceivable ? "" : partyId);
    fd.set("projectId", projectId);
    fd.set("categoryId", categoryId);
    fd.set("currency", currency);
    try {
      const res = await updateInvoice(invoice.id, fd);
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const label = isReceivable ? "invoice" : "bill";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Edit" />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {label}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2 pt-2">
          <div className="space-y-2">
            <Label>{isReceivable ? "Client" : "Vendor"}</Label>
            <Select value={partyId} onValueChange={(v) => setPartyId(v === "none" ? "" : v || "")}>
              <SelectTrigger>{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">Select {isReceivable ? "client" : "vendor"}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`num-${invoice.id}`}>{isReceivable ? "Invoice" : "Bill"} number</Label>
            <Input id={`num-${invoice.id}`} name="number" defaultValue={invoice.number ?? ""} placeholder="from the PDF" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor={`amt-${invoice.id}`}>Amount</Label>
              <div className="flex bg-muted p-0.5 rounded text-xs font-medium">
                <span onClick={() => setCurrency("VND")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "VND" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>VND</span>
                <span onClick={() => setCurrency("USD")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "USD" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>USD</span>
              </div>
            </div>
            <Input id={`amt-${invoice.id}`} name="amount" type="number" step="0.01" min="0" defaultValue={invoice.amount} required />
            {currency === "USD" && <p className="text-xs text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`iss-${invoice.id}`}>Issue date</Label>
            <Input id={`iss-${invoice.id}`} name="issueDate" type="date" defaultValue={invoice.issueDate} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`due-${invoice.id}`}>Due date</Label>
            <Input id={`due-${invoice.id}`} name="dueDate" type="date" defaultValue={invoice.dueDate} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`notes-${invoice.id}`}>Notes (optional)</Label>
            <Input id={`notes-${invoice.id}`} name="notes" defaultValue={invoice.notes ?? ""} placeholder="Work / terms…" />
          </div>
          {invoice.status === "PAID" && (
            <p className="text-xs text-amber-700 md:col-span-2">This is already paid — saving will also update the matching ledger transaction.</p>
          )}
          {err && <p className="text-sm text-destructive md:col-span-2">{err}</p>}
          <Button type="submit" disabled={saving} className="md:col-span-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
