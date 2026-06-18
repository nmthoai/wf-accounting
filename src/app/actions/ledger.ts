"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

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
    },
  });

  // Handle files
  const files = formData.getAll("files") as File[];
  
  if (files.length > 0) {
    const uploadsDir = join(process.cwd(), "public", "uploads");
    
    // Ensure directory exists
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (e) {
      console.error("Failed to create uploads dir", e);
    }

    for (const file of files) {
      if (file.size === 0) continue;

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      const ext = file.name.split('.').pop() || 'bin';
      const safeName = `${randomUUID()}.${ext}`;
      const path = join(uploadsDir, safeName);
      
      await writeFile(path, buffer);
      
      await prisma.attachment.create({
        data: {
          fileName: file.name,
          fileType: file.type,
          filePath: `/uploads/${safeName}`, // Public URL
          transactionId: transaction.id,
        }
      });
    }
  }

  revalidatePath("/ledger");
  revalidatePath("/");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  // Deleting transaction will cascade delete attachments in DB
  // Ideally, we should also delete the files from disk to save space.
  const attachments = await prisma.attachment.findMany({ where: { transactionId: id } });
  
  await prisma.transaction.delete({ where: { id } });

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
    },
  });

  revalidatePath("/ledger");
  revalidatePath("/");
  return { success: true };
}
