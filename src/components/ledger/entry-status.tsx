"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, Loader2, Lock, Undo2 } from "lucide-react";
import { postEntries, reverseEntry, reviewEntries } from "@/app/actions/ledger";
import { notify } from "@/components/ui/toast";

type Ref = { id: string; label: string } | null;

// Where an entry stands in Draft → Reviewed → Posted, and what the owner can do next.
export function EntryStatus({ id, status, isAdmin, reversalOf, reversedBy, correctionOf }: {
  id: string; status: string; isAdmin: boolean; reversalOf: Ref; reversedBy: Ref; correctionOf: Ref;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");

  async function run(fn: () => Promise<{ success: boolean; message?: string }>, done: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.success) notify.success(done);
      else if (res.message) notify.error(res.message);
      router.refresh();
    } catch { notify.error("Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  async function reverse() {
    setBusy(true); setErr("");
    try {
      const res = await reverseEntry(id, reason);
      if (!res.success) { setErr(res.message ?? "Could not reverse."); return; }
      notify.success("Entry reversed", "Now enter the corrected version");
      setOpen(false);
      router.push(`/entry?reenter=${id}`); // enter the corrected version
    } catch { notify.error("Something went wrong — please try again."); }
    finally { setBusy(false); }
  }

  const tone = status === "DRAFT" ? "border-amber-300 bg-amber-50" : status === "POSTED" ? "border-slate-300 bg-slate-50" : "border-blue-200 bg-blue-50";
  const text = reversalOf
    ? <>This reversal cancels <Link className="underline" href={`/entry/${reversalOf.id}`}>{reversalOf.label}</Link>. It is posted and can&apos;t change.</>
    : reversedBy
      ? <>Posted, then reversed by <Link className="underline" href={`/entry/${reversedBy.id}`}>{reversedBy.label}</Link> — it no longer counts.</>
      : status === "DRAFT" ? "Draft — waiting for the owner's review. Not counted in balances or reports yet."
        : status === "REVIEWED" ? "Reviewed — counted in balances and reports. Posting locks it for the accountant."
          : "Posted — locked. Evidence and tax review can still be updated; to change anything else, reverse it and enter the correction.";

  return (
    <div className={`rounded-md border p-3 text-sm flex items-center justify-between gap-3 flex-wrap ${tone}`}>
      <div className="flex items-start gap-2">
        {status === "POSTED" && <Lock className="h-4 w-4 mt-0.5 shrink-0" />}
        <div>
          <p>{text}</p>
          {correctionOf && <p className="text-xs mt-1">Correction of <Link className="underline" href={`/entry/${correctionOf.id}`}>{correctionOf.label}</Link>.</p>}
        </div>
      </div>
      {isAdmin && !reversalOf && !reversedBy && (
        <div className="flex gap-2">
          {status === "DRAFT" && (
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => run(() => reviewEntries([id]), "Entry approved")}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
            </Button>
          )}
          {status === "REVIEWED" && (
            <Button size="sm" variant="outline" className="gap-1" disabled={busy}
              onClick={() => { if (confirm("Post this entry? It will be locked; corrections then go through a reversal.")) run(() => postEntries([id]), "Entry posted"); }}>
              <Lock className="h-3.5 w-3.5" /> Post
            </Button>
          )}
          {status === "POSTED" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1" />}><Undo2 className="h-3.5 w-3.5" /> Reverse…</DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Reverse a posted entry</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    A posted reversal cancels this entry in full; both stay on record. Its bank match and invoice links are released
                    so the corrected entry — which you enter next — can take them.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reverse-reason">Reason</Label>
                    <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. wrong amount — bank shows 8,221,200" />
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                  <Button className="w-full" disabled={busy || !reason.trim()} onClick={reverse}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reverse and enter the correction"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </div>
  );
}
