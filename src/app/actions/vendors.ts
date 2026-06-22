"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function createVendor(formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) return { success: false, message: "Vendor name is required." };

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
  if (!name) return { success: false, message: "Vendor name is required." };

  await prisma.vendor.update({ where: { id }, data: { name, email, phone, notes } });
  revalidatePath("/projects");
  return { success: true };
}

export async function deleteVendor(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const txns = await prisma.transaction.count({ where: { vendorId: id } });
  const invoices = await prisma.invoice.count({ where: { vendorId: id } });
  if (txns > 0 || invoices > 0) {
    return { success: false, message: "Detach transactions/bills before deleting this vendor." };
  }
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/projects");
  return { success: true };
}
