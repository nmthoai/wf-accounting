import type { NextAuthConfig } from "next-auth";

export const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Hard 12-hour session cap, counted from sign-in (authTime below): Auth.js
  // re-signs the token on every request, so maxAge alone would roll forever.
  // Idle auto-logout (30 min) is enforced client-side via <IdleLogout/> in the
  // dashboard layout.
  session: { strategy: "jwt", maxAge: SESSION_MAX_MS / 1000 },
  providers: [], // Add Node-specific providers in auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.twoFactorEnabled = user.twoFactorEnabled;
        token.mustChangePassword = user.mustChangePassword;
        token.sessionVersion = user.sessionVersion;
        token.authTime = Date.now();
        return token;
      }
      // Tokens from before authTime existed start their 12 hours now.
      if (typeof token.authTime !== "number") token.authTime = Date.now();
      else if (Date.now() - token.authTime > SESSION_MAX_MS) return null; // ends the session
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.sessionVersion = (token.sessionVersion as number | undefined) ?? 0;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
