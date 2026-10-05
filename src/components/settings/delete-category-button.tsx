"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { deleteCategory } from "@/app/actions/settings";
import { notify } from "@/components/ui/toast";

// Delete a category — refused, with the reason, while entries or invoices use it.
export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(t("categories.deleteConfirm", { name }))) return;
    setBusy(true);
    try {
      const res = await deleteCategory(id);
      if (res.success) notify.success(t("categories.toast.deleted"), name);
      else notify.error(res.message || t("categories.toast.couldNotDelete"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(false); }
  }
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={busy} onClick={remove} title={tc("actions.delete")}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
