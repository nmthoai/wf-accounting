import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

// The language for this request: the signed-in user's saved choice, else the
// browser's cookie (the login page), else English. Outside a request (tests,
// scripts) it is English.
export async function resolveLocale(): Promise<Locale> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { locale: true } });
      if (isLocale(user?.locale)) return user.locale;
    }
  } catch {
    // no session available
  }
  try {
    const asked = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(asked)) return asked;
  } catch {
    // not inside a request
  }
  return DEFAULT_LOCALE;
}
