"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createCategory(formData: FormData) {
  const session = await auth();
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

export async function deleteCategory(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  await prisma.category.delete({
    where: { id },
  });

  revalidatePath("/settings");
  return;
}


export async function updateExchangeRate(formData: FormData) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const rate = parseFloat(formData.get("rate") as string);
  if (isNaN(rate) || rate <= 0) throw new Error("Invalid rate");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { defaultUsdRate: rate },
  });

  revalidatePath("/settings");
  revalidatePath("/entry");
  return;
}

export async function createUnitRate(formData: FormData) {
  const session = await auth();
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

export async function deleteUnitRate(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  await prisma.unitRate.delete({
    where: { id },
  });

  revalidatePath("/settings");
  return;
}
