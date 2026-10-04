"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, Loader2 } from "lucide-react";
import { markInvoicePaid } from "@/app/actions/invoices";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";

export function MarkPaidDialog({ invoice, accounts }: {
  invoice: { id: string; number: string | null; direction: string; currency: string };
  accounts: AccountOpt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  // Suggest the bank account in the invoice's currency; the user confirms or changes it.
  const usable = accounts.filter((a) => a.isActive && (invoice.currency === "USD" || a.currency === "VND"));
  const suggested = usable.find((a) => a.type === "BANK" && a.currency === invoice.currency);
  const [accountId, setAccountId] = useState(suggested?.id ?? "");
  const label = invoice.number || (invoice.direction === "PAYABLE" ? "bill" : "invoice");
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    fd.set("accountId", accountId);
    try {
      const res = await markInvoicePaid(invoice.id, fd);
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 text-green-700" />}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Mark {label} paid</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Records the {invoice.direction === "PAYABLE" ? "expense" : "income"} in the ledger, in the account and on the date below.
          </p>
          <div className="space-y-2">
            <Label>{invoice.direction === "PAYABLE" ? "Paid from" : "Received into"}</Label>
            <AccountSelect accounts={usable} value={accountId} onChange={setAccountId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`pd-${invoice.id}`}>Payment date</Label>
            <Input id={`pd-${invoice.id}`} name="paidDate" type="date" defaultValue={today} required />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm payment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
