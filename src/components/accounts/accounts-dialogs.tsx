"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleAlert, Loader2 } from "lucide-react";
import { saveAccount, createLoan, updateLoan, recordMovement, updateMovement, classifyMovement, createTransfer, updateTransfer } from "@/app/actions/accounts";
import { ACCOUNT_TYPE_LABEL, vnToday } from "@/lib/money";
import { AccountSelect, type AccountOpt } from "./account-select";
import { notify, notifyFailure } from "@/components/ui/toast";

type Result = { success: boolean; message?: string };

export type AccountRow = AccountOpt & {
  notes: string | null; openingBalance: number; openingDate: string | null; balance: number; movementCount: number;
};
export type LoanRow = { id: string; lender: string; currency: string; notes: string | null; received: number; repaid: number; outstanding: number; movementCount: number };
export type CategoryOpt = { id: string; name: string; type: string };
// status: DRAFT / REVIEWED / POSTED; reversal = cancels a posted movement; reversed = cancelled by one.
type Workflow = { status: string; reversal: boolean; reversed: boolean; rejectedReason?: string | null };
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
      notifyFailure();
    } finally {
      setSaving(false);
    }
  }
  return { saving, err, submit, clearErr: () => setErr("") };
}

function CurrencyToggle({ label, value, onChange, disabled }: { label: string; value: string; onChange: (c: string) => void; disabled?: boolean }) {
  return (
    <div className={`wf-seg wf-seg--mono w-fit ${disabled ? "opacity-(--opacity-disabled)" : ""}`} role="group" aria-label={label}>
      {["VND", "USD"].map((c) => (
        <button key={c} type="button" disabled={disabled} aria-pressed={value === c} onClick={() => onChange(c)}
          className="disabled:cursor-not-allowed">{c}</button>
      ))}
    </div>
  );
}

function SaveButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <Button type="submit" className="w-full" disabled={saving}>
      {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : label}
    </Button>
  );
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{children}
    </p>
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
        <form className="grid gap-4 pt-1" onSubmit={(e) => submit(e, (fd) => saveAccount(account?.id ?? null, fd), { type, currency, isActive: String(active) })}>
          <div className="grid gap-2">
            <Label htmlFor="acc-name">{t("form.name")}</Label>
            <Input id="acc-name" name="name" defaultValue={account?.name} placeholder={t("accountDialog.namePlaceholder")} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>{t("form.type")}</Label>
              <Select value={type} onValueChange={(v) => setType(v || "BANK")}>
                <SelectTrigger><span>{tc(`accountType.${type}`)}</span></SelectTrigger>
                <SelectContent>
                  {Object.keys(ACCOUNT_TYPE_LABEL).map((k) => <SelectItem key={k} value={k}>{tc(`accountType.${k}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{t("form.currency")}</Label>
              <CurrencyToggle label={t("form.currency")} value={currency} onChange={setCurrency} disabled={locked} />
              {locked && <p className="text-[13.5px] text-muted-foreground">{t("accountDialog.currencyFixed")}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acc-open">{t("accountDialog.openingBalance", { currency })}</Label>
              <Input id="acc-open" name="openingBalance" type="number" step="any" defaultValue={account?.openingBalance ?? 0} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acc-odate">{t("accountDialog.asOfDate")}</Label>
              <Input id="acc-odate" name="openingDate" type="date" defaultValue={account?.openingDate ?? ""} />
            </div>
          </div>
          <p className="text-[13.5px] text-muted-foreground">
            {t("accountDialog.openingHelp")}
            {type === "OWNER" && ` ${t("accountDialog.openingHelpOwner")}`}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="acc-notes">{t("form.notesOptional")}</Label>
            <Input id="acc-notes" name="notes" defaultValue={account?.notes ?? ""} placeholder={t("accountDialog.notesPlaceholder")} />
          </div>
          {account && (
            <label className="flex items-start gap-2 text-[14.5px] text-text-secondary">
              <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t("accountDialog.active")}
            </label>
          )}
          {err && <FormError>{err}</FormError>}
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
  const { saving, err, submit, clearErr } = useSubmit(() => setOpen(false), transfer ? t("toast.transferSaved") : t("toast.transferRecorded"));

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
        <form className="grid gap-4 pt-1" onSubmit={(e) => submit(
          e,
          (fd) => (transfer ? updateTransfer(transfer.transferId, fd) : createTransfer(fd)),
          { fromAccountId: fromId, toAccountId: toId, amountOut: out, amountIn: cross ? inn : out },
        )}>
          <p className="text-[13.5px] text-muted-foreground">{t("transferDialog.intro")}</p>
          <div className="grid grid-cols-2 gap-4">
            {/* A changed choice clears the last submit's error (e.g. "choose two different accounts"). */}
            <div className="grid gap-2"><Label htmlFor="tr-from">{t("transferDialog.from")}</Label><AccountSelect id="tr-from" className="w-full" accounts={pick} value={fromId} onChange={(id) => { setFromId(id); clearErr(); }} /></div>
            <div className="grid gap-2"><Label htmlFor="tr-to">{t("transferDialog.to")}</Label><AccountSelect id="tr-to" className="w-full" accounts={pick} value={toId} onChange={(id) => { setToId(id); clearErr(); }} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tr-out">{from ? t("transferDialog.amountSentIn", { currency: from.currency }) : t("transferDialog.amountSent")}</Label>
              <Input id="tr-out" type="number" step="any" min="0" value={out} onChange={(e) => setOut(e.target.value)} required />
            </div>
            {cross && (
              <div className="grid gap-2">
                <Label htmlFor="tr-in">{t("transferDialog.amountReceived", { currency: to!.currency })}</Label>
                <Input id="tr-in" type="number" step="any" min="0" value={inn} onChange={(e) => setInn(e.target.value)} required />
              </div>
            )}
          </div>
          {cross && (
            <p className="text-[13.5px] text-muted-foreground">
              {t("transferDialog.exactFigures")}{" "}
              {rate && t.rich("transferDialog.rate", {
                rate: new Intl.NumberFormat("vi-VN").format(Math.round(rate * 100) / 100),
                b: (c) => <span className="wf-num font-semibold text-foreground">{c}</span>,
              })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label htmlFor="tr-date">{t("form.date")}</Label><Input id="tr-date" name="date" type="date" defaultValue={transfer?.date ?? today()} required /></div>
            <div className="grid gap-2"><Label htmlFor="tr-desc">{t("form.noteOptional")}</Label><Input id="tr-desc" name="description" defaultValue={transfer?.description ?? ""} placeholder={t("transferDialog.notePlaceholder")} /></div>
          </div>
          {err && <FormError>{err}</FormError>}
          <SaveButton saving={saving} label={transfer ? t("transferDialog.save") : t("transferDialog.record")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Capital, loan and unclassified movements -------------------------------

const BASE_KINDS = ["CAPITAL_IN", "LOAN_IN", "LOAN_REPAY"];
// Bank interest, as banks word it ("Lai nhap von", "TRA LAI TIEN GUI"). Plain
// unaccented "lai" isn't enough: "tra lai" is also a refund, and Lai a surname.
const INTEREST = /interest|lãi|lai nhap von|tra lai tien gui|tien lai/i;

export function MovementDialog({ accounts, loans, categories, movement, trigger }: {
  accounts: AccountOpt[]; loans: LoanRow[]; categories: CategoryOpt[]; movement?: SingleRow; trigger: React.ReactElement;
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const unclassified = !!movement?.kind.startsWith("OTHER_");
  // Money in that reads like bank interest starts as income under the interest
  // category, when there is one (categories are never created here).
  const interest = movement?.kind === "OTHER_IN" && INTEREST.test(movement.description ?? "");
  const interestCategory = interest ? categories.find((c) => c.type === "INCOME" && INTEREST.test(c.name)) : undefined;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(interest ? "INCOME" : movement?.kind ?? "CAPITAL_IN");
  const [accountId, setAccountId] = useState(movement?.accountId ?? "");
  const [loanId, setLoanId] = useState(movement?.loanId ?? "");
  const [categoryId, setCategoryId] = useState(interestCategory?.id ?? "");
  const pnl = kind === "INCOME" || kind === "EXPENSE";
  const { saving, err, submit } = useSubmit(
    () => setOpen(false),
    pnl ? t(kind === "INCOME" ? "toast.classifiedIncome" : "toast.classifiedExpense") : movement ? t("toast.movementSaved") : t("toast.movementRecorded"),
  );

  // Unclassified rows (bank interest, fees, card charges, refunds, or rows
  // carried over from the old Balance tab) can be reclassified — as financing,
  // or as income (money in) or an expense (money out).
  const kinds = unclassified ? [...BASE_KINDS, movement!.kind === "OTHER_IN" ? "INCOME" : "EXPENSE", "OTHER_IN", "OTHER_OUT"] : BASE_KINDS;
  const pick = accounts.filter((a) => a.isActive || a.id === accountId);
  const account = accounts.find((a) => a.id === accountId);
  const isLoan = kind === "LOAN_IN" || kind === "LOAN_REPAY";
  const loanChoices = loans.filter((l) => !account || l.currency === account.currency);
  const loan = loans.find((l) => l.id === loanId);
  const categoryChoices = categories.filter((c) => c.type === kind);
  const category = categoryChoices.find((c) => c.id === categoryId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{unclassified ? t("movementDialog.classifyTitle") : movement ? t("movementDialog.editTitle") : t("movementDialog.newTitle")}</DialogTitle></DialogHeader>
        <form className="grid gap-4 pt-1" onSubmit={(e) => submit(
          e,
          (fd) => (movement && pnl ? classifyMovement(movement.id, fd) : movement ? updateMovement(movement.id, fd) : recordMovement(fd)),
          { type: kind, accountId, loanId: isLoan ? loanId : "", categoryId: pnl ? categoryId : "" },
        )}>
          <div className="grid gap-2">
            <Label>{t("movementDialog.whatIsIt")}</Label>
            <Select value={kind} onValueChange={(v) => setKind(v || "CAPITAL_IN")}>
              <SelectTrigger><span>{tc(`type.${kind}`)}</span></SelectTrigger>
              <SelectContent>
                {kinds.map((k) => <SelectItem key={k} value={k}>{tc(`type.${k}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[13.5px] text-muted-foreground">
              {pnl ? t(kind === "INCOME" ? "movementDialog.pnlHelpIncome" : "movementDialog.pnlHelpExpense") : t("movementDialog.financingHelp")}
            </p>
          </div>
          {pnl && (
            <div className="grid gap-2">
              <Label>{t("movementDialog.category")}</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v || "")}>
                <SelectTrigger>{category ? <span>{category.name}</span> : <span className="text-muted-foreground">{t("movementDialog.chooseCategory")}</span>}</SelectTrigger>
                <SelectContent>
                  {categoryChoices.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  {categoryChoices.length === 0 && (
                    <SelectItem value="none" disabled>{t(kind === "INCOME" ? "movementDialog.noIncomeCategories" : "movementDialog.noExpenseCategories")}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {kind === "INCOME" && interest && !interestCategory && (
                <p className="text-[13.5px] text-warn">{t("movementDialog.interestNoCategory")}</p>
              )}
            </div>
          )}
          <div className="grid gap-2"><Label htmlFor="mv-account">{t("form.account")}</Label><AccountSelect id="mv-account" className="w-full" accounts={pick} value={accountId} onChange={setAccountId} /></div>
          {isLoan && (
            <div className="grid gap-2">
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
            <div className="grid gap-2">
              <Label htmlFor="mv-amt">{account ? t("movementDialog.amountIn", { currency: account.currency }) : t("movementDialog.amount")}</Label>
              <Input id="mv-amt" name="amount" type="number" step="any" min="0" defaultValue={movement?.amount} required />
            </div>
            <div className="grid gap-2"><Label htmlFor="mv-date">{t("form.date")}</Label><Input id="mv-date" name="date" type="date" defaultValue={movement?.date ?? today()} required /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="mv-desc">{t("form.noteOptional")}</Label><Input id="mv-desc" name="description" defaultValue={movement?.description ?? ""} /></div>
          {err && <FormError>{err}</FormError>}
          <SaveButton saving={saving} label={movement ? t("movementDialog.save") : t("movementDialog.record")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- New or edited loan (editing: admin) ------------------------------------

export function LoanDialog({ loan, trigger }: { loan?: LoanRow; trigger: React.ReactElement }) {
  const t = useTranslations("accounts");
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState(loan?.currency ?? "VND");
  const { saving, err, submit } = useSubmit(() => setOpen(false), loan ? t("toast.loanSaved") : t("toast.loanAdded"));
  // Movements recorded against a loan are in its currency, so it stays.
  const locked = !!loan && loan.movementCount > 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{loan ? t("loanDialog.editTitle") : t("loanDialog.title")}</DialogTitle></DialogHeader>
        <form className="grid gap-4 pt-1" onSubmit={(e) => submit(e, (fd) => (loan ? updateLoan(loan.id, fd) : createLoan(fd)), { currency })}>
          <div className="grid gap-2"><Label htmlFor="ln-lender">{t("loanDialog.lender")}</Label><Input id="ln-lender" name="lender" defaultValue={loan?.lender} placeholder={t("loanDialog.lenderPlaceholder")} required /></div>
          <div className="grid gap-2">
            <Label>{t("form.currency")}</Label>
            <CurrencyToggle label={t("form.currency")} value={currency} onChange={setCurrency} disabled={locked} />
            {locked && <p className="text-[13.5px] text-muted-foreground">{t("loanDialog.currencyFixed", { count: loan!.movementCount })}</p>}
          </div>
          <div className="grid gap-2"><Label htmlFor="ln-notes">{t("form.notesOptional")}</Label><Input id="ln-notes" name="notes" defaultValue={loan?.notes ?? ""} placeholder={t("loanDialog.notesPlaceholder")} /></div>
          {!loan && <p className="text-[13.5px] text-muted-foreground">{t("loanDialog.help")}</p>}
          {err && <FormError>{err}</FormError>}
          <SaveButton saving={saving} label={loan ? t("loanDialog.save") : t("loanDialog.add")} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
