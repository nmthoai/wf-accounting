"use client";

import { useLocale } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();

  const handleSwitch = async () => {
    const newLocale = locale === "en" ? "vi" : "en";
    await setLocale(newLocale);
    // Reload to apply locale server-side
    window.location.reload();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSwitch} className="font-semibold text-xs h-8">
      {locale === "en" ? "VI" : "EN"}
    </Button>
  );
}
