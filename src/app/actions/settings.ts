"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCategory(formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const name = formData.get("name") as string;
  const type = formData.get("type") as string; // "INCOME" or "EXPENSE"
  const description = formData.get("description") as string;

  if (!name || !type) throw new Error("Missing required fields");

  await prisma.category.create({
    data: {
      name,
      type,
      description,
    },
  });

  revalidatePath("/settings");
  return;
}

export async function updateCategory(id: string, formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string; // "INCOME" or "EXPENSE"
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name || !type) return { success: false, message: "Name and type are required." };
  const current = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true, invoices: true } } } });
  if (!current) return { success: false, message: "Not found." };
  // Income ↔ expense would silently reclassify every entry using it.
  if (current.type !== type && current._count.transactions + current._count.invoices > 0) {
    return { success: false, message: "This category is in use, so it can't switch between income and expense." };
  }

  await prisma.category.update({ where: { id }, data: { name, type, description } });

  revalidatePath("/settings");
  revalidatePath("/entry");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  // Deleting would silently strip it from entries — including posted ones.
  const used = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true, invoices: true } } } });
  if (used && used._count.transactions + used._count.invoices > 0) {
    return { success: false, message: "This category is in use — rename it instead, or move its entries first." };
  }
  await prisma.category.delete({
    where: { id },
  });

  revalidatePath("/settings");
  return { success: true };
}


export async function updateExchangeRate(formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const rate = parseFloat(formData.get("rate") as string);
  if (isNaN(rate) || rate <= 0) throw new Error("Invalid rate");

  // One company-wide default: every admin account carries it.
  await prisma.user.updateMany({ where: { role: "ADMIN" }, data: { defaultUsdRate: rate } });

  revalidatePath("/settings");
  revalidatePath("/entry");
  return;
}

export async function createUnitRate(formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const description = formData.get("description") as string;
  const rate = parseFloat(formData.get("rate") as string);
  const unit = formData.get("unit") as string;

  if (!description || isNaN(rate) || !unit) {
    throw new Error("Missing required fields");
  }

  await prisma.unitRate.create({
    data: { description, rate, unit },
  });

  revalidatePath("/settings");
  return;
}

export async function updateUnitRate(id: string, formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const description = (formData.get("description") as string)?.trim();
  const rate = parseFloat(formData.get("rate") as string);
  const unit = formData.get("unit") as string;

  if (!description || isNaN(rate) || !unit) {
    return { success: false, message: "All fields are required." };
  }

  await prisma.unitRate.update({ where: { id }, data: { description, rate, unit } });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteUnitRate(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  await prisma.unitRate.delete({
    where: { id },
  });

  revalidatePath("/settings");
  return;
}
