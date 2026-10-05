import { ReactNode } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopNav } from "@/components/layout/top-nav";
import { IdleLogout } from "@/components/auth/idle-logout";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Only for the greeting — each page checks access itself.
  const session = await getSession();
  const me = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true } })
    : null;

  return (
    <div className="flex h-screen overflow-hidden bg-background bg-wf-pattern">
      <IdleLogout />
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <TopNav greeting={me ? me.displayName || me.username : null} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative z-10">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
