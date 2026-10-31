"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";
import { findSameName } from "@/lib/unique-name";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

// No two clients share a name (trimmed, case-insensitive; see src/lib/unique-name.ts).
// Returns the reason to show in the form, or null when the name is free.
async function nameTaken(name: string, selfId?: string) {
  const clash = findSameName(await prisma.client.findMany({ select: { id: true, name: true } }), name, selfId);
  return clash ? (await getT("contacts"))("errors.clientNameTaken", { name: clash.name }) : null;
}

export async function createClient(formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.clientNameRequired") };
  }
  const taken = await nameTaken(name);
  if (taken) return { success: false, message: taken };

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
  if (!name) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.clientNameRequired") };
  }
  const taken = await nameTaken(name, id);
  if (taken) return { success: false, message: taken };

  await prisma.client.update({ where: { id }, data: { name, email, phone, notes } });
  revalidatePath("/clients");
  return { success: true };
}

export async function deleteClient(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const projects = await prisma.project.count({ where: { clientId: id } });
  const invoices = await prisma.invoice.count({ where: { clientId: id } });
  if (projects > 0 || invoices > 0) {
    const t = await getT("contacts");
    return { success: false, message: t("errors.clientHasLinks") };
  }
  await prisma.client.delete({ where: { id } });
  revalidatePath("/clients");
  return { success: true };
}
