import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
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

        const user = await prisma.user.findUnique({
          where: { username: credentials.username as string },
        });

        if (!user) return null;

        // Deactivated accounts cannot sign in (admin can re-enable)
        if (!user.isActive) return null;

        // Locked out after 5 failed attempts. An account with 2FA can still sign
        // in while locked — but only with the right password AND a valid code —
        // so strangers failing on purpose can't keep its owner out. (The reply
        // never says which part was wrong, and nginx limits attempts per IP.)
        const locked = !!user.lockedUntil && user.lockedUntil > new Date();
        if (locked && !user.twoFactorEnabled) return null;

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        let ok = passwordsMatch;
        if (ok && user.twoFactorEnabled) {
          ok = !!credentials.token && speakeasy.totp.verify({
            secret: user.twoFactorSecret as string,
            encoding: "base32",
            token: credentials.token as string,
            window: 1, // tolerate ±30s clock drift between server and authenticator
          });
        }

        if (!ok) {
          // Wrong password or 2FA → count the failed attempt (in the database, so
          // parallel guesses can't share one count); lock at 5.
          const { failedLoginAttempts } = await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: { increment: 1 } },
            select: { failedLoginAttempts: true },
          });
          if (failedLoginAttempts >= 5) {
            await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });
          }
          return null;
        }

        // Success → clear any failed-attempt / lock state.
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          name: user.username,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
});
