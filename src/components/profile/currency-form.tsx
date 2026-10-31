"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { notify, notifyResult } from "@/components/ui/toast";
import { setDisplayCurrency } from "@/app/actions/profile";

const CHOICES = ["VND", "USD"] as const;

export function CurrencyForm({ current }: { current: string }) {
  const t = useTranslations("profile");
  const router = useRouter();
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  async function choose(currency: (typeof CHOICES)[number]) {
    if (currency === value || saving) return;
    setSaving(true);
    try {
      if (notifyResult(await setDisplayCurrency(currency), t("toast.currencySaved", { currency }))) {
        setValue(currency);
        router.refresh();
      }
    } catch {
      notify.error(t("toast.connectionError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset aria-label={t("currency.label")} disabled={saving} className="wf-seg m-0 flex w-full min-w-0 sm:w-64">
      {CHOICES.map((c) => (
        <button key={c} type="button" aria-pressed={value === c} className="wf-num h-9 flex-1 justify-center disabled:cursor-not-allowed" onClick={() => choose(c)}>
          {c}
        </button>
      ))}
    </fieldset>
  );
}
