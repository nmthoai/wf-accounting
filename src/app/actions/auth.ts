"use server";

import { signIn, signOut, auth } from "@/auth";
import { AuthError } from "next-auth";
import speakeasy from "speakeasy";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getT } from "@/i18n/server";

export async function authenticate(prevState: any, formData: FormData) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      const t = await getT("auth");
      if (error.type === "CredentialsSignin") {
        // Give a clearer message if the account is locked out.
        const username = formData.get("username") as string;
        if (username) {
          const u = await prisma.user.findUnique({ where: { username }, select: { lockedUntil: true, twoFactorEnabled: true } });
          if (u?.lockedUntil && u.lockedUntil > new Date() && !u.twoFactorEnabled) {
            const mins = Math.max(1, Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000));
            return t("errors.locked", { mins });
          }
        }
        return t("errors.invalidCredentials");
      }
      return t("errors.somethingWrong");
    }
    throw error;
  }
}

export async function generate2FASecret() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");
    const t = await getT("auth");

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new Error("User not found");

    if (user.twoFactorEnabled) {
      return { success: false, message: t("errors.twoFactorAlreadyEnabled") };
    }

    const secret = speakeasy.generateSecret({
      name: `WorkFactory Accounting (${user.username})`,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret.base32 },
    });

    return { success: true, secret: secret.base32, otpauthUrl: secret.otpauth_url };
  } catch (error: any) {
    console.error("Error generating 2FA secret:", error);
    const t = await getT("auth");
    return { success: false, message: t("errors.serverError") };
  }
}

export async function verifyAndEnable2FA(token: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const t = await getT("auth");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.twoFactorSecret) throw new Error("User or secret not found");

  const isValidToken = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token,
    window: 1, // tolerate ±30s clock drift between server and authenticator
  });

  if (!isValidToken) {
    return { success: false, message: t("errors.invalidToken") };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });

  // Onboarding wizard performs a single signOut once all steps are done,
  // which re-mints the JWT with the fresh flags.
  return { success: true };
}

export async function changePassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const t = await getT("auth");

  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!newPassword || newPassword.length < 8) {
    return { success: false, message: t("errors.passwordTooShort") };
  }
  if (newPassword !== confirmPassword) {
    return { success: false, message: t("errors.passwordMismatch") };
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) throw new Error("User not found");
  // This is the onboarding step only — it doesn't ask for the current password,
  // so it must not work for a session that has already finished onboarding.
  if (!user.mustChangePassword) return { success: false, message: t("errors.passwordAlreadySet") };

  // Don't allow keeping the same (default) password
  const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsOld) {
    return { success: false, message: t("errors.passwordSameAsOld") };
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });

  return { success: true };
}

// Used by the onboarding wizard to finish: re-mint the JWT with fresh flags.
export async function finishOnboarding() {
  await signOut({ redirectTo: "/login?onboarded=1" });
}

// Triggered by the idle-logout timer after inactivity.
export async function signOutIdle() {
  await signOut({ redirectTo: "/login?timeout=1" });
}

// Clean, confirmed sign-out from the top nav.
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
