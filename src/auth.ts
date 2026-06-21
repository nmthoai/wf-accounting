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

        // Account is currently locked out (5 failed attempts) — reject until it expires.
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

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
          // Wrong password or 2FA → count the failed attempt; lock at 5.
          const attempts = user.failedLoginAttempts + 1;
          await prisma.user.update({
            where: { id: user.id },
            data: attempts >= 5
              ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
              : { failedLoginAttempts: attempts },
          });
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
