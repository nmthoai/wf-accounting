"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { rejectEntries } from "@/app/actions/ledger";
import { notify, notifyFailure } from "@/components/ui/toast";

// The owner's alternative to approving a draft: send it back to whoever
// entered it, with the reason they need to correct it.
export function RejectDialog({ id, compact = false }: { id: string; compact?: boolean }) {
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function reject() {
    setBusy(true); setErr("");
    try {
      const res = await rejectEntries([id], reason);
      if (!res.success) { setErr(res.message ?? tc("errors.somethingWrong")); return; }
      notify.success(t("toast.rejected"));
      setOpen(false); setReason("");
      router.refresh();
    } catch { notifyFailure(); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErr(""); }}>
      <DialogTrigger render={compact
        ? <Button variant="ghost" size="icon-sm" className="text-neg hover:bg-destructive/10 hover:text-neg" title={t("rowActions.reject")} aria-label={t("rowActions.reject")} />
        : <Button size="sm" variant="destructive" />}>
        <X aria-hidden="true" />{!compact && t("buttons.reject")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("reject.title")}</DialogTitle>
          <DialogDescription>{t("reject.body")}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !busy) reject(); }}>
          <div className="grid gap-2">
            <Label htmlFor={`reject-${id}`}>{t("reject.reason")}</Label>
            <Input id={`reject-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reject.reasonPlaceholder")} autoFocus />
          </div>
          {err && (
            <p className="flex items-start gap-1.5 text-[13.5px] text-destructive">
              <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>
              {busy && <Loader2 className="animate-spin" aria-hidden="true" />}{t("reject.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
