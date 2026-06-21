"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

// Receipts live on the persistent data volume (survives container redeploys),
// not under public/. They are served through the auth-protected /api/uploads route.
const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");

// Persist uploaded receipt files and create their Attachment rows.
async function saveAttachments(transactionId: string, files: File[]) {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length === 0) return;

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to create uploads dir", e);
  }

  for (const file of real) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const safeName = `${randomUUID()}.${ext}`;
    await writeFile(join(UPLOAD_DIR, safeName), buffer);
    await prisma.attachment.create({
      data: {
        fileName: file.name,
        fileType: file.type,
        filePath: safeName, // bare key; served via /api/uploads/<key>
        transactionId,
      },
    });
  }
}

export async function createTransaction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = formData.get("currency") as string || "VND";
  
  const dateStr = formData.get("date") as string;
  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;

  if (isNaN(amount) || !type || !dateStr) {
    return { success: false, message: "Invalid fields" };
  }

  let exchangeRate = 1.0;
  if (currency === "USD") {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    exchangeRate = user?.defaultUsdRate || 25400;
  }

  // Create Transaction
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
    },
  });

  await saveAttachments(transaction.id, formData.getAll("files") as File[]);

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

  for (const a of attachments) {
    const key = a.filePath.split("/").pop(); // tolerate old "/uploads/x" paths
    if (!key) continue;
    try {
      await unlink(join(UPLOAD_DIR, key));
    } catch {
      // file already gone — ignore
    }
  }

  revalidatePath("/ledger");
  revalidatePath("/");
  return;
}

export async function editTransaction(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = formData.get("currency") as string || "VND";
  
  const dateStr = formData.get("date") as string;
  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;

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
    },
  });

  // Append any newly attached receipts
  await saveAttachments(id, formData.getAll("files") as File[]);

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

  const key = att.filePath.split("/").pop(); // tolerate old "/uploads/x" paths
  if (key) {
    try {
      await unlink(join(UPLOAD_DIR, key));
    } catch {
      // file already gone — ignore
    }
  }

  revalidatePath("/ledger");
  revalidatePath(`/entry/${att.transactionId}`);
}
