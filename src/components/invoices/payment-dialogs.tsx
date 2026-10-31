"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleAlert, CircleCheck, Link2, Loader2 } from "lucide-react";
import { recordPayment, linkToInvoice } from "@/app/actions/invoices";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { fmtMoney , vnToday } from "@/lib/money";
import { notify, notifyFailure } from "@/components/ui/toast";
import { uploadProblem } from "@/lib/upload-limit";

type Inv = { id: string; number: string | null; direction: string; currency: string; difference: number };
export type Candidate = {
  id: string; type: string; date: string; amount: number; currency: string; description: string | null;
  accountName: string; hasEvidence: boolean; free: number; linkedTo: string[];
};

const label = (i: Inv, t: (key: "label.bill" | "label.invoice") => string) => i.number || (i.direction === "PAYABLE" ? t("label.bill") : t("label.invoice"));

function useSubmit(close: () => void, done: string) {
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>, run: (fd: FormData) => Promise<{ success: boolean; message?: string }>, extra: Record<string, string>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    try {
      const res = await run(fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      close();
      notify.success(done);
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setSaving(false);
    }
  }
  // An error from the last save goes once the user edits the form again.
  const clearErr = () => { if (err) setErr(""); };
  return { saving, err, submit, clearErr };
}

// A fresh id for each opening of the dialog: a double click or a retry of the
// same save is recognised on the server and recorded once.
const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
// The likeliest category for a bank fee: a bank one, then FX, then any fee.
const feeDefault = (cats: { id: string; name: string }[]) =>
  (cats.find((c) => /bank|ngân hàng/i.test(c.name)) ?? cats.find((c) => /\bfx\b/i.test(c.name)) ?? cats.find((c) => /fee|phí/i.test(c.name)))?.id ?? "";

