"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { updateInvoice } from "@/app/actions/invoices";
import { notify } from "@/components/ui/toast";

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
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
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
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      setOpen(false);
      notify.success(isReceivable ? t("toast.invoiceUpdated") : t("toast.billUpdated"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={tc("actions.edit")} />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{isReceivable ? t("edit.titleInvoice") : t("edit.titleBill")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2 pt-2">
          <div className="space-y-2">
            <Label>{isReceivable ? t("form.client") : t("form.vendor")}</Label>
            <Select value={partyId} onValueChange={(v) => setPartyId(v === "none" ? "" : v || "")}>
              <SelectTrigger>{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">{isReceivable ? t("form.selectClient") : t("form.selectVendor")}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("form.none")}</SelectItem>
                {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("form.project")}</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
              <SelectTrigger>{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">{t("form.noProject")}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("form.noProject")}</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("form.category")}</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "none" ? "" : v || "")}>
              <SelectTrigger>{categoryId ? <span>{cats.find(c => c.id === categoryId)?.name}</span> : <span className="text-muted-foreground">{t("form.noCategory")}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("form.noCategory")}</SelectItem>
                {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`num-${invoice.id}`}>{isReceivable ? t("edit.invoiceNumber") : t("edit.billNumber")}</Label>
            <Input id={`num-${invoice.id}`} name="number" defaultValue={invoice.number ?? ""} placeholder={t("form.numberPlaceholder")} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor={`amt-${invoice.id}`}>{t("form.amount")}</Label>
              <div className="flex bg-muted p-0.5 rounded text-xs font-medium">
                <span onClick={() => setCurrency("VND")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "VND" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>VND</span>
                <span onClick={() => setCurrency("USD")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "USD" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>USD</span>
              </div>
            </div>
            <Input id={`amt-${invoice.id}`} name="amount" type="number" step="0.01" min="0" defaultValue={invoice.amount} required />
            {currency === "USD" && <p className="text-xs text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`iss-${invoice.id}`}>{t("form.issueDate")}</Label>
            <Input id={`iss-${invoice.id}`} name="issueDate" type="date" defaultValue={invoice.issueDate} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`due-${invoice.id}`}>{t("form.dueDate")}</Label>
            <Input id={`due-${invoice.id}`} name="dueDate" type="date" defaultValue={invoice.dueDate} required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor={`notes-${invoice.id}`}>{t("form.notes")}</Label>
            <Input id={`notes-${invoice.id}`} name="notes" defaultValue={invoice.notes ?? ""} placeholder={t("form.notesPlaceholder")} />
          </div>
          {(invoice.status === "PAID" || invoice.status === "PARTIAL") && (
            <p className="text-xs text-amber-700 md:col-span-2">{t("edit.paidNote")}</p>
          )}
          {err && <p className="text-sm text-destructive md:col-span-2">{err}</p>}
          <Button type="submit" disabled={saving} className="md:col-span-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("edit.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
