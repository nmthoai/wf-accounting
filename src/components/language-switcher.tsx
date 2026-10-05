"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";

// EN | VI, styled like the currency toggle on the entry form. Signed in, the
// choice is saved on the profile.
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
    <div role="group" aria-label={t("label")} className={cn("flex bg-muted p-0.5 rounded text-xs font-medium", busy && "opacity-60")}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={t(l)}
          aria-pressed={locale === l}
          disabled={busy}
          onClick={() => choose(l)}
          className={cn("px-2 py-0.5 rounded-sm uppercase transition-all", locale === l ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
