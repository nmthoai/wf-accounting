"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { saveAccount, createLoan, recordMovement, updateMovement, createTransfer, updateTransfer } from "@/app/actions/accounts";
import { ACCOUNT_TYPE_LABEL, vnToday } from "@/lib/money";
import { AccountSelect, type AccountOpt } from "./account-select";
import { notify } from "@/components/ui/toast";

type Result = { success: boolean; message?: string };

export type AccountRow = AccountOpt & {
  notes: string | null; openingBalance: number; openingDate: string | null; balance: number; movementCount: number;
};
export type LoanRow = { id: string; lender: string; currency: string; notes: string | null; received: number; repaid: number; outstanding: number };
// status: DRAFT / REVIEWED / POSTED; reversal = cancels a posted movement; reversed = cancelled by one.
type Workflow = { status: string; reversal: boolean; reversed: boolean };
export type TransferRow = Workflow & {
  isTransfer: true; id: string; transferId: string; date: string; description: string | null;
  fromAccountId: string | null; fromName: string; amountOut: number; currencyOut: string;
  toAccountId: string | null; toName: string; amountIn: number; currencyIn: string; rate: number | null;
};
export type SingleRow = Workflow & {
  isTransfer: false; kind: string; id: string; date: string; description: string | null;
  accountId: string | null; accountName: string; amount: number; currency: string; loanId: string | null; lender: string | null;
};

const today = vnToday;

