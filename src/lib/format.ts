import { intlLocale } from "@/i18n/config";

// Dates in the books are stored as UTC midnight: show that calendar day.
// Vietnamese reads 05/10/2026; English keeps the existing 10/5/2026.
export function fmtDate(d: Date | string | number, locale: string, opts?: Intl.DateTimeFormatOptions) {
  const base: Intl.DateTimeFormatOptions = locale === "vi" && !opts ? { day: "2-digit", month: "2-digit", year: "numeric" } : {};
  return new Date(d).toLocaleDateString(intlLocale(locale), { timeZone: "UTC", ...base, ...opts });
}

// Real moments (created at, changed at): shown in Vietnam time.
export function fmtDateTime(d: Date | string | number, locale: string) {
  return new Date(d).toLocaleString(intlLocale(locale), {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// "October 2026" / "tháng 10 năm 2026" for a YYYY-MM month.
export function fmtMonth(month: string, locale: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(intlLocale(locale), { timeZone: "UTC", month: "long", year: "numeric" });
}
