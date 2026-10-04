import { prisma } from "@/lib/prisma";

// The company-wide default USD rate is the admin's setting (Settings → Global),
// so staff entries use the same rate as the owner's.
export async function defaultUsdRate() {
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
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
  const mode = formData.get("rateMode") as string;
  if (mode === "BANK") {
    const vnd = parseFloat(formData.get("vndAmount") as string);
    if (!(vnd > 0)) return { ok: false, message: "Enter the VND amount actually settled." };
    return { ok: true, exchangeRate: vnd / amount, vndAmount: vnd, rateSource: "BANK" };
  }
  if (mode === "MANUAL") {
    const rate = parseFloat(formData.get("rate") as string);
    if (!(rate > 0)) return { ok: false, message: "Enter a valid exchange rate." };
    return { ok: true, exchangeRate: rate, vndAmount: null, rateSource: "MANUAL" };
  }
  if (currency !== "USD") {
    return { ok: false, message: `There is no default ${currency} rate — enter the VND actually settled, or the rate.` };
  }
  return { ok: true, exchangeRate: await defaultUsdRate(), vndAmount: null, rateSource: "DEFAULT" };
}
