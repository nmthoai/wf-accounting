"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Paperclip, Trash2, ArrowRight, Undo2, Ban, CalendarClock } from "lucide-react";
import { saveCostItem, dismissCostItem, reopenCostItem, deleteCostItem } from "@/app/actions/costs";
import { CURRENCIES, fmtMoney, totalsList, type Totals } from "@/lib/money";
import { DOC_STATUS, DOC_BADGE } from "@/lib/review";
import { PAYER, REIMBURSEMENT } from "@/lib/costs";
import { uploadProblem } from "@/lib/upload-limit";
import { notify } from "@/components/ui/toast";

export type CostRow = {
  id: string; ref: string | null; provider: string; receiptDate: string; amount: number; currency: string;
  servicePeriodFrom: string | null; servicePeriodTo: string | null; receiptNumber: string | null; billingEntity: string | null;
  payer: string; renewalDate: string | null; reimbursement: string; docStatus: string; status: string;
  notes: string | null; reviewNote: string | null; transactionId: string | null;
  attachments: { id: string; fileName: string; filePath: string }[];
};

const totalsText = (t: Totals) => totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ") || "—";
const period = (i: CostRow) => (i.servicePeriodFrom || i.servicePeriodTo ? `${i.servicePeriodFrom ?? "?"} → ${i.servicePeriodTo ?? "?"}` : null);
// A fixed list's keys, labelled in the user's language.
const labelled = (map: Record<string, string>, label: (k: string) => string) => Object.fromEntries(Object.keys(map).map((k) => [k, label(k)]));

