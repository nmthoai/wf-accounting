import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Access to the books needs a user who still exists, is active and has
// finished onboarding (default password changed, 2FA enrolled). This is read
// from the database on every request, not trusted from the 12-hour session
// token — so deactivating someone, deleting them or resetting their password
// or 2FA takes effect immediately. The role comes from the database too.
async function current() {
  const session = await auth();
  if (!session?.user?.id) return { session: null, ok: false };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, role: true, isActive: true, mustChangePassword: true, twoFactorEnabled: true },
  });
  if (!user || !user.isActive) return { session: null, ok: false };
  const fresh = { ...session, user: { ...session.user, name: user.username, role: user.role, mustChangePassword: user.mustChangePassword, twoFactorEnabled: user.twoFactorEnabled } };
  return { session: fresh, ok: !user.mustChangePassword && user.twoFactorEnabled };
}

// For server actions and API routes — the session, or null.
export async function getSession() {
  const { session, ok } = await current();
  return ok ? session : null;
}

// For pages — checked next to the data, not only by the proxy (layouts don't
// re-run on navigation).
export async function requirePageSession() {
  const { session, ok } = await current();
  if (!session) redirect("/login");
  if (!ok) redirect("/onboard");
  return session;
}
