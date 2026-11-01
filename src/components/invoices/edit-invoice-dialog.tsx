"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleAlert, Pencil, Loader2 } from "lucide-react";
import { Notice } from "@/components/wf/ledger-ui";
import { updateInvoice } from "@/app/actions/invoices";
import { notify, notifyFailure } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };
type Invoice = {
  id: string; number: string | null; direction: string; status: string;
  clientId: string | null; vendorId: string | null; projectId: string | null; categoryId: string | null;
  issueDate: string; dueDate: string; currency: string; amount: number; notes: string | null;
  allocations: unknown[];
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
  // A saved row without a number is one marked "no invoice yet".
  const [noInvoiceYet, setNoInvoiceYet] = useState(!invoice.number);
  // The due date can't be before the issue date (the server refuses it too).
  const [issueDate, setIssueDate] = useState(invoice.issueDate);
  // Linked payments are in the invoice's currency; the server refuses a change until they are unlinked.
  const currencyLocked = invoice.allocations.length > 0;

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
      notifyFailure();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setIssueDate(invoice.issueDate); setNoInvoiceYet(!invoice.number); } }}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" aria-label={tc("actions.edit")} title={tc("actions.edit")} />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isReceivable ? t("edit.titleInvoice") : t("edit.titleBill")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid items-start gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={`party-${invoice.id}`}>{isReceivable ? t("form.client") : t("form.vendor")}</Label>
            <Select value={partyId} onValueChange={(v) => setPartyId(v || "")} required>
              <SelectTrigger id={`party-${invoice.id}`} className="w-full">{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">{isReceivable ? t("form.selectClient") : t("form.selectVendor")}</span>}</SelectTrigger>
              <SelectContent>
                {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                {parties.length === 0 && <SelectItem value="empty" disabled>{t("form.addPartyFirst")}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`proj-${invoice.id}`}>{t("form.project")}</Label>
            <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
              <SelectTrigger id={`proj-${invoice.id}`} className="w-full">{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">{t("form.noProject")}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("form.noProject")}</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`cat-${invoice.id}`}>{t("form.category")}</Label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "none" ? "" : v || "")}>
              <SelectTrigger id={`cat-${invoice.id}`} className="w-full">{categoryId ? <span>{cats.find(c => c.id === categoryId)?.name}</span> : <span className="text-muted-foreground">{t("form.noCategory")}</span>}</SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("form.noCategory")}</SelectItem>
                {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`num-${invoice.id}`}>{isReceivable ? t("edit.invoiceNumber") : t("edit.billNumber")}</Label>
            <Input id={`num-${invoice.id}`} name="number" defaultValue={invoice.number ?? ""} placeholder={t("form.numberPlaceholder")} required={!noInvoiceYet} disabled={noInvoiceYet} />
            <label className="flex items-start gap-2 text-[14.5px] text-text-secondary">
              <input type="checkbox" name="noInvoiceYet" className="mt-0.5 size-4 shrink-0 accent-primary" checked={noInvoiceYet} onChange={(e) => setNoInvoiceYet(e.target.checked)} />
              {t("form.noInvoiceYet")}
            </label>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`amt-${invoice.id}`}>{t("form.amount")}</Label>
            {/* The currency sits beside the input, so the label row matches its neighbour's. */}
            <div className="flex items-center gap-2">
              <Input id={`amt-${invoice.id}`} name="amount" type="number" step="0.01" min="0" defaultValue={invoice.amount} required className="flex-1" />
              <div className={cn("wf-seg wf-seg--mono shrink-0", currencyLocked && "opacity-60")} role="group" aria-label={t("form.currency")}
                title={currencyLocked ? t("errors.currencyLocked") : undefined}>
                {["VND", "USD"].map((c) => (
                  <button key={c} type="button" aria-pressed={currency === c} disabled={currencyLocked} className="disabled:cursor-not-allowed" onClick={() => setCurrency(c)}>{c}</button>
                ))}
              </div>
            </div>
            {currency === "USD" && <p className="wf-num text-[13.5px] text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`iss-${invoice.id}`}>{t("form.issueDate")}</Label>
            <Input id={`iss-${invoice.id}`} name="issueDate" type="date" defaultValue={invoice.issueDate} onChange={(e) => setIssueDate(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`due-${invoice.id}`}>{t("form.dueDate")}</Label>
            <Input id={`due-${invoice.id}`} name="dueDate" type="date" defaultValue={invoice.dueDate} min={issueDate || undefined} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`notes-${invoice.id}`}>{t("form.notes")}</Label>
            <Input id={`notes-${invoice.id}`} name="notes" defaultValue={invoice.notes ?? ""} placeholder={t("form.notesPlaceholder")} />
          </div>
          {currencyLocked && <p className="text-[13.5px] text-muted-foreground sm:col-span-2">{t("errors.currencyLocked")}</p>}
          {(invoice.status === "PAID" || invoice.status === "PARTIAL") && (
            <Notice tone="warning" className="sm:col-span-2">{t("edit.paidNote")}</Notice>
          )}
          {err && (
            <p className="flex items-center gap-1.5 text-[13.5px] text-destructive sm:col-span-2" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}{t("edit.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
