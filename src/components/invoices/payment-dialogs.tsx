"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { recordPayment, linkToInvoice } from "@/app/actions/invoices";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { fmtMoney , vnToday } from "@/lib/money";

type Inv = { id: string; number: string | null; direction: string; currency: string; difference: number };
export type Candidate = {
  id: string; type: string; date: string; amount: number; currency: string; description: string | null;
  accountName: string; hasEvidence: boolean; free: number; linkedTo: string[];
};

const label = (i: Inv) => i.number || (i.direction === "PAYABLE" ? "bill" : "invoice");

function useSubmit(close: () => void) {
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
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      close();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }
  return { saving, err, submit };
}

// Record money received/paid against this invoice — all of it or part.
export function RecordPaymentDialog({ invoice, accounts, defaultUsdRate }: { invoice: Inv; accounts: AccountOpt[]; defaultUsdRate: number }) {
  const [open, setOpen] = useState(false);
  const { saving, err, submit } = useSubmit(() => setOpen(false));
  // VND invoices settle through VND accounts; foreign ones through any account.
  const usable = accounts.filter((a) => a.isActive && (invoice.currency !== "VND" || a.currency === "VND"));
  const suggested = usable.find((a) => a.type === "BANK" && a.currency === invoice.currency) ?? usable.find((a) => a.type === "BANK");
  const [accountId, setAccountId] = useState(suggested?.id ?? "");
  const account = accounts.find((a) => a.id === accountId);
  const foreign = invoice.currency !== "VND";
  // Into a VND account, a foreign amount settles at the bank's actual VND figure.
  const [rateMode, setRateMode] = useState<"BANK" | "MANUAL" | "DEFAULT">(foreign && invoice.currency !== "USD" ? "BANK" : "DEFAULT");
  const modes: ["BANK" | "MANUAL" | "DEFAULT", string][] = [
    ...(account?.currency === "VND" ? [["BANK", "Actual VND settled"] as ["BANK", string]] : []),
    ["MANUAL", "Enter rate"],
    ...(invoice.currency === "USD" ? [["DEFAULT", `Default (${new Intl.NumberFormat("vi-VN").format(defaultUsdRate)})`] as ["DEFAULT", string]] : []),
  ];
  const mode = modes.some(([m]) => m === rateMode) ? rateMode : modes[0][0];
  const today = vnToday();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 text-green-700" />}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Record payment
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record payment — {label(invoice)}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, (fd) => recordPayment(invoice.id, fd), { accountId, rateMode: foreign ? mode : "" })}>
          <p className="text-sm text-muted-foreground">
            Adds the {invoice.direction === "PAYABLE" ? "payment" : "receipt"} to the ledger and links it to this {label(invoice)}.
            Still open: <span className="font-medium text-foreground">{fmtMoney(invoice.difference, invoice.currency)}</span>
          </p>
          <div className="space-y-2">
            <Label>{invoice.direction === "PAYABLE" ? "Paid from" : "Received into"}</Label>
            <AccountSelect accounts={usable} value={accountId} onChange={setAccountId} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`pa-${invoice.id}`}>Amount ({invoice.currency})</Label>
              <Input key={invoice.difference} id={`pa-${invoice.id}`} name="amount" type="number" step="any" min="0" defaultValue={Math.round(invoice.difference * 100) / 100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`pd-${invoice.id}`}>Payment date</Label>
              <Input id={`pd-${invoice.id}`} name="paidDate" type="date" defaultValue={today} required />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Enter what actually arrived. Any shortfall stays visible as an unmatched difference — it is never assumed to be a fee.</p>
          {foreign && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/30">
              <Label>VND value</Label>
              <div className="flex bg-muted p-0.5 rounded text-xs font-medium w-fit">
                {modes.map(([m, text]) => (
                  <button key={m} type="button" onClick={() => setRateMode(m)}
                    className={`px-2 py-1 rounded-sm ${mode === m ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</button>
                ))}
              </div>
              {mode === "BANK" && <Input name="vndAmount" type="number" step="1" min="0" required placeholder="VND exactly as on the bank statement" />}
              {mode === "MANUAL" && <Input name="rate" type="number" step="any" min="0" required placeholder={`VND per ${invoice.currency}`} />}
            </div>
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Record payment"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Allocate an existing ledger entry — a payment that may cover several
// invoices, or a separately evidenced fee — to this invoice.
export function LinkEntryDialog({ invoice, candidates }: { invoice: Inv; candidates: Candidate[] }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"PAYMENT" | "FEE">("PAYMENT");
  const [entryId, setEntryId] = useState("");
  const { saving, err, submit } = useSubmit(() => setOpen(false));

  const wanted = kind === "FEE" ? "EXPENSE" : invoice.direction === "RECEIVABLE" ? "INCOME" : "EXPENSE";
  const choices = candidates.filter((c) => c.type === wanted && c.currency === invoice.currency && !c.linkedTo.includes(invoice.id));
  const entry = choices.find((c) => c.id === entryId);
  const suggested = entry ? Math.round(Math.min(entry.free, Math.max(invoice.difference, 0)) * 100) / 100 : "";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Link an existing ledger entry" />}>
        <Link2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Link a ledger entry — {label(invoice)}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => submit(e, (fd) => linkToInvoice(invoice.id, fd), { kind, transactionId: entryId })}>
          <div className="flex bg-muted p-1 rounded-lg text-sm">
            {([["PAYMENT", "Payment"], ["FEE", "Evidenced fee"]] as const).map(([k, text]) => (
              <button key={k} type="button" onClick={() => { setKind(k); setEntryId(""); }}
                className={`flex-1 py-1.5 rounded-md font-medium ${kind === k ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {kind === "PAYMENT"
              ? "Use this when one bank transfer covers several invoices, or the payment is already in the ledger."
              : "Only a fee with evidence attached (bank advice or receipt) can explain part of an invoice. A difference on its own is never treated as a fee."}
          </p>
          <div className="space-y-2">
            <Label>Ledger entry</Label>
            <Select value={entryId} onValueChange={(v) => setEntryId(v || "")}>
              <SelectTrigger>
                {entry
                  ? <span className="truncate">{entry.date} · {fmtMoney(entry.free, entry.currency)} free · {entry.description ?? entry.accountName}</span>
                  : <span className="text-muted-foreground">Choose an entry</span>}
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.id} value={c.id} disabled={kind === "FEE" && !c.hasEvidence}>
                    {c.date} · {fmtMoney(c.free, c.currency)} free{c.free < c.amount ? ` of ${fmtMoney(c.amount, c.currency)}` : ""} · {c.description ?? c.accountName}
                    {kind === "FEE" && !c.hasEvidence ? " (no evidence attached)" : ""}
                  </SelectItem>
                ))}
                {choices.length === 0 && <SelectItem value="none" disabled>No {wanted === "INCOME" ? "income" : "expense"} entries in {invoice.currency} with money left to allocate</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`la-${invoice.id}`}>Amount for this {label(invoice)} ({invoice.currency})</Label>
            <Input key={entryId} id={`la-${invoice.id}`} name="amount" type="number" step="any" min="0" defaultValue={suggested} required />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving || !entryId}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Link"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
