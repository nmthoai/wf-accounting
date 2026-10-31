"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Check, CircleAlert, Loader2, Lock, Undo2 } from "lucide-react";
import { postEntries, reverseEntry, reviewEntries } from "@/app/actions/ledger";
import { notify, notifyFailure } from "@/components/ui/toast";
import { RejectDialog } from "@/components/ledger/reject-dialog";
import { Notice } from "@/components/wf/ledger-ui";

type Ref = { id: string; label: string } | null;

const refLink = "font-semibold text-primary underline-offset-4 hover:underline";

// Where an entry stands in Draft → Reviewed → Posted, and what the owner can do next.
export function EntryStatus({ id, status, isAdmin, reversalOf, reversedBy, correctionOf, withFee = false, rejection = null }: {
  id: string; status: string; isAdmin: boolean; reversalOf: Ref; reversedBy: Ref; correctionOf: Ref;
  withFee?: boolean; // a receipt with a withheld bank fee, or that fee: reversed together
  rejection?: { reason: string; by: string | null } | null; // why the owner sent it back
}) {
  const t = useTranslations("ledger");
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
      else notifyFailure(res.message);
      router.refresh();
    } catch { notifyFailure(); }
    finally { setBusy(false); }
  }

  async function reverse() {
    setBusy(true); setErr("");
    try {
      const res = await reverseEntry(id, reason);
      if (!res.success) { setErr(res.message ?? t("status.reverseFailed")); return; }
      notify.success(t("toast.reversed"), t("toast.reversedNext"));
      setOpen(false);
      // A receipt with a withheld fee is corrected by recording the payment
      // again on its invoice; anything else is re-entered here.
      router.push(withFee ? "/invoices" : `/entry?reenter=${id}`);
    } catch { notifyFailure(); }
    finally { setBusy(false); }
  }

  const tone = status === "DRAFT" ? "warning" : status === "REJECTED" ? "error" : "info";
  const text = reversalOf
    ? t.rich("status.reversalOf", { label: reversalOf.label, link: (c) => <Link className={refLink} href={`/entry/${reversalOf.id}`}>{c}</Link> })
    : reversedBy
      ? t.rich("status.reversedBy", { label: reversedBy.label, link: (c) => <Link className={refLink} href={`/entry/${reversedBy.id}`}>{c}</Link> })
      : status === "DRAFT" ? t("status.draft")
        : status === "REJECTED" ? (isAdmin ? t("status.rejectedOwner") : t("status.rejected"))
        : status === "REVIEWED" ? t("status.reviewed")
          : t("status.posted");

  return (
    <Notice tone={tone} icon={status === "POSTED" ? Lock : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <p>{text}</p>
          {status === "REJECTED" && rejection && (
            <p className="mt-1 font-semibold text-neg">
              {rejection.by ? t("status.rejectedReasonBy", { reason: rejection.reason, name: rejection.by }) : t("status.rejectedReason", { reason: rejection.reason })}
            </p>
          )}
          {correctionOf && <p className="mt-1 text-[13.5px]">{t.rich("status.correctionOf", { label: correctionOf.label, link: (c) => <Link className={refLink} href={`/entry/${correctionOf.id}`}>{c}</Link> })}</p>}
        </div>
        {isAdmin && !reversalOf && !reversedBy && (
          <div className="flex flex-wrap gap-2">
            {(status === "DRAFT" || status === "REJECTED") && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => reviewEntries([id]), t("toast.approved"))}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check className="text-pos" aria-hidden="true" />}{t("buttons.approve")}
              </Button>
            )}
            {status === "DRAFT" && <RejectDialog id={id} />}
            {status === "REVIEWED" && (
              <Button size="sm" variant="outline" disabled={busy}
                onClick={() => { if (confirm(t("status.confirmPost"))) run(() => postEntries([id]), t("toast.posted")); }}>
                <Lock aria-hidden="true" />{t("buttons.post")}
              </Button>
            )}
            {status === "POSTED" && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger render={<Button size="sm" variant="outline" />}><Undo2 aria-hidden="true" />{t("buttons.reverse")}</DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("reverse.title")}</DialogTitle>
                    <DialogDescription>{t("reverse.body")}</DialogDescription>
                    {withFee && <p className="text-[15px] text-text-secondary">{t("reverse.withFee")}</p>}
                  </DialogHeader>
                  {/* A form, like the Reject dialog, so Enter in the reason submits. */}
                  <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); if (reason.trim() && !busy) reverse(); }}>
                    <div className="grid gap-2">
                      <Label htmlFor="reverse-reason">{t("reverse.reason")}</Label>
                      <Input id="reverse-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reverse.reasonPlaceholder")} />
                    </div>
                    {err && (
                      <p className="flex items-start gap-1.5 text-[13.5px] text-destructive">
                        <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />{err}
                      </p>
                    )}
                    <DialogFooter>
                      <Button type="submit" disabled={busy || !reason.trim()}>
                        {busy && <Loader2 className="animate-spin" aria-hidden="true" />}{t("reverse.submit")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        )}
      </div>
    </Notice>
  );
}
