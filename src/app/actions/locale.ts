"use server";

import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

// Public: the login page offers the choice too. Signed in, the choice is
// saved on the user's profile so it follows them to other devices.
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return; // only the languages we ship
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  const session = await auth();
  if (session?.user?.id) {
    await prisma.user.updateMany({ where: { id: session.user.id, isActive: true }, data: { locale } });
  }
}
