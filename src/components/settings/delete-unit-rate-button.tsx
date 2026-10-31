"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { deleteUnitRate } from "@/app/actions/settings";
import { notify, notifyResult } from "@/components/ui/toast";

// Delete a unit rate — after a confirm, like the category delete.
export function DeleteUnitRateButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(t("unitRates.deleteConfirm", { name }))) return;
    setBusy(true);
    try {
      notifyResult(await deleteUnitRate(id), t("unitRates.toast.deleted"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(false); }
  }
  return (
    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" disabled={busy} onClick={remove} title={tc("actions.delete")} aria-label={tc("actions.delete")}>
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
    </Button>
  );
}
