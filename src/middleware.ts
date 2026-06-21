import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const path = req.nextUrl.pathname;
  const isAuthRoute = path.startsWith("/login");
  const isApiRoute = path.startsWith("/api");
  const isOnboardRoute = path.startsWith("/onboard");

  if (!isLoggedIn && !isAuthRoute && !isApiRoute) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isLoggedIn) {
    const mustChange = req.auth?.user?.mustChangePassword as boolean;
    const is2faEnabled = req.auth?.user?.twoFactorEnabled as boolean;
    // Lock-box onboarding: change the default password, then enrol 2FA.
    const needsOnboarding = mustChange || !is2faEnabled;

    // Force pending users through the onboarding wizard
    if (needsOnboarding && !isOnboardRoute && !isApiRoute && !isAuthRoute) {
      return Response.redirect(new URL("/onboard", req.nextUrl));
    }

    // Fully onboarded users shouldn't sit on /login or /onboard
    if (!needsOnboarding && (isAuthRoute || isOnboardRoute)) {
      return Response.redirect(new URL("/", req.nextUrl));
    }

    // Still onboarding but landed on /login → send to the wizard
    if (needsOnboarding && isAuthRoute) {
      return Response.redirect(new URL("/onboard", req.nextUrl));
    }
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
