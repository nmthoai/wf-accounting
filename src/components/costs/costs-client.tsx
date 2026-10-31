"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Pencil, Plus, Paperclip, Trash2, ArrowRight, Undo2, Ban, CalendarClock, CircleAlert, Hourglass, HandCoins } from "lucide-react";
import { saveCostItem, dismissCostItem, reopenCostItem, deleteCostItem } from "@/app/actions/costs";
import { CURRENCIES, fmtMoney, totalsList, type Totals } from "@/lib/money";
import { DOC_STATUS } from "@/lib/review";
import { PAYER, REIMBURSEMENT } from "@/lib/costs";
import { uploadProblem } from "@/lib/upload-limit";
import { notify } from "@/components/ui/toast";
import { Chip, DOC_TONE, Stat, StatStrip } from "@/components/wf/ledger-ui";

export type CostRow = {
  id: string; ref: string | null; provider: string; receiptDate: string; amount: number; currency: string;
  servicePeriodFrom: string | null; servicePeriodTo: string | null; receiptNumber: string | null; billingEntity: string | null;
  payer: string; renewalDate: string | null; reimbursement: string; docStatus: string; status: string;
  notes: string | null; reviewNote: string | null; transactionId: string | null;
  attachments: { id: string; fileName: string; filePath: string }[];
};

// One line per currency — currencies are never added together.
const totalsLines = (t: Totals) => {
  const list = totalsList(t);
  if (list.length === 0) return "—";
  return list.map(([c, v], i) => (i === 0 ? <span key={c}>{fmtMoney(v, c)}</span> : <small key={c}>{fmtMoney(v, c)}</small>));
};
const period = (i: CostRow) => (i.servicePeriodFrom || i.servicePeriodTo ? `${i.servicePeriodFrom ?? "?"} → ${i.servicePeriodTo ?? "?"}` : null);
// A fixed list's keys, labelled in the user's language.
const labelled = (map: Record<string, string>, label: (k: string) => string) => Object.fromEntries(Object.keys(map).map((k) => [k, label(k)]));