// Record money received/paid against this invoice — all of it or part. For a
// receipt, a fee the bank withheld can be entered: the invoice is settled by
// the full amount and the account receives the net.
export function RecordPaymentDialog({ invoice, accounts, defaultUsdRate, feeCategories }: {
  invoice: Inv; accounts: AccountOpt[]; defaultUsdRate: number; feeCategories: { id: string; name: string }[];
}) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const receipt = invoice.direction === "RECEIVABLE";
  const openAmount = String(Math.round(invoice.difference * 100) / 100);
  const [amountText, setAmountText] = useState(openAmount);
  const [feeText, setFeeText] = useState("");
  const [feeCategoryId, setFeeCategoryId] = useState(feeDefault(feeCategories));
  // Each opening starts afresh: what is open now, no fee, a new request id.
  const openDialog = (o: boolean) => {
    if (o) { setRequestId(newRequestId()); setAmountText(openAmount); setFeeText(""); setFeeCategoryId(feeDefault(feeCategories)); }
    setOpen(o);
  };
  const settled = parseFloat(amountText) || 0;
  const fee = receipt ? parseFloat(feeText) || 0 : 0;
  const { saving, err, submit, clearErr } = useSubmit(() => setOpen(false), t("toast.paymentRecorded"));
  // VND invoices settle through VND accounts; foreign ones through any account.
  const usable = accounts.filter((a) => a.isActive && (invoice.currency !== "VND" || a.currency === "VND"));
  const suggested = usable.find((a) => a.type === "BANK" && a.currency === invoice.currency) ?? usable.find((a) => a.type === "BANK");
  const [accountId, setAccountId] = useState(suggested?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const foreign = invoice.currency !== "VND";
  // Into a VND account, a foreign amount settles at the bank's actual VND figure.
  const [rateMode, setRateMode] = useState<"BANK" | "MANUAL" | "DEFAULT">(foreign && invoice.currency !== "USD" ? "BANK" : "DEFAULT");
  const modes: ["BANK" | "MANUAL" | "DEFAULT", string][] = [
    ...(account?.currency === "VND" ? [["BANK", t("payment.rateBank")] as ["BANK", string]] : []),
    ["MANUAL", t("payment.rateManual")],
    ...(invoice.currency === "USD" ? [["DEFAULT", t("payment.rateDefault", { rate: new Intl.NumberFormat("vi-VN").format(defaultUsdRate) })] as ["DEFAULT", string]] : []),
  ];
  const mode = modes.some(([m]) => m === rateMode) ? rateMode : modes[0][0];
  const today = vnToday();

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-pos hover:text-pos" aria-label={t("payment.record")} title={t("payment.record")} />}>
        <CircleCheck />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("payment.title", { label: label(invoice, t) })}</DialogTitle>
          <DialogDescription>
            {t.rich("payment.intro", {
              direction: invoice.direction, label: label(invoice, t), amount: fmtMoney(invoice.difference, invoice.currency),
              b: (c) => <span className="wf-num font-semibold text-foreground">{c}</span>,
            })}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onChange={clearErr} onSubmit={(e) => {
          const tooBig = uploadProblem(new FormData(e.currentTarget).getAll("files") as File[], tc);
          if (tooBig) { e.preventDefault(); notify.error(tooBig); return; }
          submit(e, (fd) => recordPayment(invoice.id, fd), { accountId, rateMode: foreign ? mode : "", requestId, feeCategoryId: fee > 0 ? feeCategoryId : "" });
        }}>
          <div className="grid gap-2">
            <Label htmlFor="payment-account">{invoice.direction === "PAYABLE" ? t("payment.paidFrom") : t("payment.receivedInto")}</Label>
            <AccountSelect id="payment-account" accounts={usable} value={accountId} onChange={(id) => { setAccountId(id); clearErr(); }} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor={`pa-${invoice.id}`}>{receipt ? t("payment.amountSettled", { currency: invoice.currency }) : t("payment.amount", { currency: invoice.currency })}</Label>
              <Input id={`pa-${invoice.id}`} name="amount" type="number" step="any" min="0" value={amountText} onChange={(e) => setAmountText(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`pd-${invoice.id}`}>{t("payment.date")}</Label>
              <Input id={`pd-${invoice.id}`} name="paidDate" type="date" defaultValue={today} required />
            </div>
          </div>
          {receipt && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`pf-${invoice.id}`}>{t("payment.feeDeducted", { currency: invoice.currency })}</Label>
                <Input id={`pf-${invoice.id}`} name="feeDeducted" type="number" step="any" min="0" placeholder={t("payment.feePlaceholder")} value={feeText} onChange={(e) => setFeeText(e.target.value)} />
              </div>
              {fee > 0 && (
                <div className="grid gap-2">
                  <Label htmlFor={`pc-${invoice.id}`}>{t("payment.feeCategory")}</Label>
                  <Select value={feeCategoryId} onValueChange={(v) => { setFeeCategoryId(v || ""); clearErr(); }}
                    items={feeCategories.map((c) => ({ value: c.id, label: c.name }))}>
                    <SelectTrigger id={`pc-${invoice.id}`} className="w-full"><SelectValue placeholder={t("payment.feeCategoryPlaceholder")} /></SelectTrigger>
                    <SelectContent>
                      {feeCategories.length === 0
                        ? <SelectItem value="none" disabled>{t("payment.noFeeCategories")}</SelectItem>
                        : feeCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
          {fee > 0 && (
            <dl className="grid gap-1.5 border-y border-border py-3 text-[13px]">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("payment.breakdown.settled")}</dt><dd className="wf-num">{fmtMoney(settled, invoice.currency)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{t("payment.breakdown.fee")}</dt><dd className="wf-num">{"−"}{fmtMoney(fee, invoice.currency)}</dd></div>
              <div className="flex justify-between gap-4 border-t border-border pt-1.5 font-semibold text-foreground">
                <dt>{t("payment.breakdown.net", { account: account?.name ?? "—" })}</dt><dd className="wf-figure">{fmtMoney(settled - fee, invoice.currency)}</dd>
              </div>
            </dl>
          )}
          <p className="text-[12px] text-muted-foreground">{receipt ? t("payment.feeNote") : t("payment.shortfallNote")}</p>
          {foreign && (
            <div className="grid gap-2 border-t border-border pt-4">
              <Label htmlFor={mode === "DEFAULT" ? undefined : `pv-${invoice.id}`}>{t("payment.vndValue")}</Label>
              <div className="wf-seg justify-self-start" role="group" aria-label={t("payment.vndValue")}>
                {modes.map(([m, text]) => (
                  <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setRateMode(m); clearErr(); }}>{text}</button>
                ))}
              </div>
              {mode === "BANK" && <Input id={`pv-${invoice.id}`} name="vndAmount" type="number" step="1" min="0" required placeholder={t("payment.vndPlaceholder")} />}
              {mode === "MANUAL" && <Input id={`pv-${invoice.id}`} name="rate" type="number" step="any" min="0" required placeholder={t("payment.ratePlaceholder", { currency: invoice.currency })} />}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor={`pe-${invoice.id}`}>{t("payment.evidence")}</Label>
            <Input id={`pe-${invoice.id}`} name="files" type="file" multiple accept="image/*,.pdf,.zip,.xml" />
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[12px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="animate-spin" aria-hidden="true" />}{t("payment.record")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Allocate an existing ledger entry — a payment that may cover several
// invoices, or a separately evidenced fee — to this invoice.
export function LinkEntryDialog({ invoice, candidates }: { invoice: Inv; candidates: Candidate[] }) {
  const t = useTranslations("invoices");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"PAYMENT" | "FEE">("PAYMENT");
  const [entryId, setEntryId] = useState("");
  const { saving, err, submit, clearErr } = useSubmit(() => setOpen(false), t("toast.linked", { kind, direction: invoice.direction }));

  const wanted = kind === "FEE" ? "EXPENSE" : invoice.direction === "RECEIVABLE" ? "INCOME" : "EXPENSE";
  const choices = candidates.filter((c) => c.type === wanted && c.currency === invoice.currency && !c.linkedTo.includes(invoice.id));
  const entry = choices.find((c) => c.id === entryId);
  const suggested = entry ? Math.round(Math.min(entry.free, Math.max(invoice.difference, 0)) * 100) / 100 : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" aria-label={t("link.trigger")} title={t("link.trigger")} />}>
        <Link2 />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("link.title", { label: label(invoice, t) })}</DialogTitle></DialogHeader>
        <form className="grid gap-4" onChange={clearErr} onSubmit={(e) => submit(e, (fd) => linkToInvoice(invoice.id, fd), { kind, transactionId: entryId })}>
          <div className="grid gap-2">
            <div className="wf-seg justify-self-start" role="group" aria-label={t("link.kind")}>
              {([["PAYMENT", t("kind.PAYMENT")], ["FEE", t("kind.FEE")]] as const).map(([k, text]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setEntryId(""); clearErr(); }}>{text}</button>
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">
              {kind === "PAYMENT"
                ? t("link.paymentHelp")
                : t("link.feeHelp")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`le-${invoice.id}`}>{t("link.entry")}</Label>
            <Select value={entryId} onValueChange={(v) => { setEntryId(v || ""); clearErr(); }}>
              <SelectTrigger id={`le-${invoice.id}`} className="w-full">
                {entry
                  ? <span className="truncate" title={entry.description ?? entry.accountName}>{entry.date} · {t("link.free", { amount: fmtMoney(entry.free, entry.currency) })} · {entry.description ?? entry.accountName}</span>
                  : <span className="text-muted-foreground">{t("link.chooseEntry")}</span>}
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id} disabled={kind === "FEE" && !c.hasEvidence}>
                    {c.date} · {c.free < c.amount
                      ? t("link.freeOf", { amount: fmtMoney(c.free, c.currency), total: fmtMoney(c.amount, c.currency) })
                      : t("link.free", { amount: fmtMoney(c.free, c.currency) })} · {c.description ?? c.accountName}
                    {kind === "FEE" && !c.hasEvidence ? ` ${t("link.noEvidence")}` : ""}
                  </SelectItem>
                ))}
                {choices.length === 0 && <SelectItem value="none" disabled>{t("link.noChoices", { type: wanted, currency: invoice.currency })}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`la-${invoice.id}`}>{t("link.amount", { label: label(invoice, t), currency: invoice.currency })}</Label>
            <Input key={entryId} id={`la-${invoice.id}`} name="amount" type="number" step="any" min="0" defaultValue={suggested} required />
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[12px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving || !entryId}>{saving && <Loader2 className="animate-spin" aria-hidden="true" />}{t("link.submit")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
