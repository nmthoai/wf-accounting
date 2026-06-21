"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

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

export async function createInvoice(formData: FormData) {
  const session = await requireUser();

  const number = (formData.get("number") as string)?.trim();
  const clientId = (formData.get("clientId") as string) || null;
  const projectId = (formData.get("projectId") as string) || null;
  const issueStr = formData.get("issueDate") as string;
  const dueStr = formData.get("dueDate") as string;
  const currency = (formData.get("currency") as string) || "VND";
  const amount = parseFloat(formData.get("amount") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!number) return { success: false, message: "Invoice number is required." };
  if (isNaN(amount) || amount <= 0) return { success: false, message: "Enter a valid amount." };
  if (!issueStr || !dueStr) return { success: false, message: "Issue and due dates are required." };

  const existing = await prisma.invoice.findUnique({ where: { number } });
  if (existing) return { success: false, message: "That invoice number already exists." };

  let exchangeRate = 1.0;
  if (currency === "USD") {
    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    exchangeRate = user?.defaultUsdRate || 25400;
  }

  await prisma.invoice.create({
    data: {
      number,
      clientId: clientId || null,
      projectId: projectId || null,
      issueDate: new Date(issueStr),
      dueDate: new Date(dueStr),
      currency,
      exchangeRate,
      amount,
      status: "DRAFT",
      notes,
    },
  });
  revalidateAll();
  return { success: true };
}

export async function sendInvoice(id: string) {
  await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: "Invoice not found." };
  if (inv.status !== "DRAFT") return { success: false, message: "Only draft invoices can be sent." };
  await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
  revalidateAll();
  return { success: true };
}

export async function markInvoicePaid(id: string, formData?: FormData) {
  await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { transaction: true } });
  if (!inv) return { success: false, message: "Invoice not found." };
  if (inv.status === "PAID") return { success: false, message: "Invoice is already paid." };
  if (inv.status === "VOID") return { success: false, message: "Voided invoices can't be paid." };

  const paidStr = formData?.get("paidDate") as string | null;
  const paidDate = paidStr ? new Date(paidStr) : new Date();

  // Record the actual cash as an income transaction linked back to the invoice.
  await prisma.transaction.create({
    data: {
      type: "INCOME",
      amount: inv.amount,
      currency: inv.currency,
      exchangeRate: inv.exchangeRate,
      date: paidDate,
      description: `Payment — Invoice ${inv.number}`,
      invoiceNumber: inv.number,
      projectId: inv.projectId,
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
  if (!inv) return { success: false, message: "Invoice not found." };
  if (inv.status === "PAID") {
    return { success: false, message: "Paid invoices can't be voided — delete the payment in the ledger first." };
  }
  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  revalidateAll();
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: "Invoice not found." };
  if (inv.status === "PAID") {
    return { success: false, message: "Delete the linked payment in the ledger first." };
  }
  await prisma.invoice.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
