"use client";

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
import { PAYER, REIMBURSEMENT, COST_STATUS } from "@/lib/costs";
import { uploadProblem } from "@/lib/upload-limit";

export type CostRow = {
  id: string; ref: string | null; provider: string; receiptDate: string; amount: number; currency: string;
  servicePeriodFrom: string | null; servicePeriodTo: string | null; receiptNumber: string | null; billingEntity: string | null;
  payer: string; renewalDate: string | null; reimbursement: string; docStatus: string; status: string;
  notes: string | null; reviewNote: string | null; transactionId: string | null;
  attachments: { id: string; fileName: string; filePath: string }[];
};

const totalsText = (t: Totals) => totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ") || "—";
const period = (i: CostRow) => (i.servicePeriodFrom || i.servicePeriodTo ? `${i.servicePeriodFrom ?? "?"} → ${i.servicePeriodTo ?? "?"}` : null);

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
    const tooBig = uploadProblem(fd.getAll("files") as File[]);
    if (tooBig) { setErr(tooBig); return; }
    setBusy(true); setErr("");
    fd.set("currency", currency); fd.set("payer", payer); fd.set("reimbursement", reimbursement); fd.set("docStatus", docStatus);
    try {
      const res = await saveCostItem(item?.id ?? null, fd);
      if (!res.success) { setErr(res.message ?? "Could not save."); return; }
      setOpen(false);
      router.refresh();
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
        <DialogHeader><DialogTitle>{item ? `${item.provider}${item.ref ? ` · ${item.ref}` : ""}` : "Add a receipt to the register"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          {locked && <p className="text-xs text-muted-foreground">In the ledger — the receipt&apos;s details stay as recorded; the review fields can still change.</p>}
          <fieldset disabled={locked} className="grid gap-4 md:grid-cols-2 min-w-0 border-0 p-0 m-0">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-provider">Provider</Label>
              <Input id="ci-provider" name="provider" required defaultValue={item?.provider} placeholder="e.g. Google Workspace, OpenAI, Contabo" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-date">Receipt date</Label>
              <Input id="ci-date" name="receiptDate" type="date" required defaultValue={item?.receiptDate} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="ci-amount">Amount as printed</Label>
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
              <Label htmlFor="ci-from">Service period from</Label>
              <Input id="ci-from" name="servicePeriodFrom" type="date" defaultValue={item?.servicePeriodFrom ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-to">to</Label>
              <Input id="ci-to" name="servicePeriodTo" type="date" defaultValue={item?.servicePeriodTo ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-number">Invoice / receipt number</Label>
              <Input id="ci-number" name="receiptNumber" defaultValue={item?.receiptNumber ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-billed">Billed to</Label>
              <Input id="ci-billed" name="billingEntity" defaultValue={item?.billingEntity ?? ""} placeholder="As printed — the company, or a person" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-notes">Evidence notes</Label>
              <Input id="ci-notes" name="notes" defaultValue={item?.notes ?? ""} placeholder="Payment method, where the receipt is, anything unusual" />
            </div>
          </fieldset>

          <div className="grid gap-4 md:grid-cols-2 rounded-md border p-3 bg-muted/30">
            <Choice id="ci-payer" label="Paid by" options={PAYER} value={payer} onChange={choosePayer} />
            <Choice id="ci-reimb" label="Reimbursement" options={REIMBURSEMENT} value={reimbursement} onChange={setReimbursement} />
            <Choice id="ci-doc" label="Document" options={DOC_STATUS} value={docStatus} onChange={setDocStatus} />
            <div className="space-y-2">
              <Label htmlFor="ci-renewal">Next renewal</Label>
              <Input id="ci-renewal" name="renewalDate" type="date" defaultValue={item?.renewalDate ?? ""} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-review">Review notes</Label>
              <Input id="ci-review" name="reviewNote" defaultValue={item?.reviewNote ?? ""} placeholder="Business use, the accountant's view, open questions" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="ci-files">Receipt files</Label>
              <Input id="ci-files" name="files" type="file" multiple accept="image/*,application/pdf,.zip" />
              {item && item.attachments.length > 0 && <p className="text-xs text-muted-foreground">{item.attachments.length} already attached</p>}
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : item ? "Save" : "Add to register"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CostsClient({ isAdmin, view, counts, summary, items }: {
  isAdmin: boolean; view: string; counts: Record<string, number>;
  summary: { pending: Totals; owed: Totals; renewals: number }; items: CostRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try {
      const res = await fn();
      if (!res.success && res.message) alert(res.message);
      router.refresh();
    } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pending review</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{totalsText(summary.pending)}</div>
            <p className="text-xs text-muted-foreground mt-1">{counts.pending ?? 0} receipts — evidence, not yet expenses</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Owed to the owner</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold text-amber-700">{totalsText(summary.owed)}</div>
            <p className="text-xs text-muted-foreground mt-1">Owner-paid costs not yet reimbursed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Renewals in the next 30 days</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{summary.renewals}</div>
            <p className="text-xs text-muted-foreground mt-1">From the renewal dates recorded</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          {([["pending", "Pending"], ["converted", "In the ledger"], ["dismissed", "Not company costs"], ["all", "All"]] as const).map(([v, text]) => (
            <Link key={v} href={v === "pending" ? "/costs" : `/costs?view=${v}`}
              className={`px-3 py-1 rounded-md font-medium transition-all ${view === v ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text} ({counts[v] ?? 0})</Link>
          ))}
        </div>
        <ItemDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Add receipt</Button>} />
      </div>

      <Card>
        <CardContent className="p-0">
          {items.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 border-b last:border-0 p-4 flex-wrap">
              <div className="flex flex-col gap-1 min-w-[240px] flex-1">
                <span className="font-medium flex items-center gap-2 flex-wrap">
                  {i.provider}
                  {i.ref && <span className="text-xs text-muted-foreground">{i.ref}</span>}
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${DOC_BADGE[i.docStatus] ?? ""}`}>{DOC_STATUS[i.docStatus] ?? i.docStatus}</span>
                  {i.status !== "PENDING" && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">{COST_STATUS[i.status]}</span>}
                  {i.attachments.map((a) => (
                    <a key={a.id} href={`/api/uploads/${a.filePath.split("/").pop()}`} target="_blank" rel="noreferrer" title={a.fileName} className="text-blue-500 hover:text-blue-700">
                      <Paperclip className="h-3.5 w-3.5" />
                    </a>
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {i.receiptDate}{period(i) ? ` · service ${period(i)}` : ""}{i.receiptNumber ? ` · #${i.receiptNumber}` : ""}
                  {i.billingEntity ? ` · billed to ${i.billingEntity}` : ""}
                </span>
                <span className="text-xs">
                  Paid by {PAYER[i.payer] ?? i.payer}
                  {i.payer !== "COMPANY" && <span className={i.reimbursement === "OWED" ? "text-amber-700" : "text-muted-foreground"}> · {REIMBURSEMENT[i.reimbursement] ?? i.reimbursement}</span>}
                  {i.renewalDate && <span className="text-muted-foreground"> · <CalendarClock className="inline h-3 w-3" /> renews {i.renewalDate}</span>}
                </span>
                {(i.reviewNote || i.notes) && <span className="text-xs text-muted-foreground line-clamp-2" title={[i.reviewNote, i.notes].filter(Boolean).join("\n")}>{i.reviewNote ?? i.notes}</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold mr-2">{fmtMoney(i.amount, i.currency)}</span>
                <ItemDialog item={i} trigger={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Edit"><Pencil className="h-4 w-4" /></Button>} />
                {i.status === "PENDING" && (
                  <Link href={`/entry?costItem=${i.id}`} title="Review and add to the ledger (once)">
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-green-700">To ledger <ArrowRight className="h-3.5 w-3.5" /></Button>
                  </Link>
                )}
                {i.status === "CONVERTED" && i.transactionId && (
                  <Link href={`/entry/${i.transactionId}`}><Button variant="ghost" size="sm" className="h-8">Expense <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
                )}
                {isAdmin && i.status === "PENDING" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Not a company cost" disabled={busyId === i.id}
                    onClick={() => { const r = prompt("Why is this not a company cost?"); if (r?.trim()) run(i.id, () => dismissCostItem(i.id, r)); }}>
                    <Ban className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && i.status === "DISMISSED" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Back to pending" disabled={busyId === i.id}
                    onClick={() => run(i.id, () => reopenCostItem(i.id))}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && i.status !== "CONVERTED" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete (entered by mistake)" disabled={busyId === i.id}
                    onClick={() => { if (confirm(`Delete ${i.provider} ${i.receiptDate}? Its receipt files go too.`)) run(i.id, () => deleteCostItem(i.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nothing here.</div>}
        </CardContent>
      </Card>
    </div>
  );
}
