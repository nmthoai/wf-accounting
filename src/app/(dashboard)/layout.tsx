import { ReactNode } from "react";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { IdleLogout } from "@/components/auth/idle-logout";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { intlLocale } from "@/i18n/config";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only for the greeting — each page checks access itself.
  const session = await getSession();
  const me = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true } })
    : null;
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  // Today in Vietnam, for the top bar: "Sat, Oct 31, 2026".
  const today = new Date().toLocaleDateString(intlLocale(await getLocale()), {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  return (
    <div className="relative z-10 flex h-screen overflow-hidden">
      <IdleLogout />
      <AppSidebar isAdmin={session?.user?.role === "ADMIN"} />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopNav
          greeting={me ? me.displayName || me.username : null}
          isAdmin={session?.user?.role === "ADMIN"}
          theme={theme}
          today={today}
        />
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          <div className="wf-rise">{children}</div>
        </main>
      </div>
    </div>
  );
}
