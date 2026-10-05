// The languages we ship, and one message file per area of the app
// (messages/<locale>/<namespace>.json).
export const LOCALES = ["en", "vi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const isLocale = (v: unknown): v is Locale => v === "en" || v === "vi";

export const NAMESPACES = [
  "common", "auth", "dashboard", "ledger", "invoices", "projects", "contacts",
  "accounts", "bank", "costs", "reports", "handover", "settings", "profile",
] as const;
export type Namespace = (typeof NAMESPACES)[number];

// For Intl number/date formatting.
export const intlLocale = (l: string) => (l === "vi" ? "vi-VN" : "en-US");

export const LOCALE_COOKIE = "NEXT_LOCALE";
