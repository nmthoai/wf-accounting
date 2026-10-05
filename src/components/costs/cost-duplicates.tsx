"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { linkCostItem } from "@/app/actions/costs";
import { notify, notifyResult } from "@/components/ui/toast";

export type Lookalike = { id: string; date: string; label: string; amount: string };

// Expenses already in the ledger that may be this receipt's payment — link
// one instead of creating a second expense.
export function CostDuplicates({ itemId, lookalikes }: { itemId: string; lookalikes: Lookalike[] }) {
  const t = useTranslations("costs");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  if (lookalikes.length === 0) return null;
  async function link(id: string) {
    setBusy(id);
    try {
      const res = await linkCostItem(itemId, id);
      if (!notifyResult(res, t("toast.linked"), t("toast.couldNotLink"))) return;
      router.push("/costs");
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(null); }
  }
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-sm">
      <p className="font-medium text-amber-800">{t("duplicates.intro")}</p>
      {lookalikes.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-2 bg-white/70 p-2 rounded-md">
          <span className="truncate">{l.date} · {l.label}</span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="font-medium">{l.amount}</span>
            <Button size="sm" variant="outline" className="h-7" disabled={!!busy} onClick={() => link(l.id)}>
              {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : t("duplicates.link")}
            </Button>
          </span>
        </div>
      ))}
      <p className="text-xs text-amber-800/80">{t("duplicates.otherwise")}</p>
    </div>
  );
}
