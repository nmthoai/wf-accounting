"use server";

import { cookies } from "next/headers";

export async function setLocale(locale: string) {
  if (locale !== "en" && locale !== "vi") return; // only the languages we ship
  const cookieStore = await cookies();
  cookieStore.set("NEXT_LOCALE", locale, { path: "/" });
}
