"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";

export async function createTransaction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = (formData.get("currency") as string) || "VND";

  const dateStr = formData.get("date") as string;
  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;
  const vendorId = formData.get("vendorId") as string;

  if (isNaN(amount) || !type || !dateStr) {
    return { success: false, message: "Invalid fields" };
  }

  let exchangeRate = 1.0;
  if (currency === "USD") {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    exchangeRate = user?.defaultUsdRate || 25400;
  }

  const transaction = await prisma.transaction.create({
    data: {
      type,
      amount,
      currency,
      exchangeRate,
      date: new Date(dateStr),
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      categoryId: categoryId || null,
      projectId: projectId || null,
      vendorId: vendorId || null,
    },
  });

  await persistUploads(formData.getAll("files") as File[], { transactionId: transaction.id });

  revalidatePath("/ledger");
  revalidatePath("/");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  // Cascade-delete removes the Attachment rows; also remove the files from disk.
  const attachments = await prisma.attachment.findMany({ where: { transactionId: id } });

  await prisma.transaction.delete({ where: { id } });

  for (const a of attachments) await removeUploadFile(a.filePath);

  revalidatePath("/ledger");
  revalidatePath("/");
  return;
}

export async function editTransaction(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = (formData.get("currency") as string) || "VND";

  const dateStr = formData.get("date") as string;
  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;
  const vendorId = formData.get("vendorId") as string;

  if (isNaN(amount) || !type || !dateStr) {
    return { success: false, message: "Invalid fields" };
  }

  let exchangeRate = 1.0;
  if (currency === "USD") {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    exchangeRate = user?.defaultUsdRate || 25400;
  }

  await prisma.transaction.update({
    where: { id },
    data: {
      type,
      amount,
      currency,
      exchangeRate,
      date: new Date(dateStr),
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      categoryId: categoryId || null,
      projectId: projectId || null,
      vendorId: vendorId || null,
    },
  });

  // Append any newly attached receipts
  await persistUploads(formData.getAll("files") as File[], { transactionId: id });

  revalidatePath("/ledger");
  revalidatePath("/");
  revalidatePath(`/entry/${id}`);
  return { success: true };
}

export async function deleteAttachment(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att) return;

  await prisma.attachment.delete({ where: { id } });
  await removeUploadFile(att.filePath);

  revalidatePath("/ledger");
  revalidatePath("/invoices");
  if (att.transactionId) revalidatePath(`/entry/${att.transactionId}`);
}