function Choice({ id, label, options, value, onChange, disabled }: {
  id: string; label: string; options: Record<string, string>; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{item ? `${item.provider}${item.ref ? ` · ${item.ref}` : ""}` : t("form.addTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4 pt-1">
          {locked && <p className="text-[12px] text-muted-foreground">{t("form.locked")}</p>}
          <fieldset disabled={locked} className="m-0 grid min-w-0 gap-4 border-0 p-0 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="ci-provider">{t("form.provider")}</Label>
              <Input id="ci-provider" name="provider" required defaultValue={item?.provider} placeholder={t("form.providerPlaceholder")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-date">{t("form.receiptDate")}</Label>
              <Input id="ci-date" name="receiptDate" type="date" required defaultValue={item?.receiptDate} />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ci-amount">{t("form.amount")}</Label>
                <div className="wf-seg wf-seg--mono" role="group" aria-label={t("form.currency")}>
                  {CURRENCIES.map((c) => (
                    <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>{c}</button>
                  ))}
                </div>
              </div>
              <Input id="ci-amount" name="amount" type="number" step="any" min="0" required defaultValue={item?.amount} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-from">{t("form.periodFrom")}</Label>
              <Input id="ci-from" name="servicePeriodFrom" type="date" defaultValue={item?.servicePeriodFrom ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-to">{t("form.periodTo")}</Label>
              <Input id="ci-to" name="servicePeriodTo" type="date" defaultValue={item?.servicePeriodTo ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-number">{t("form.receiptNumber")}</Label>
              <Input id="ci-number" name="receiptNumber" defaultValue={item?.receiptNumber ?? ""} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ci-billed">{t("form.billedTo")}</Label>
              <Input id="ci-billed" name="billingEntity" defaultValue={item?.billingEntity ?? ""} placeholder={t("form.billedToPlaceholder")} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="ci-notes">{t("form.notes")}</Label>
              <Input id="ci-notes" name="notes" defaultValue={item?.notes ?? ""} placeholder={t("form.notesPlaceholder")} />
            </div>
          </fieldset>

          <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
            <Choice id="ci-payer" label={t("form.payer")} options={labelled(PAYER, (k) => t(`payer.${k}`))} value={payer} onChange={choosePayer} />
            <Choice id="ci-reimb" label={t("form.reimbursement")} options={labelled(REIMBURSEMENT, (k) => t(`reimbursement.${k}`))} value={reimbursement} onChange={setReimbursement} />
            <Choice id="ci-doc" label={t("form.document")} options={labelled(DOC_STATUS, (k) => tc(`review.doc.${k}`))} value={docStatus} onChange={setDocStatus} />
            <div className="grid gap-2">
              <Label htmlFor="ci-renewal">{t("form.renewal")}</Label>
              <Input id="ci-renewal" name="renewalDate" type="date" defaultValue={item?.renewalDate ?? ""} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="ci-review">{t("form.reviewNote")}</Label>
              <Input id="ci-review" name="reviewNote" defaultValue={item?.reviewNote ?? ""} placeholder={t("form.reviewNotePlaceholder")} />
            </div>
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="ci-files">{t("form.files")}</Label>
              <Input id="ci-files" name="files" type="file" multiple accept="image/*,application/pdf,.zip" />
              {item && item.attachments.length > 0 && <p className="text-[12px] text-muted-foreground">{t("form.alreadyAttached", { count: item.attachments.length })}</p>}
            </div>
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[12px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : item ? tc("actions.save") : t("form.submitAdd")}</Button>
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
      <StatStrip className="lg:grid-cols-3">
        <Stat label={t("summary.pendingTitle")} icon={Hourglass} emphasis sub={t("summary.pendingNote", { count: counts.pending ?? 0 })}>
          {totalsLines(summary.pending)}
        </Stat>
        <Stat label={t("summary.owedTitle")} icon={HandCoins} tone={totalsList(summary.owed).length > 0 ? "warn" : "neutral"} sub={t("summary.owedNote")}>
          {totalsLines(summary.owed)}
        </Stat>
        <Stat label={t("summary.renewalsTitle")} icon={CalendarClock} sub={t("summary.renewalsNote")}>
          {summary.renewals}
        </Stat>
      </StatStrip>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="wf-seg" role="group" aria-label={t("views.label")}>
          {(["pending", "converted", "dismissed", "all"] as const).map((v) => (
            <Link key={v} href={v === "pending" ? "/costs" : `/costs?view=${v}`} aria-current={view === v ? "page" : undefined}>
              {t(`views.${v}`, { count: counts[v] ?? 0 })}
            </Link>
          ))}
        </div>
        <ItemDialog trigger={<Button><Plus aria-hidden="true" />{t("list.addReceipt")}</Button>} />
      </div>

      <Card>
        <ul className="wf-rows">
          {items.map((i) => (
            <li key={i.id} className="flex-wrap items-start py-4">
              <div className="grid min-w-[240px] flex-1 gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  {i.ref && <Chip mono className="rounded-[4px]">{i.ref}</Chip>}
                  <span className="text-[15px] font-semibold text-foreground">{i.provider}</span>
                  <Chip tone={DOC_TONE[i.docStatus] ?? "neutral"}>{tc.has(`review.doc.${i.docStatus}`) ? tc(`review.doc.${i.docStatus}`) : i.docStatus}</Chip>
                  {i.status !== "PENDING" && <Chip>{t(`status.${i.status}`)}</Chip>}
                  {i.attachments.map((a) => (
                    <a key={a.id} href={`/api/uploads/${a.filePath.split("/").pop()}`} target="_blank" rel="noreferrer" title={a.fileName} aria-label={a.fileName}
                      className="inline-flex text-primary hover:text-primary-hover">
                      <Paperclip className="size-3.5" aria-hidden="true" />
                    </a>
                  ))}
                </p>
                <p className="text-[13px] text-muted-foreground">
                  <span className="wf-num text-text-secondary">{i.receiptDate}</span>
                  {period(i) ? ` · ${t("list.service", { period: period(i)! })}` : ""}{i.receiptNumber ? ` · ${t("list.number", { number: i.receiptNumber })}` : ""}
                  {i.billingEntity ? ` · ${t("list.billedTo", { name: i.billingEntity })}` : ""}
                </p>
                <p className="text-[13px] text-text-secondary">
                  {t("list.paidBy", { payer: t.has(`payer.${i.payer}`) ? t(`payer.${i.payer}`) : i.payer })}
                  {i.payer !== "COMPANY" && (
                    <span className={i.reimbursement === "OWED" ? "text-warn" : "text-muted-foreground"}> · {t.has(`reimbursement.${i.reimbursement}`) ? t(`reimbursement.${i.reimbursement}`) : i.reimbursement}</span>
                  )}
                  {i.renewalDate && (
                    <span className="text-muted-foreground"> · <CalendarClock className="inline size-3.5 align-[-2px]" aria-hidden="true" /> {t("list.renews", { date: i.renewalDate })}</span>
                  )}
                </p>
                {(i.reviewNote || i.notes) && (
                  <p className="line-clamp-2 text-[12px] text-muted-foreground" title={[i.reviewNote, i.notes].filter(Boolean).join("\n")}>{i.reviewNote ?? i.notes}</p>
                )}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <span className="wf-figure mr-2 text-[15px]">{fmtMoney(i.amount, i.currency)}</span>
                <ItemDialog item={i} trigger={<Button variant="ghost" size="icon-sm" aria-label={tc("actions.edit")} title={tc("actions.edit")}><Pencil /></Button>} />
                {i.status === "PENDING" && (
                  <Button variant="outline" size="sm" className="text-pos" render={<Link href={`/entry?costItem=${i.id}`} />} nativeButton={false} title={t("list.toLedgerTitle")}>
                    {t("list.toLedger")} <ArrowRight aria-hidden="true" />
                  </Button>
                )}
                {i.status === "CONVERTED" && i.transactionId && (
                  <Button variant="ghost" size="sm" render={<Link href={`/entry/${i.transactionId}`} />} nativeButton={false}>
                    {t("list.expense")} <ArrowRight aria-hidden="true" />
                  </Button>
                )}
                {isAdmin && i.status === "PENDING" && (
                  <Button variant="ghost" size="icon-sm" aria-label={t("list.dismissTitle")} title={t("list.dismissTitle")} disabled={busyId === i.id}
                    onClick={() => { const r = prompt(t("list.dismissPrompt")); if (r?.trim()) run(i.id, () => dismissCostItem(i.id, r), t("toast.dismissed"), i.provider); }}>
                    <Ban />
                  </Button>
                )}
                {isAdmin && i.status === "DISMISSED" && (
                  <Button variant="ghost" size="icon-sm" aria-label={t("list.reopenTitle")} title={t("list.reopenTitle")} disabled={busyId === i.id}
                    onClick={() => run(i.id, () => reopenCostItem(i.id), t("toast.reopened"), i.provider)}>
                    <Undo2 />
                  </Button>
                )}
                {isAdmin && i.status !== "CONVERTED" && (
                  <Button variant="ghost" size="icon-sm" className="hover:text-destructive" aria-label={t("list.deleteTitle")} title={t("list.deleteTitle")} disabled={busyId === i.id}
                    onClick={() => { if (confirm(t("list.deleteConfirm", { provider: i.provider, date: i.receiptDate }))) run(i.id, () => deleteCostItem(i.id), t("toast.deleted"), `${i.provider} ${i.receiptDate}`); }}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && <li className="justify-center py-10 text-muted-foreground">{t("list.empty")}</li>}
        </ul>
      </Card>
    </div>
  );
}
