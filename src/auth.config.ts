import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Hard 12-hour session cap (no infinite rolling). Idle auto-logout (30 min)
  // is enforced client-side via <IdleLogout/> in the dashboard layout.
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  providers: [], // Add Node-specific providers in auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.twoFactorEnabled = user.twoFactorEnabled;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
