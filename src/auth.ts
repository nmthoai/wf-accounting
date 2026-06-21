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

        const passwordsMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        );

        if (!passwordsMatch) return null;

        // If user has 2FA enabled, verify the token
        if (user.twoFactorEnabled) {
          if (!credentials.token) return null; // Token required
          
          const isValidToken = speakeasy.totp.verify({
            secret: user.twoFactorSecret as string,
            encoding: "base32",
            token: credentials.token as string,
            window: 1, // tolerate ±30s clock drift between server and authenticator
          });

          if (!isValidToken) return null;
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
