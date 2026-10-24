"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { rejectEntries } from "@/app/actions/ledger";
import { notify } from "@/components/ui/toast";

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
    } catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setErr(""); }}>
      <DialogTrigger render={compact
        ? <Button variant="ghost" size="icon" className="h-8 w-8 text-red-700 hover:bg-red-50" title={t("rowActions.reject")} />
        : <Button size="sm" variant="outline" className="gap-1 text-red-700" />}>
        <X className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />{!compact && ` ${t("buttons.reject")}`}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("reject.title")}</DialogTitle></DialogHeader>
        <form className="space-y-4 pt-2" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !busy) reject(); }}>
          <p className="text-sm text-muted-foreground">{t("reject.body")}</p>
          <div className="space-y-2">
            <Label htmlFor={`reject-${id}`}>{t("reject.reason")}</Label>
            <Input id={`reject-${id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reject.reasonPlaceholder")} autoFocus />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" variant="destructive" className="w-full" disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("reject.submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
