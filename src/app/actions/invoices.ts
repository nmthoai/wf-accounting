"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

function revalidateAll() {
  revalidatePath("/invoices");
  revalidatePath("/ledger");
  revalidatePath("/projects");
  revalidatePath("/");
}

// Create a receivable (client owes you) or payable (you owe a vendor).
export async function createInvoice(formData: FormData) {
  const session = await requireUser();

  const direction = (formData.get("direction") as string) === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
  const number = (formData.get("number") as string)?.trim() || null;
  const clientId = (formData.get("clientId") as string) || null;
  const vendorId = (formData.get("vendorId") as string) || null;
  const projectId = (formData.get("projectId") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const issueStr = formData.get("issueDate") as string;
  const dueStr = formData.get("dueDate") as string;
  const currency = (formData.get("currency") as string) || "VND";
  const amount = parseFloat(formData.get("amount") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (isNaN(amount) || amount <= 0) return { success: false, message: "Enter a valid amount." };
  if (!issueStr || !dueStr) return { success: false, message: "Issue and due dates are required." };

  let exchangeRate = 1.0;
  if (currency === "USD") {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    exchangeRate = user?.defaultUsdRate || 25400;
  }

  const invoice = await prisma.invoice.create({
    data: {
      number,
      direction,
      clientId: direction === "RECEIVABLE" ? clientId : null,
      vendorId: direction === "PAYABLE" ? vendorId : null,
      projectId: projectId || null,
      categoryId: categoryId || null,
      issueDate: new Date(issueStr),
      dueDate: new Date(dueStr),
      currency,
      exchangeRate,
      amount,
      status: "OPEN",
      notes,
    },
  });

  // Attach the externally-issued PDF, if provided.
  await persistUploads(formData.getAll("files") as File[], { invoiceId: invoice.id });

  revalidateAll();
  return { success: true };
}

export async function markInvoicePaid(id: string, formData?: FormData) {
  await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "PAID") return { success: false, message: "Already settled." };
  if (inv.status === "VOID") return { success: false, message: "This is voided." };

  const paidStr = formData?.get("paidDate") as string | null;
  const paidDate = paidStr ? new Date(paidStr) : new Date();

  const isReceivable = inv.direction === "RECEIVABLE";

  // Record the actual cash movement, linked back to the invoice/bill.
  await prisma.transaction.create({
    data: {
      type: isReceivable ? "INCOME" : "EXPENSE",
      amount: inv.amount,
      currency: inv.currency,
      exchangeRate: inv.exchangeRate,
      date: paidDate,
      description: isReceivable
        ? `Payment received${inv.number ? ` — Invoice ${inv.number}` : ""}`
        : `Vendor payment${inv.number ? ` — Bill ${inv.number}` : ""}`,
      invoiceNumber: inv.number,
      projectId: inv.projectId,
      categoryId: inv.categoryId,
      vendorId: isReceivable ? null : inv.vendorId,
      invoiceId: inv.id,
    },
  });

  await prisma.invoice.update({ where: { id }, data: { status: "PAID", paidDate } });
  revalidateAll();
  return { success: true };
}

export async function voidInvoice(id: string) {
  await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "PAID") {
    return { success: false, message: "Already paid — delete the linked transaction in the ledger first." };
  }
  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  revalidateAll();
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { attachments: true } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "PAID") {
    return { success: false, message: "Delete the linked transaction in the ledger first." };
  }
  for (const a of inv.attachments) await removeUploadFile(a.filePath);
  await prisma.invoice.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
