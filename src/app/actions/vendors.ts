"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function createVendor(formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.vendorNameRequired") };
  }

  await prisma.vendor.create({ data: { name, email, phone, notes } });
  revalidatePath("/projects");
  revalidatePath("/invoices");
  revalidatePath("/entry");
  return { success: true };
}

export async function updateVendor(id: string, formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.vendorNameRequired") };
  }

  await prisma.vendor.update({ where: { id }, data: { name, email, phone, notes } });
  revalidatePath("/projects");
  return { success: true };
}

export async function deleteVendor(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const txns = await prisma.transaction.count({ where: { vendorId: id } });
  const invoices = await prisma.invoice.count({ where: { vendorId: id } });
  if (txns > 0 || invoices > 0) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.vendorHasLinks") };
  }
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/projects");
  return { success: true };
}
