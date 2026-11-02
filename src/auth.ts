import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { isSessionCurrent } from "@/lib/session-version";
import { authConfig } from "./auth.config";

const MAX_TRIES = 5;
const LOCK_MS = 15 * 60 * 1000;

// A real cost-10 bcrypt hash that no password matches. An unknown, inactive or
// locked account is still checked against it, so the reply takes as long as a
// wrong password and the timing doesn't tell which usernames exist.
const DUMMY_HASH = "$2b$10$wwYJWYAXloHy67QKeiSyWuv8LbY/wnjvs.XrnaPrCYeJYd/R/JsEG";

// The 30-second step of the code, if it is valid within ±1 step (clock drift
// between server and authenticator), else null.
function codeStep(secret: string, token: string) {
  const now = Date.now();
  const res = speakeasy.totp.verifyDelta({ secret, encoding: "base32", token, window: 1, time: now / 1000 });
  return res ? Math.floor(now / 30000) + res.delta : null;
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Every request re-checks the session against the database; a stale one
    // returns null, which signs it out (the cookie is cleared).
    async jwt(params) {
      const token = await authConfig.callbacks.jwt(params);
      if (!token) return null; // past the 12-hour cap
      if (params.user) return token; // just signed in
      return (await isSessionCurrent(token.id as string | undefined, token.sessionVersion as number | undefined)) ? token : null;
    },
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        token: { label: "2FA Token", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        const password = String(credentials.password);
        const now = new Date();

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        // A lock from wrong codes that has run out starts a fresh count.
        if (user && user.failedCodeAttempts >= MAX_TRIES && !(user.lockedUntil && user.lockedUntil > now)) {
          await prisma.user.updateMany({
            where: { id: user.id, failedCodeAttempts: { gte: MAX_TRIES }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
            data: { failedCodeAttempts: 0 },
          });
          user.failedCodeAttempts = 0;
        }

        // Locked for 15 minutes after 5 wrong passwords or 5 wrong 2FA codes.
        // An account with 2FA locked by wrong *passwords* can still sign in with
        // the right password and a valid code, so strangers failing on purpose
        // can't keep its owner out; a lock from wrong *codes* (only counted after
        // the right password) holds for everyone. The reply never says which
        // part was wrong, and nginx limits attempts per IP.
        const locked = !!user?.lockedUntil && user.lockedUntil > now;
        const codeLocked = locked && (user?.failedCodeAttempts ?? 0) >= MAX_TRIES;
        if (!user || !user.isActive || codeLocked || (locked && !user.twoFactorEnabled)) {
          await bcrypt.compare(password, DUMMY_HASH);
          return null;
        }

        if (!(await bcrypt.compare(password, user.passwordHash))) {
          // Wrong password → count the failed attempt (in the database, so
          // parallel guesses can't share one count); lock at 5.
          const { failedLoginAttempts } = await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true },
          });
          if (failedLoginAttempts >= MAX_TRIES) {
            await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } });
          }
          return null;
        }

        const cleared = { failedLoginAttempts: 0, failedCodeAttempts: 0, lockedUntil: null };
        if (user.twoFactorEnabled) {
          const step = credentials.token ? codeStep(user.twoFactorSecret as string, String(credentials.token)) : null;
          // A code is used once: only a step later than the last accepted one
          // counts, and the conditional write lets one of two parallel sign-ins
          // with the same code through, never both.
          const fresh = step !== null && (await prisma.user.updateMany({
            where: { id: user.id, OR: [{ lastTotpStep: null }, { lastTotpStep: { lt: step } }] },
            data: { ...cleared, lastTotpStep: step },
          })).count === 1;
          if (!fresh) {
            // Right password, wrong (or reused) code → count it; lock at 5.
            const { failedCodeAttempts } = await prisma.user.update({
              where: { id: user.id },
              data: { failedCodeAttempts: { increment: 1 } },
              select: { failedCodeAttempts: true },
            });
            if (failedCodeAttempts >= MAX_TRIES) {
              await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + LOCK_MS) } });
            }
            return null;
          }
        } else if (user.failedLoginAttempts > 0 || user.failedCodeAttempts > 0 || user.lockedUntil) {
          // Success → clear any failed-attempt / lock state.
          await prisma.user.update({ where: { id: user.id }, data: cleared });
        }

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
