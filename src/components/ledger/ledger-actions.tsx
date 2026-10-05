"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import { deleteTransaction, postEntries, reviewEntries } from "@/app/actions/ledger";
import { notify, notifyResult } from "@/components/ui/toast";

// Per-row actions: open, approve a draft (admin), delete if not posted (admin).
export function RowActions({ id, href, status, isAdmin }: { id: string; href: string; status: string; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); notify.success(done); router.refresh(); }
    catch { notify.error("Something went wrong — please try again."); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex justify-end gap-1">
      {isAdmin && status === "DRAFT" && (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-700 hover:bg-green-50" title="Approve (mark reviewed)" disabled={busy}
          onClick={() => run(() => reviewEntries([id]), "Entry approved")}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
      )}
      <Link href={href} title={status === "POSTED" ? "Open (posted — locked)" : "Edit"}>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
          {status === "POSTED" ? <Lock className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>
      </Link>
      {isAdmin && status !== "POSTED" && (
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete" disabled={busy}
          onClick={() => { if (confirm("Delete this entry? A transfer deletes both sides.")) run(() => deleteTransaction(id), "Entry deleted"); }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

// Month-end close: lock every reviewed entry dated up to the chosen day.
export function PostThrough({ defaultDate, reviewedCount }: { defaultDate: string; reviewedCount: number }) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  async function post() {
    if (!confirm(`Post every reviewed entry dated up to ${date}? Posted entries are locked — corrections then go through a reversal.`)) return;
    setBusy(true);
    try {
      const res = await postEntries(null, date);
      notifyResult(res, `${res.count} ${res.count === 1 ? "entry" : "entries"} posted`, "Could not post.");
      router.refresh();
    } catch { notify.error("Something went wrong — please try again."); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <span className="text-muted-foreground">Post reviewed entries through</span>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
      <Button size="sm" variant="outline" disabled={busy || !date || reviewedCount === 0} onClick={post} className="gap-1">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-3.5 w-3.5" />} Post
      </Button>
    </div>
  );
}
