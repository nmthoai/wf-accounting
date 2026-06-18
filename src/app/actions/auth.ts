"use server";

import { signIn, signOut, auth } from "@/auth";
import { AuthError } from "next-auth";
import speakeasy from "speakeasy";
import { prisma } from "@/lib/prisma";

export async function authenticate(prevState: any, formData: FormData) {
  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return "Invalid credentials or missing 2FA token.";
        default:
          return "Something went wrong.";
      }
    }
    throw error;
  }
}

export async function generate2FASecret() {
  try {
    const session = await auth();
    console.log("Session in generate2FASecret:", session);
    if (!session?.user?.id) throw new Error("Unauthorized");

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) throw new Error("User not found");

    if (user.twoFactorEnabled) {
      return { success: false, message: "2FA already enabled" };
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
    return { success: false, message: error.message || "Server Error" };
  }
}

export async function verifyAndEnable2FA(token: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.twoFactorSecret) throw new Error("User or secret not found");

  const isValidToken = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: "base32",
    token,
  });

  if (!isValidToken) {
    return { success: false, message: "Invalid token. Try again." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });

  // Force the user to sign in again to mint a new JWT token with twoFactorEnabled = true
  await signOut({ redirectTo: "/login" });
}
