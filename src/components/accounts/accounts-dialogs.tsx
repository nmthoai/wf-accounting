"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { saveAccount, createLoan, recordMovement, updateMovement, createTransfer, updateTransfer } from "@/app/actions/accounts";
import { ACCOUNT_TYPE_LABEL, TYPE_LABEL , vnToday } from "@/lib/money";
import { AccountSelect, type AccountOpt } from "./account-select";

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

// Shared submit plumbing: build FormData, run the action, close + refresh on success.
function useSubmit(close: () => void) {
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
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      close();
      router.refresh();
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
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(account?.type ?? "BANK");
  const [currency, setCurrency] = useState(account?.currency ?? "VND");
  const [active, setActive] = useState(account?.isActive ?? true);
  const { saving, err, submit } = useSubmit(() => setOpen(false));
  const locked = !!account && account.movementCount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? `Edit ${account.name}` : "New account"}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, (fd) => saveAccount(account?.id ?? null, fd), { type, currency, isActive: String(active) })}>
          <div className="space-y-2">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" name="name" defaultValue={account?.name} placeholder="e.g. MB VND" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v || "BANK")}>
                <SelectTrigger><span>{ACCOUNT_TYPE_LABEL[type]}</span></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Currency</Label>
              <CurrencyToggle value={currency} onChange={setCurrency} disabled={locked} />
              {locked && <p className="text-xs text-muted-foreground">Fixed — account has movements.</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="acc-open">Opening balance ({currency})</Label>
              <Input id="acc-open" name="openingBalance" type="number" step="any" defaultValue={account?.openingBalance ?? 0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-odate">As of date</Label>
              <Input id="acc-odate" name="openingDate" type="date" defaultValue={account?.openingDate ?? ""} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The balance on that date. Movements dated before it are treated as already included.
            {type === "OWNER" && " For an owner account: negative = the company owes the owner; positive = the owner holds company money."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="acc-notes">Notes (optional)</Label>
            <Input id="acc-notes" name="notes" defaultValue={account?.notes ?? ""} placeholder="e.g. account number ending 1234" />
          </div>
          {account && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              Active (inactive accounts are hidden from pickers but keep their history)
            </label>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={account ? "Save account" : "Add account"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Transfer between accounts ---------------------------------------------

export function TransferDialog({ accounts, transfer, trigger }: { accounts: AccountOpt[]; transfer?: TransferRow; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState(transfer?.fromAccountId ?? "");
  const [toId, setToId] = useState(transfer?.toAccountId ?? "");
  const [out, setOut] = useState(transfer ? String(transfer.amountOut) : "");
  const [inn, setInn] = useState(transfer ? String(transfer.amountIn) : "");
  const { saving, err, submit } = useSubmit(() => setOpen(false));

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
        <DialogHeader><DialogTitle>{transfer ? "Edit transfer" : "Transfer between accounts"}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(
          e,
          (fd) => (transfer ? updateTransfer(transfer.transferId, fd) : createTransfer(fd)),
          { fromAccountId: fromId, toAccountId: toId, amountOut: out, amountIn: cross ? inn : out },
        )}>
          <p className="text-xs text-muted-foreground">Moves money between your own accounts. It never counts as income or expense.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>From</Label><AccountSelect accounts={pick} value={fromId} onChange={setFromId} /></div>
            <div className="space-y-2"><Label>To</Label><AccountSelect accounts={pick} value={toId} onChange={setToId} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tr-out">Amount sent {from ? `(${from.currency})` : ""}</Label>
              <Input id="tr-out" type="number" step="any" min="0" value={out} onChange={(e) => setOut(e.target.value)} required />
            </div>
            {cross && (
              <div className="space-y-2">
                <Label htmlFor="tr-in">Amount received ({to!.currency})</Label>
                <Input id="tr-in" type="number" step="any" min="0" value={inn} onChange={(e) => setInn(e.target.value)} required />
              </div>
            )}
          </div>
          {cross && (
            <p className="text-xs text-muted-foreground">
              Use the exact figures from the bank statement.{" "}
              {rate && <>Rate for this transfer: <span className="font-medium text-foreground">{new Intl.NumberFormat("vi-VN").format(Math.round(rate * 100) / 100)} VND/USD</span></>}
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label htmlFor="tr-date">Date</Label><Input id="tr-date" name="date" type="date" defaultValue={transfer?.date ?? today()} required /></div>
            <div className="space-y-2"><Label htmlFor="tr-desc">Note (optional)</Label><Input id="tr-desc" name="description" defaultValue={transfer?.description ?? ""} placeholder="e.g. USD → VND conversion" /></div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={transfer ? "Save transfer" : "Record transfer"} />
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
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(movement?.kind ?? "CAPITAL_IN");
  const [accountId, setAccountId] = useState(movement?.accountId ?? "");
  const [loanId, setLoanId] = useState(movement?.loanId ?? "");
  const { saving, err, submit } = useSubmit(() => setOpen(false));

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
        <DialogHeader><DialogTitle>{movement ? "Edit movement" : "Record capital or loan"}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(
          e,
          (fd) => (movement ? updateMovement(movement.id, fd) : recordMovement(fd)),
          { type: kind, accountId, loanId: isLoan ? loanId : "" },
        )}>
          <div className="space-y-2">
            <Label>What is it?</Label>
            <Select value={kind} onValueChange={(v) => setKind(v || "CAPITAL_IN")}>
              <SelectTrigger><span>{TYPE_LABEL[kind]}</span></SelectTrigger>
              <SelectContent>
                {kinds.map((k) => <SelectItem key={k} value={k}>{TYPE_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Financing — not income or expense. It changes the account balance but never your profit.</p>
          </div>
          <div className="space-y-2"><Label>Account</Label><AccountSelect accounts={pick} value={accountId} onChange={setAccountId} /></div>
          {isLoan && (
            <div className="space-y-2">
              <Label>Loan</Label>
              <Select value={loanId} onValueChange={(v) => setLoanId(v || "")}>
                <SelectTrigger>{loan ? <span>{loan.lender} · {loan.currency}</span> : <span className="text-muted-foreground">Choose loan</span>}</SelectTrigger>
                <SelectContent>
                  {loanChoices.map((l) => <SelectItem key={l.id} value={l.id}>{l.lender} · {l.currency}</SelectItem>)}
                  {loanChoices.length === 0 && <SelectItem value="none" disabled>No {account?.currency ?? ""} loans — add one with “New loan”</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mv-amt">Amount {account ? `(${account.currency})` : ""}</Label>
              <Input id="mv-amt" name="amount" type="number" step="any" min="0" defaultValue={movement?.amount} required />
            </div>
            <div className="space-y-2"><Label htmlFor="mv-date">Date</Label><Input id="mv-date" name="date" type="date" defaultValue={movement?.date ?? today()} required /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="mv-desc">Note (optional)</Label><Input id="mv-desc" name="description" defaultValue={movement?.description ?? ""} /></div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label={movement ? "Save movement" : "Record"} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- New loan ---------------------------------------------------------------

export function LoanDialog({ trigger }: { trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("VND");
  const { saving, err, submit } = useSubmit(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>New loan</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, createLoan, { currency })}>
          <div className="space-y-2"><Label htmlFor="ln-lender">Lender</Label><Input id="ln-lender" name="lender" placeholder="e.g. Owner — Thoai Nguyen" required /></div>
          <div className="space-y-2"><Label>Currency</Label><CurrencyToggle value={currency} onChange={setCurrency} /></div>
          <div className="space-y-2"><Label htmlFor="ln-notes">Notes (optional)</Label><Input id="ln-notes" name="notes" placeholder="Terms, interest, agreement reference…" /></div>
          <p className="text-xs text-muted-foreground">Then record money received and repayments against it — the outstanding amount is calculated for you.</p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <SaveButton saving={saving} label="Add loan" />
        </form>
      </DialogContent>
    </Dialog>
  );
}
