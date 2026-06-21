"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { markInvoicePaid } from "@/app/actions/invoices";

type OpenItem = {
  id: string; number: string | null; direction: string; party: string | null;
  amount: number; currency: string; amountVnd: number; dueDate: string; overdue: boolean;
};

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
const money = (i: { currency: string; amount: number }) =>
  i.currency === "USD" ? "$" + new Intl.NumberFormat("en-US").format(i.amount) : vnd(i.amount);

export function ProjectOutstanding({ items }: { items: OpenItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing outstanding — all invoices &amp; bills on this project are settled.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md flex-wrap">
          <div className="flex items-center gap-2 min-w-[160px]">
            {i.direction === "PAYABLE"
              ? <ArrowUpRight className="h-4 w-4 text-red-500" />
              : <ArrowDownLeft className="h-4 w-4 text-green-600" />}
            <div className="flex flex-col">
              <span className="text-sm font-medium flex items-center gap-2">
                {i.direction === "PAYABLE" ? "You owe" : "Owed to you"}
                {i.overdue
                  ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Overdue</span>
                  : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Unpaid</span>}
              </span>
              <span className="text-xs text-muted-foreground">{[i.number, i.party].filter(Boolean).join(" · ") || "—"} · due {i.dueDate}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-semibold ${i.direction === "PAYABLE" ? "text-red-600" : "text-green-700"}`}>{money(i)}</span>
            <Dialog>
              <DialogTrigger render={<Button variant="outline" size="sm" className="h-8 gap-1 text-green-700" disabled={busyId === i.id} />}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark paid
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Mark {i.number || "this"} paid</DialogTitle></DialogHeader>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    setBusyId(i.id);
                    try { await markInvoicePaid(i.id, fd); router.refresh(); } finally { setBusyId(null); }
                  }}
                  className="space-y-4 pt-2"
                >
                  <p className="text-sm text-muted-foreground">Records the {i.direction === "PAYABLE" ? "expense" : "income"} in the ledger, dated below.</p>
                  <div className="space-y-2">
                    <Label htmlFor={`pd-${i.id}`}>Payment date</Label>
                    <Input id={`pd-${i.id}`} name="paidDate" type="date" defaultValue={today} required />
                  </div>
                  <Button type="submit" className="w-full">Confirm payment</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      ))}
    </div>
  );
}
