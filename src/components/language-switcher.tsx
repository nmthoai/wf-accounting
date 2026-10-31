"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";

// .en | .vi as a mono segmented control. Signed in, the choice is saved on the profile.
export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common.language");
  const [busy, setBusy] = useState(false);

  async function choose(next: string) {
    if (next === locale || busy) return;
    setBusy(true);
    await setLocale(next);
    // Reload so every server-rendered part comes back in the new language.
    window.location.reload();
  }

  return (
    <div role="group" aria-label={t("label")} className={cn("wf-seg wf-seg--mono", busy && "opacity-60")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={t(l)}
          aria-pressed={locale === l}
          disabled={busy}
          onClick={() => choose(l)}
        >
          .{l}
        </button>
      ))}
    </div>
  );
}
