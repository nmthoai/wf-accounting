import { useLocale, useTranslations } from "next-intl";
import { intlLocale } from "@/i18n/config";
import type { View } from "@/lib/money";
import { Chip } from "@/components/wf/ledger-ui";

// Marks a summary shown in USD: VND amounts in it are converted at the
// Settings rate, so they are estimates. Nothing in the VND view.
export function ViewNote({ view }: { view: View }) {
  const t = useTranslations("common.view");
  const locale = useLocale();
  if (view.currency === "VND") return null;
  const rate = new Intl.NumberFormat(intlLocale(locale)).format(view.rate);
  return <Chip tone="info" mono dot title={t("usdHint", { rate })}>{t("usdNote", { rate })}</Chip>;
}
