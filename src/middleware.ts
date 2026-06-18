import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith("/login");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");

  if (!isLoggedIn && !isAuthRoute && !isApiRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn) {
    const is2faEnabled = req.auth?.user?.twoFactorEnabled as boolean;
    const isSetupRoute = req.nextUrl.pathname.startsWith("/setup-2fa");

    // Force user to setup 2FA if they haven't yet
    if (!is2faEnabled && !isSetupRoute && !isApiRoute && !isAuthRoute) {
      return Response.redirect(new URL("/setup-2fa", req.nextUrl));
    }

    // Redirect away from login if already logged in
    if (isAuthRoute) {
      return Response.redirect(new URL(is2faEnabled ? "/" : "/setup-2fa", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
