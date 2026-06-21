"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Unauthorized");
  }
  return session;
}

// Block actions that would remove the last way to administer the lock-box.
async function isLastActiveAdmin(userId: string) {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "ADMIN") return false;
  const activeAdmins = await prisma.user.count({
    where: { role: "ADMIN", isActive: true },
  });
  return activeAdmins <= 1 && target.isActive;
}

export async function createUser(formData: FormData) {
  await requireAdmin();

  const username = (formData.get("username") as string)?.trim();
  const password = formData.get("password") as string;
  const role = (formData.get("role") as string) === "ADMIN" ? "ADMIN" : "USER";

  if (!username || username.length < 3) {
    return { success: false, message: "Username must be at least 3 characters." };
  }
  if (!password || password.length < 8) {
    return { success: false, message: "Default password must be at least 8 characters." };
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return { success: false, message: "That username is already taken." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username,
      passwordHash,
      role,
      mustChangePassword: true,
      twoFactorEnabled: false,
      isActive: true,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteUser(id: string) {
  const session = await requireAdmin();
  if (id === session.user.id) {
    return { success: false, message: "You can't delete your own account." };
  }
  if (await isLastActiveAdmin(id)) {
    return { success: false, message: "Can't delete the last active admin." };
  }
  await prisma.user.delete({ where: { id } });
  revalidatePath("/settings");
  return { success: true };
}

export async function setUserActive(id: string, active: boolean) {
  const session = await requireAdmin();
  if (id === session.user.id && !active) {
    return { success: false, message: "You can't deactivate your own account." };
  }
  if (!active && (await isLastActiveAdmin(id))) {
    return { success: false, message: "Can't deactivate the last active admin." };
  }
  await prisma.user.update({ where: { id }, data: { isActive: active } });
  revalidatePath("/settings");
  return { success: true };
}

export async function resetUserPassword(id: string, formData: FormData) {
  await requireAdmin();
  const password = formData.get("password") as string;
  if (!password || password.length < 8) {
    return { success: false, message: "Default password must be at least 8 characters." };
  }
  const passwordHash = await bcrypt.hash(password, 10);
  // Force the user back through the change-password step on next login.
  await prisma.user.update({
    where: { id },
    data: { passwordHash, mustChangePassword: true },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function resetUser2FA(id: string) {
  await requireAdmin();
  // Clears their authenticator; they re-enrol via the onboarding wizard.
  await prisma.user.update({
    where: { id },
    data: { twoFactorEnabled: false, twoFactorSecret: null },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function unlockUser(id: string) {
  await requireAdmin();
  await prisma.user.update({
    where: { id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
  revalidatePath("/settings");
  return { success: true };
}