// Shared submit plumbing: build FormData, run the action, confirm, close + refresh on success.
function useSubmit(close: () => void, done: string) {
  const tc = useTranslations("common");
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>, run: (fd: FormData) => Promise<Result>, extra: Record<string, string>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    try {
      const res = await run(fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      notify.success(done);
      close();
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }
  return { saving, err, submit };
}

function CurrencyToggle({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className={`flex bg-muted p-0.5 rounded text-xs font-medium w-fit ${disabled ? "opacity-50" : ""}`}>
      {["VND", "USD"].map((c) => (
        <button key={c} type="button" disabled={disabled} onClick={() => onChange(c)}
          className={`px-3 py-1 rounded-sm ${value === c ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{c}</button>
      ))}
    </div>
  );
}

function SaveButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <Button type="submit" className="w-full" disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : label}
    </Button>
  );
}

// ---- Account (admin) --------------------------------------------------------

export function AccountDialog({ account, trigger }: { account?: AccountRow; trigger: React.ReactElement }) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(account?.type ?? "BANK");
  const [currency, setCurrency] = useState(account?.currency ?? "VND");
  const [active, setActive] = useState(account?.isActive ?? true);
  const { saving, err, submit } = useSubmit(() => setOpen(false), account ? t("toast.accountSaved") : t("toast.accountAdded"));
  const locked = !!account && account.movementCount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? t("accountDialog.editTitle", { name: account.name }) : t("accountDialog.newTitle")}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, (fd) => saveAccount(account?.id ?? null, fd), { type, currency, isActive: String(active) })}>
          <div className="space-y-2">
            <Label htmlFor="acc-name">{t("form.name")}</Label>
            <Input id="acc-name" name="name" defaultValue={account?.name} placeholder={t("accountDialog.namePlaceholder")} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("form.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v || "BANK")}>
                <SelectTrigger><span>{tc(`accountType.${type}`)}</span></SelectTrigger>
                <SelectContent>
                  {Object.keys(ACCOUNT_TYPE_LABEL).map((k) => <SelectItem key={k} value={k}>{tc(`accountType.${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("form.currency")}</Label>
              <CurrencyToggle value={currency} onChange={setCurrency} disabled={locked} />
              {locked && <p className="text-xs text-muted-foreground">{t("accountDialog.currencyFixed")}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-open">{t("accountDialog.openingBalance", { currency })}</Label>
              <Input id="acc-open" name="openingBalance" type="number" step="any" defaultValue={account?.openingBalance ?? 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-odate">{t("accountDialog.asOfDate")}</Label>
              <Input id="acc-odate" name="openingDate" type="date" defaultValue={account?.openingDate ?? ""} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("accountDialog.openingHelp")}
            {type === "OWNER" && ` ${t("accountDialog.openingHelpOwner")}`}
          </p>
          <div className="space-y-2">
            <Label htmlFor="acc-notes">{t("form.notesOptional")}</Label>
            <Input id="acc-notes" name="notes" defaultValue={account?.notes ?? ""} placeholder={t("accountDialog.notesPlaceholder")} />
          </div>
          {account && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t("accountDialog.active")}
            </label>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={account ? t("accountDialog.save") : t("accountDialog.add")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Transfer between accounts ---------------------------------------------

export function TransferDialog({ accounts, transfer, trigger }: { accounts: AccountOpt[]; transfer?: TransferRow; trigger: React.ReactElement }) {
  const t = useTranslations("accounts");
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(transfer?.fromAccountId ?? "");
  const [toId, setToId] = useState(transfer?.toAccountId ?? "");
  const [out, setOut] = useState(transfer ? String(transfer.amountOut) : "");
  const [inn, setInn] = useState(transfer ? String(transfer.amountIn) : "");
  const { saving, err, submit } = useSubmit(() => setOpen(false), transfer ? t("toast.transferSaved") : t("toast.transferRecorded"));

  const pick = accounts.filter((a) => a.isActive || a.id === fromId || a.id === toId);
  const from = accounts.find((a) => a.id === fromId);
  const to = accounts.find((a) => a.id === toId);
  const cross = !!from && !!to && from.currency !== to.currency;
  const usd = cross ? (from!.currency === "USD" ? parseFloat(out) : parseFloat(inn)) : NaN;
  const vnd = cross ? (from!.currency === "USD" ? parseFloat(inn) : parseFloat(out)) : NaN;
  const rate = usd > 0 && vnd > 0 ? vnd / usd : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{transfer ? t("transferDialog.editTitle") : t("transferDialog.newTitle")}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(
          e,
          (fd) => (transfer ? updateTransfer(transfer.transferId, fd) : createTransfer(fd)),
          { fromAccountId: fromId, toAccountId: toId, amountOut: out, amountIn: cross ? inn : out },
        )}>
          <p className="text-xs text-muted-foreground">{t("transferDialog.intro")}</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t("transferDialog.from")}</Label><AccountSelect accounts={pick} value={fromId} onChange={setFromId} /></div>
            <div className="space-y-2"><Label>{t("transferDialog.to")}</Label><AccountSelect accounts={pick} value={toId} onChange={setToId} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tr-out">{from ? t("transferDialog.amountSentIn", { currency: from.currency }) : t("transferDialog.amountSent")}</Label>
              <Input id="tr-out" type="number" step="any" min="0" value={out} onChange={(e) => setOut(e.target.value)} required />
            </div>
            {cross && (
              <div className="space-y-2">
                <Label htmlFor="tr-in">{t("transferDialog.amountReceived", { currency: to!.currency })}</Label>
                <Input id="tr-in" type="number" step="any" min="0" value={inn} onChange={(e) => setInn(e.target.value)} required />
              </div>
            )}
          </div>
          {cross && (
            <p className="text-xs text-muted-foreground">
              {t("transferDialog.exactFigures")}{" "}
              {rate && t.rich("transferDialog.rate", {
                rate: new Intl.NumberFormat("vi-VN").format(Math.round(rate * 100) / 100),
                b: (c) => <span className="font-medium text-foreground">{c}</span>,
              })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="tr-date">{t("form.date")}</Label><Input id="tr-date" name="date" type="date" defaultValue={transfer?.date ?? today()} required /></div>
            <div className="space-y-2"><Label htmlFor="tr-desc">{t("form.noteOptional")}</Label><Input id="tr-desc" name="description" defaultValue={transfer?.description ?? ""} placeholder={t("transferDialog.notePlaceholder")} /></div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={transfer ? t("transferDialog.save") : t("transferDialog.record")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Capital, loan and unclassified movements -------------------------------

const BASE_KINDS = ["CAPITAL_IN", "LOAN_IN", "LOAN_REPAY"];

export function MovementDialog({ accounts, loans, movement, trigger }: {
  accounts: AccountOpt[]; loans: LoanRow[]; movement?: SingleRow; trigger: React.ReactElement;
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(movement?.kind ?? "CAPITAL_IN");
  const [accountId, setAccountId] = useState(movement?.accountId ?? "");
  const [loanId, setLoanId] = useState(movement?.loanId ?? "");
  const { saving, err, submit } = useSubmit(() => setOpen(false), movement ? t("toast.movementSaved") : t("toast.movementRecorded"));

  // Unclassified rows (e.g. carried over from the old Balance tab) can be reclassified.
  const kinds = movement?.kind.startsWith("OTHER_") ? [...BASE_KINDS, "OTHER_IN", "OTHER_OUT"] : BASE_KINDS;
  const pick = accounts.filter((a) => a.isActive || a.id === accountId);
  const account = accounts.find((a) => a.id === accountId);
  const isLoan = kind === "LOAN_IN" || kind === "LOAN_REPAY";
  const loanChoices = loans.filter((l) => !account || l.currency === account.currency);
  const loan = loans.find((l) => l.id === loanId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{movement ? t("movementDialog.editTitle") : t("movementDialog.newTitle")}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(
          e,
          (fd) => (movement ? updateMovement(movement.id, fd) : recordMovement(fd)),
          { type: kind, accountId, loanId: isLoan ? loanId : "" },
        )}>
          <div className="space-y-2">
            <Label>{t("movementDialog.whatIsIt")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v || "CAPITAL_IN")}>
              <SelectTrigger><span>{tc(`type.${kind}`)}</span></SelectTrigger>
              <SelectContent>
                {kinds.map((k) => <SelectItem key={k} value={k}>{tc(`type.${k}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("movementDialog.financingHelp")}</p>
          </div>
          <div className="space-y-2"><Label>{t("form.account")}</Label><AccountSelect accounts={pick} value={accountId} onChange={setAccountId} /></div>
          {isLoan && (
            <div className="space-y-2">
              <Label>{t("form.loan")}</Label>
              <Select value={loanId} onValueChange={(v) => setLoanId(v || "")}>
                <SelectTrigger>{loan ? <span>{loan.lender} · {loan.currency}</span> : <span className="text-muted-foreground">{t("movementDialog.chooseLoan")}</span>}</SelectTrigger>
                <SelectContent>
                  {loanChoices.map((l) => <SelectItem key={l.id} value={l.id}>{l.lender} · {l.currency}</SelectItem>)}
                  {loanChoices.length === 0 && <SelectItem value="none" disabled>{t("movementDialog.noLoans", { currency: account?.currency ?? "" })}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mv-amt">{account ? t("movementDialog.amountIn", { currency: account.currency }) : t("movementDialog.amount")}</Label>
              <Input id="mv-amt" name="amount" type="number" step="any" min="0" defaultValue={movement?.amount} required />
            </div>
            <div className="space-y-2"><Label htmlFor="mv-date">{t("form.date")}</Label><Input id="mv-date" name="date" type="date" defaultValue={movement?.date ?? today()} required /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="mv-desc">{t("form.noteOptional")}</Label><Input id="mv-desc" name="description" defaultValue={movement?.description ?? ""} /></div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={movement ? t("movementDialog.save") : t("movementDialog.record")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- New loan ---------------------------------------------------------------

export function LoanDialog({ trigger }: { trigger: React.ReactElement }) {
  const t = useTranslations("accounts");
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("VND");
  const { saving, err, submit } = useSubmit(() => setOpen(false), t("toast.loanAdded"));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{t("loanDialog.title")}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, createLoan, { currency })}>
          <div className="space-y-2"><Label htmlFor="ln-lender">{t("loanDialog.lender")}</Label><Input id="ln-lender" name="lender" placeholder={t("loanDialog.lenderPlaceholder")} required /></div>
          <div className="space-y-2"><Label>{t("form.currency")}</Label><CurrencyToggle value={currency} onChange={setCurrency} /></div>
          <div className="space-y-2"><Label htmlFor="ln-notes">{t("form.notesOptional")}</Label><Input id="ln-notes" name="notes" placeholder={t("loanDialog.notesPlaceholder")} /></div>
          <p className="text-xs text-muted-foreground">{t("loanDialog.help")}</p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={t("loanDialog.add")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
