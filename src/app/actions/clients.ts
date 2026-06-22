"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function createClient(formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) return { success: false, message: "Client name is required." };

  await prisma.client.create({ data: { name, email, phone, notes } });
  revalidatePath("/clients");
  revalidatePath("/invoices");
  return { success: true };
}

export async function updateClient(id: string, formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) return { success: false, message: "Client name is required." };

  await prisma.client.update({ where: { id }, data: { name, email, phone, notes } });
  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const projects = await prisma.project.count({ where: { clientId: id } });
  const invoices = await prisma.invoice.count({ where: { clientId: id } });
  if (projects > 0 || invoices > 0) {
    return { success: false, message: "Detach projects/invoices before deleting this client." };
  }
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  return { success: true };
}