function Choice({ id, label, options, value, onChange, disabled }: {
  id: string; label: string; options: Record<string, string>; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v || value)} disabled={disabled}>
        <SelectTrigger id={id}><span>{options[value] ?? value}</span></SelectTrigger>
        <SelectContent>{Object.entries(options).map(([k, t]) => <SelectItem key={k} value={k}>{t}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

// Add or edit a register item. Once in the ledger, the receipt's evidence stays as recorded.
function ItemDialog({ item, trigger }: { item?: CostRow; trigger: React.ReactElement }) {
  const t = useTranslations("costs");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [currency, setCurrency] = useState(item?.currency ?? "USD");
  const [payer, setPayer] = useState(item?.payer ?? "UNKNOWN");
  const [reimbursement, setReimbursement] = useState(item?.reimbursement ?? "UNRESOLVED");
  const [docStatus, setDocStatus] = useState(item?.docStatus ?? "RECEIPT");
  const locked = item?.status === "CONVERTED";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const tooBig = uploadProblem(fd.getAll("files") as File[], tc);
    if (tooBig) { setErr(tooBig); return; }
    setBusy(true); setErr("");
    fd.set("currency", currency); fd.set("payer", payer); fd.set("reimbursement", reimbursement); fd.set("docStatus", docStatus);
    try {
      const res = await saveCostItem(item?.id ?? null, fd);
      if (!res.success) { setErr(res.message ?? tc("errors.couldNotSave")); return; }
      notify.success(item ? t("toast.saved") : t("toast.added"), (fd.get("provider") as string | null) || item?.provider);
      setOpen(false);
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(false); }
  }

  // Owner-paid costs are owed back to the owner until reimbursed.
  function choosePayer(p: string) {
    setPayer(p);
    if (p === "COMPANY") setReimbursement("NOT_NEEDED");
    else if (p === "OWNER" && (reimbursement === "UNRESOLVED" || reimbursement === "NOT_NEEDED")) setReimbursement("OWED");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{item ? `${item.provider}${item.ref ? ` · ${item.ref}` : ""}` : t("form.addTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          {locked && <p className="text-xs text-muted-foreground">{t("form.locked")}</p>}
          <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2 min-w-0 border-0 p-0 m-0">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-provider">{t("form.provider")}</Label>
              <Input id="ci-provider" name="provider" required defaultValue={item?.provider} placeholder={t("form.providerPlaceholder")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-date">{t("form.receiptDate")}</Label>
              <Input id="ci-date" name="receiptDate" type="date" required defaultValue={item?.receiptDate} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="ci-amount">{t("form.amount")}</Label>
                <div className="flex bg-muted p-0.5 rounded text-xs font-medium">
                  {CURRENCIES.map((c) => (
                    <button key={c} type="button" onClick={() => setCurrency(c)}
                      className={`px-2 py-0.5 rounded-sm ${currency === c ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{c}</button>
                  ))}
                </div>
              </div>
              <Input id="ci-amount" name="amount" type="number" step="any" min="0" required defaultValue={item?.amount} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-from">{t("form.periodFrom")}</Label>
              <Input id="ci-from" name="servicePeriodFrom" type="date" defaultValue={item?.servicePeriodFrom ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-to">{t("form.periodTo")}</Label>
              <Input id="ci-to" name="servicePeriodTo" type="date" defaultValue={item?.servicePeriodTo ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-number">{t("form.receiptNumber")}</Label>
              <Input id="ci-number" name="receiptNumber" defaultValue={item?.receiptNumber ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-billed">{t("form.billedTo")}</Label>
              <Input id="ci-billed" name="billingEntity" defaultValue={item?.billingEntity ?? ""} placeholder={t("form.billedToPlaceholder")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-notes">{t("form.notes")}</Label>
              <Input id="ci-notes" name="notes" defaultValue={item?.notes ?? ""} placeholder={t("form.notesPlaceholder")} />
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2 rounded-md border p-3 bg-muted/30">
            <Choice id="ci-payer" label={t("form.payer")} options={labelled(PAYER, (k) => t(`payer.${k}`))} value={payer} onChange={choosePayer} />
            <Choice id="ci-reimb" label={t("form.reimbursement")} options={labelled(REIMBURSEMENT, (k) => t(`reimbursement.${k}`))} value={reimbursement} onChange={setReimbursement} />
            <Choice id="ci-doc" label={t("form.document")} options={labelled(DOC_STATUS, (k) => tc(`review.doc.${k}`))} value={docStatus} onChange={setDocStatus} />
            <div className="space-y-2">
              <Label htmlFor="ci-renewal">{t("form.renewal")}</Label>
              <Input id="ci-renewal" name="renewalDate" type="date" defaultValue={item?.renewalDate ?? ""} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-review">{t("form.reviewNote")}</Label>
              <Input id="ci-review" name="reviewNote" defaultValue={item?.reviewNote ?? ""} placeholder={t("form.reviewNotePlaceholder")} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-files">{t("form.files")}</Label>
              <Input id="ci-files" name="files" type="file" multiple accept="image/*,application/pdf,.zip" />
              {item && item.attachments.length > 0 && <p className="text-xs text-muted-foreground">{t("form.alreadyAttached", { count: item.attachments.length })}</p>}
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : item ? tc("actions.save") : t("form.submitAdd")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CostsClient({ isAdmin, view, counts, summary, items }: {
  isAdmin: boolean; view: string; counts: Record<string, number>;
  summary: { pending: Totals; owed: Totals; renewals: number }; items: CostRow[];
}) {
  const t = useTranslations("costs");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string, detail?: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) notify.success(done, detail);
      else if (res.message) notify.error(res.message);
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("summary.pendingTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{totalsText(summary.pending)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.pendingNote", { count: counts.pending ?? 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("summary.owedTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-amber-700">{totalsText(summary.owed)}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.owedNote")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("summary.renewalsTitle")}</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{summary.renewals}</div>
            <p className="text-xs text-muted-foreground mt-1">{t("summary.renewalsNote")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          {(["pending", "converted", "dismissed", "all"] as const).map((v) => (
            <Link key={v} href={v === "pending" ? "/costs" : `/costs?view=${v}`}
              className={`px-3 py-1 rounded-md font-medium transition-all ${view === v ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{t(`views.${v}`, { count: counts[v] ?? 0 })}</Link>
          ))}
        </div>
        <ItemDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />{t("list.addReceipt")}</Button>} />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 border-b last:border-0 p-4 flex-wrap">
              <div className="flex flex-col gap-1 min-w-[240px] flex-1">
                <span className="font-medium flex items-center gap-2 flex-wrap">
                  {i.provider}
                  {i.ref && <span className="text-xs text-muted-foreground">{i.ref}</span>}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DOC_BADGE[i.docStatus] ?? ""}`}>{tc.has(`review.doc.${i.docStatus}`) ? tc(`review.doc.${i.docStatus}`) : i.docStatus}</span>
                  {i.status !== "PENDING" && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">{t(`status.${i.status}`)}</span>}
                  {i.attachments.map((a) => (
                    <a key={a.id} href={`/api/uploads/${a.filePath.split("/").pop()}`} target="_blank" rel="noreferrer" title={a.fileName} className="text-blue-500 hover:text-blue-700">
                      <Paperclip className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {i.receiptDate}{period(i) ? ` · ${t("list.service", { period: period(i)! })}` : ""}{i.receiptNumber ? ` · ${t("list.number", { number: i.receiptNumber })}` : ""}
                  {i.billingEntity ? ` · ${t("list.billedTo", { name: i.billingEntity })}` : ""}
                </span>
                <span className="text-xs">
                  {t("list.paidBy", { payer: t.has(`payer.${i.payer}`) ? t(`payer.${i.payer}`) : i.payer })}
                  {i.payer !== "COMPANY" && <span className={i.reimbursement === "OWED" ? "text-amber-700" : "text-muted-foreground"}> · {t.has(`reimbursement.${i.reimbursement}`) ? t(`reimbursement.${i.reimbursement}`) : i.reimbursement}</span>}
                  {i.renewalDate && <span className="text-muted-foreground"> · <CalendarClock className="inline h-3 w-3" /> {t("list.renews", { date: i.renewalDate })}</span>}
                </span>
                {(i.reviewNote || i.notes) && <span className="text-xs text-muted-foreground line-clamp-2" title={[i.reviewNote, i.notes].filter(Boolean).join("\n")}>{i.reviewNote ?? i.notes}</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold mr-2">{fmtMoney(i.amount, i.currency)}</span>
                <ItemDialog item={i} trigger={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={tc("actions.edit")}><Pencil className="h-4 w-4" /></Button>} />
                {i.status === "PENDING" && (
                  <Link href={`/entry?costItem=${i.id}`} title={t("list.toLedgerTitle")}>
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-green-700">{t("list.toLedger")} <ArrowRight className="h-3.5 w-3.5" /></Button>
                  </Link>
                )}
                {i.status === "CONVERTED" && i.transactionId && (
                  <Link href={`/entry/${i.transactionId}`}><Button variant="ghost" size="sm" className="h-8">{t("list.expense")} <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
                )}
                {isAdmin && i.status === "PENDING" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title={t("list.dismissTitle")} disabled={busyId === i.id}
                    onClick={() => { const r = prompt(t("list.dismissPrompt")); if (r?.trim()) run(i.id, () => dismissCostItem(i.id, r), t("toast.dismissed"), i.provider); }}>
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && i.status === "DISMISSED" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title={t("list.reopenTitle")} disabled={busyId === i.id}
                    onClick={() => run(i.id, () => reopenCostItem(i.id), t("toast.reopened"), i.provider)}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && i.status !== "CONVERTED" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title={t("list.deleteTitle")} disabled={busyId === i.id}
                    onClick={() => { if (confirm(t("list.deleteConfirm", { provider: i.provider, date: i.receiptDate }))) run(i.id, () => deleteCostItem(i.id), t("toast.deleted"), `${i.provider} ${i.receiptDate}`); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">{t("list.empty")}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
