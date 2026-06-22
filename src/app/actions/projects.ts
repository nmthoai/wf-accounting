"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads } from "@/lib/uploads";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

const parseDate = (v: FormDataEntryValue | null) => {
  const s = (v as string)?.trim();
  return s ? new Date(s) : null;
};

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
  const description = (formData.get("description") as string)?.trim() || null;
  const startDate = parseDate(formData.get("startDate"));
  const endDate = parseDate(formData.get("endDate"));
  if (!name) return { success: false, message: "Project name is required." };

  await prisma.project.update({
    where: { id },
    data: { name, clientId: clientId || null, status, description, startDate, endDate },
  });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { success: true };
}

// Status-only update (archive / reactivate) — leaves other fields untouched.
export async function setProjectStatus(id: string, status: string) {
  await requireUser();
  await prisma.project.update({ where: { id }, data: { status } });
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { success: true };
}

// Attach a contract / document to a project (stored on the private volume,
// served only through the auth-protected /api/uploads route).
export async function addProjectDocument(projectId: string, formData: FormData) {
  await requireUser();
  await persistUploads(formData.getAll("files") as File[], { projectId });
  revalidatePath(`/projects/${projectId}`);
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
