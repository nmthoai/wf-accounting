"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

export async function createProject(formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string) || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) return { success: false, message: "Project name is required." };

  await prisma.project.create({
    data: { name, clientId: clientId || null, notes, status: "ACTIVE" },
  });
  revalidatePath("/projects");
  revalidatePath("/entry");
  return { success: true };
}

export async function updateProject(id: string, formData: FormData) {
  await requireUser();
  const name = (formData.get("name") as string)?.trim();
  const clientId = (formData.get("clientId") as string) || null;
  const status = (formData.get("status") as string) || "ACTIVE";
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!name) return { success: false, message: "Project name is required." };

  await prisma.project.update({
    where: { id },
    data: { name, clientId: clientId || null, status, notes },
  });
  revalidatePath("/projects");
  return { success: true };
}

export async function deleteProject(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  const txns = await prisma.transaction.count({ where: { projectId: id } });
  const invoices = await prisma.invoice.count({ where: { projectId: id } });
  if (txns > 0 || invoices > 0) {
    return { success: false, message: "This project has linked transactions/invoices. Archive it instead." };
  }
  await prisma.project.delete({ where: { id } });
  revalidatePath("/projects");
  return { success: true };
}
