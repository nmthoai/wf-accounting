"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getT, type Translate } from "@/i18n/server";
import { parseAmount } from "@/lib/amount";
import { findSameName } from "@/lib/unique-name";

const TYPES = ["INCOME", "EXPENSE"];

// Ids come from the browser: anything but a string (a crafted request can send
// an object such as {not: null}, which Prisma reads as a filter) is refused.
const notFound = async () => (await getT("common"))("errors.notFound");

// No two categories of the same type share a name (trimmed, case-insensitive).
async function categoryTaken(t: Translate, name: string, type: string, selfId?: string) {
  const clash = findSameName(await prisma.category.findMany({ where: { type }, select: { id: true, name: true } }), name, selfId);
  return clash ? t("errors.categoryNameTaken", { name: clash.name, type }) : null;
}

// No two unit rates with the same unit share a description.
async function unitRateTaken(t: Translate, description: string, unit: string, selfId?: string) {
  const rows = await prisma.unitRate.findMany({ where: { unit }, select: { id: true, description: true } });
  const clash = findSameName(rows.map((r) => ({ id: r.id, name: r.description })), description, selfId);
  return clash ? t("errors.unitRateTaken", { name: clash.name, unit }) : null;
}

export async function createCategory(formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const t = await getT("settings");

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string; // "INCOME" or "EXPENSE"
  const description = formData.get("description") as string;

  if (!name || !TYPES.includes(type)) return { success: false, message: t("errors.nameTypeRequired") };
  const taken = await categoryTaken(t, name, type);
  if (taken) return { success: false, message: taken };

  await prisma.category.create({
    data: {
      name,
      type,
      description,
    },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function updateCategory(id: string, formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  if (typeof id !== "string") return { success: false, message: await notFound() };
  const t = await getT("settings");

  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string; // "INCOME" or "EXPENSE"
  const description = (formData.get("description") as string)?.trim() || null;

  if (!name || !TYPES.includes(type)) return { success: false, message: t("errors.nameTypeRequired") };
  const current = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true, invoices: true } } } });
  if (!current) return { success: false, message: (await getT("common"))("errors.notFound") };
  // Income ↔ expense would silently reclassify every entry using it.
  if (current.type !== type && current._count.transactions + current._count.invoices > 0) {
    return { success: false, message: t("errors.categoryTypeLocked") };
  }
  const taken = await categoryTaken(t, name, type, id);
  if (taken) return { success: false, message: taken };

  await prisma.category.update({ where: { id }, data: { name, type, description } });

  revalidatePath("/settings");
  revalidatePath("/entry");
  return { success: true };
}

export async function deleteCategory(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  if (typeof id !== "string") return { success: false, message: await notFound() };
  const t = await getT("settings");

  // Deleting would silently strip it from entries — including posted ones.
  const used = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { transactions: true, invoices: true } } } });
  if (used && used._count.transactions + used._count.invoices > 0) {
    return { success: false, message: t("errors.categoryInUse") };
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
  const t = await getT("settings");

  const rate = parseAmount(formData.get("rate"));
  if (isNaN(rate) || rate <= 0) return { success: false, message: t("errors.rateInvalid") };

  // One company-wide default: every admin account carries it.
  await prisma.user.updateMany({ where: { role: "ADMIN" }, data: { defaultUsdRate: rate } });

  revalidatePath("/settings");
  revalidatePath("/entry");
  return { success: true };
}

export async function createUnitRate(formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const t = await getT("settings");

  const description = (formData.get("description") as string)?.trim();
  const rate = parseAmount(formData.get("rate"));
  const unit = formData.get("unit") as string;

  if (!description || isNaN(rate) || !unit) {
    return { success: false, message: t("errors.allFieldsRequired") };
  }

  const taken = await unitRateTaken(t, description, unit);
  if (taken) return { success: false, message: taken };

  await prisma.unitRate.create({
    data: { description, rate, unit },
  });

  revalidatePath("/settings");
  return { success: true };
}

export async function updateUnitRate(id: string, formData: FormData) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  if (typeof id !== "string") return { success: false, message: await notFound() };
  const t = await getT("settings");

  const description = (formData.get("description") as string)?.trim();
  const rate = parseAmount(formData.get("rate"));
  const unit = formData.get("unit") as string;

  if (!description || isNaN(rate) || !unit) {
    return { success: false, message: t("errors.allFieldsRequired") };
  }

  const taken = await unitRateTaken(t, description, unit, id);
  if (taken) return { success: false, message: taken };

  await prisma.unitRate.update({ where: { id }, data: { description, rate, unit } });

  revalidatePath("/settings");
  return { success: true };
}

export async function deleteUnitRate(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  if (typeof id !== "string") return { success: false, message: await notFound() };

  await prisma.unitRate.delete({
    where: { id },
  });

  revalidatePath("/settings");
  return { success: true };
}
