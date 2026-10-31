"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { linkCostItem } from "@/app/actions/costs";
import { notifyResult, notifyFailure } from "@/components/ui/toast";
import { Notice } from "@/components/wf/ledger-ui";

export type Lookalike = { id: string; date: string; label: string; amount: string };

// Expenses already in the ledger that may be this receipt's payment — link
// one instead of creating a second expense.
export function CostDuplicates({ itemId, lookalikes }: { itemId: string; lookalikes: Lookalike[] }) {
  const t = useTranslations("costs");
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
      notifyFailure();
    } finally { setBusy(null); }
  }
  return (
    <Notice tone="warning" title={t("duplicates.intro")}>
      <ul className="mt-2 divide-y divide-border border-y border-border">
        {lookalikes.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-3 py-2">
            <span className="min-w-0 truncate"><span className="wf-num text-foreground">{l.date}</span> · {l.label}</span>
            <span className="flex shrink-0 items-center gap-3">
              <span className="wf-figure text-foreground">{l.amount}</span>
              <Button size="xs" variant="outline" disabled={!!busy} onClick={() => link(l.id)}>
                {busy === l.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("duplicates.link")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-muted-foreground">{t("duplicates.otherwise")}</p>
    </Notice>
  );
}
