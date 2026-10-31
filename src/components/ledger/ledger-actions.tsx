"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Lock, Pencil, Trash2 } from "lucide-react";
import { deleteTransaction, postEntries, reviewEntries } from "@/app/actions/ledger";
import { notify, notifyResult } from "@/components/ui/toast";
import { RejectDialog } from "@/components/ledger/reject-dialog";

// Per-row actions: open, approve or reject a draft (admin), delete if not posted (admin).
export function RowActions({ id, href, status, isAdmin }: { id: string; href: string; status: string; isAdmin: boolean }) {
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); notify.success(done); router.refresh(); }
    catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusy(false); }
  }
  const openLabel = status === "POSTED" ? t("rowActions.openPosted") : tc("actions.edit");
  return (
    <div className="ml-auto flex w-[4.25rem] flex-wrap justify-end gap-1 @min-[80rem]:w-auto @min-[80rem]:flex-nowrap">
      {isAdmin && (status === "DRAFT" || status === "REJECTED") && (
        <Button variant="ghost" size="icon-sm" className="text-pos hover:text-pos" title={t("rowActions.approve")} aria-label={t("rowActions.approve")} disabled={busy}
          onClick={() => run(() => reviewEntries([id]), t("toast.approved"))}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
        </Button>
      )}
      {isAdmin && status === "DRAFT" && <RejectDialog id={id} compact />}
      <Button variant="ghost" size="icon-sm" render={<Link href={href} />} nativeButton={false} title={openLabel} aria-label={openLabel}>
        {status === "POSTED" ? <Lock aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      </Button>
      {isAdmin && status !== "POSTED" && (
        <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" title={tc("actions.delete")} aria-label={tc("actions.delete")} disabled={busy}
          onClick={() => { if (confirm(t("rowActions.confirmDelete"))) run(() => deleteTransaction(id), t("toast.deleted")); }}>
          <Trash2 aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

// Month-end close: lock every reviewed entry dated up to the chosen day.
export function PostThrough({ defaultDate, reviewedCount }: { defaultDate: string; reviewedCount: number }) {
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  async function post() {
    if (!confirm(t("postThrough.confirm", { date }))) return;
    setBusy(true);
    try {
      const res = await postEntries(null, date);
      notifyResult(res, t("postThrough.done", { count: res.count }), t("postThrough.failed"));
      router.refresh();
    } catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-card py-1 pr-1 pl-3.5">
      <label htmlFor="post-through" className="wf-label">{t("postThrough.label")}</label>
      <Input id="post-through" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40 font-mono" />
      <Button size="sm" variant="outline" disabled={busy || !date || reviewedCount === 0} onClick={post}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Lock aria-hidden="true" />}{t("buttons.post")}
      </Button>
    </div>
  );
}
