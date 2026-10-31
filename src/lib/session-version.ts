import { prisma } from "@/lib/prisma";

// A session token lasts up to 12 hours, but it is only honoured while its user
// still exists, is active and hasn't had a password or 2FA reset (or been
// deactivated) since it signed in — each of those bumps sessionVersion. So a
// session from before a reset can't finish the reset's onboarding itself.
// Tokens from before sessionVersion existed count as version 0.
export async function isSessionCurrent(userId: string | undefined, version: number | undefined) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true, sessionVersion: true } });
  return !!user && user.isActive && user.sessionVersion === (version ?? 0);
}

// What a reset or a deactivation writes, to end the user's existing sessions.
export const endSessions = { sessionVersion: { increment: 1 } } as const;
