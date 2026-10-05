import { createTranslator } from "next-intl";
import { resolveLocale } from "./locale";
import { MESSAGES } from "./messages";
import type { Locale, Namespace } from "./config";

// Translations for server actions, API routes and server-side helpers — places
// where next-intl's request config isn't available (and the test runner).
// Pages and layouts use getTranslations from next-intl/server instead.
export type Translate = (key: string, values?: Record<string, string | number | Date>) => string;

export function translator(locale: Locale, namespace: Namespace): Translate {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace }) as unknown as Translate;
}

export async function getT(namespace: Namespace): Promise<Translate> {
  return translator(await resolveLocale(), namespace);
}
