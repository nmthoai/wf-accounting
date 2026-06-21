"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
}

export async function addBankMovement(formData: FormData) {
  await requireAdmin();
  const raw = formData.get("type") as string;
  const type = ["OPENING", "DEPOSIT", "WITHDRAWAL"].includes(raw) ? raw : "DEPOSIT";
  const amount = parseFloat(formData.get("amount") as string);
  const dateStr = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim() || null;

  if (isNaN(amount) || amount <= 0) return { success: false, message: "Enter a valid amount." };

  // Only one OPENING entry makes sense — replace any existing one.
  if (type === "OPENING") {
    await prisma.bankBalance.deleteMany({ where: { type: "OPENING" } });
  }

  await prisma.bankBalance.create({
    data: { type, amount, date: dateStr ? new Date(dateStr) : new Date(), description },
  });
  revalidatePath("/balance");
  revalidatePath("/");
  return { success: true };
}

export async function deleteBankMovement(id: string) {
  await requireAdmin();
  await prisma.bankBalance.delete({ where: { id } });
  revalidatePath("/balance");
  revalidatePath("/");
  return { success: true };
}
