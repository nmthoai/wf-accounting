"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
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
    } catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusy(false); }
  }

  async function reverse() {
    setBusy(true); setErr("");
    try {
      const res = await reverseEntry(id, reason);
      if (!res.success) { setErr(res.message ?? t("status.reverseFailed")); return; }
      notify.success(t("toast.reversed"), t("toast.reversedNext"));
      setOpen(false);
      router.push(`/entry?reenter=${id}`); // enter the corrected version
    } catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusy(false); }
  }

  const tone = status === "DRAFT" ? "border-amber-300 bg-amber-50" : status === "POSTED" ? "border-slate-300 bg-slate-50" : "border-blue-200 bg-blue-50";
  const text = reversalOf
    ? t.rich("status.reversalOf", { label: reversalOf.label, link: (c) => <Link className="underline" href={`/entry/${reversalOf.id}`}>{c}</Link> })
    : reversedBy
      ? t.rich("status.reversedBy", { label: reversedBy.label, link: (c) => <Link className="underline" href={`/entry/${reversedBy.id}`}>{c}</Link> })
      : status === "DRAFT" ? t("status.draft")
        : status === "REVIEWED" ? t("status.reviewed")
          : t("status.posted");

  return (
    <div className={`rounded-md border p-3 text-sm flex items-center justify-between gap-3 flex-wrap ${tone}`}>
      <div className="flex items-start gap-2">
        {status === "POSTED" && <Lock className="h-4 w-4 mt-0.5 shrink-0" />}
        <div>
          <p>{text}</p>
          {correctionOf && <p className="text-xs mt-1">{t.rich("status.correctionOf", { label: correctionOf.label, link: (c) => <Link className="underline" href={`/entry/${correctionOf.id}`}>{c}</Link> })}</p>}
        </div>
      </div>
      {isAdmin && !reversalOf && !reversedBy && (
        <div className="flex gap-2">
          {status === "DRAFT" && (
            <Button size="sm" className="gap-1" disabled={busy} onClick={() => run(() => reviewEntries([id]), t("toast.approved"))}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("buttons.approve")}
            </Button>
          )}
          {status === "REVIEWED" && (
            <Button size="sm" variant="outline" className="gap-1" disabled={busy}
              onClick={() => { if (confirm(t("status.confirmPost"))) run(() => postEntries([id]), t("toast.posted")); }}>
              <Lock className="h-3.5 w-3.5" /> {t("buttons.post")}
            </Button>
          )}
          {status === "POSTED" && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button size="sm" variant="outline" className="gap-1" />}><Undo2 className="h-3.5 w-3.5" /> {t("buttons.reverse")}</DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("reverse.title")}</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    {t("reverse.body")}
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="reverse-reason">{t("reverse.reason")}</Label>
                    <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reverse.reasonPlaceholder")} />
                  </div>
                  {err && <p className="text-sm text-destructive">{err}</p>}
                  <Button className="w-full" disabled={busy || !reason.trim()} onClick={reverse}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("reverse.submit")}
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
