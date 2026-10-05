import { prisma } from "@/lib/prisma";
import { getT } from "@/i18n/server";

// The company-wide default USD rate is the admin's setting (Settings → Global),
// so staff entries use the same rate as the owner's.
export async function defaultUsdRate() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", isActive: true }, orderBy: { createdAt: "asc" } });
  return admin?.defaultUsdRate || 25400;
}

type Fx =
  | { ok: true; exchangeRate: number; vndAmount: number | null; rateSource: string | null }
  | { ok: false; message: string };

// How a foreign-currency amount converts to VND, from the form's rateMode:
//   BANK    — the exact VND actually settled (rate is derived from it)
//   MANUAL  — an explicit rate
//   DEFAULT — the company default rate (USD only; there is no default for other currencies)
export async function resolveFx(currency: string, amount: number, formData: FormData): Promise<Fx> {
  if (currency === "VND") return { ok: true, exchangeRate: 1, vndAmount: null, rateSource: null };
  const t = await getT("accounts");
  const mode = formData.get("rateMode") as string;
  if (mode === "BANK") {
    const vnd = parseFloat(formData.get("vndAmount") as string);
    if (!(vnd > 0)) return { ok: false, message: t("fx.vndSettled") };
    return { ok: true, exchangeRate: vnd / amount, vndAmount: vnd, rateSource: "BANK" };
  }
  if (mode === "MANUAL") {
    const rate = parseFloat(formData.get("rate") as string);
    if (!(rate > 0)) return { ok: false, message: t("fx.invalidRate") };
    return { ok: true, exchangeRate: rate, vndAmount: null, rateSource: "MANUAL" };
  }
  if (currency !== "USD") {
    return { ok: false, message: t("fx.noDefaultRate", { currency }) };
  }
  return { ok: true, exchangeRate: await defaultUsdRate(), vndAmount: null, rateSource: "DEFAULT" };
}
