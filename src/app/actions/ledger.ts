"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { resolveFx } from "@/lib/fx";
import { CURRENCIES } from "@/lib/money";

// Shared parsing for the income/expense form. Other movement kinds (transfers,
// capital, loans) are recorded on the Accounts page.
async function parseEntry(formData: FormData) {
  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = (formData.get("currency") as string) || "VND";
  const dateStr = formData.get("date") as string;
  const accountId = formData.get("accountId") as string;

  if (type !== "INCOME" && type !== "EXPENSE") return { error: "Invalid entry type." };
  if (!(amount > 0) || !dateStr) return { error: "Enter a valid amount and date." };
  if (!CURRENCIES.includes(currency)) return { error: "Unsupported currency." };
  if (!accountId) return { error: "Choose the account the money moved through." };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { error: "Unknown account." };
  // A USD account only holds USD; a VND account can settle VND or USD amounts.
  if (account.currency === "USD" && currency !== "USD") return { error: `${account.name} is a USD account — enter the amount in USD.` };

  const fx = await resolveFx(currency, amount, formData);
  if (!fx.ok) return { error: fx.message };

  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;
  const vendorId = formData.get("vendorId") as string;

  return {
    data: {
      type,
      amount,
      currency,
      exchangeRate: fx.exchangeRate,
      vndAmount: fx.vndAmount,
      rateSource: fx.rateSource,
      accountId,
      date: new Date(dateStr),
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      categoryId: categoryId || null,
      projectId: projectId || null,
      vendorId: vendorId || null,
    },
  };
}

export async function createTransaction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const parsed = await parseEntry(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };

  const transaction = await prisma.transaction.create({ data: parsed.data });

  await persistUploads(formData.getAll("files") as File[], { transactionId: transaction.id });

  revalidatePath("/ledger");
  revalidatePath("/accounts");
  revalidatePath("/");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");

  // A transfer is two linked legs — delete both so money can't vanish from one side.
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) return;
  const ids = t.transferId
    ? (await prisma.transaction.findMany({ where: { transferId: t.transferId }, select: { id: true } })).map((x) => x.id)
    : [id];

  // Cascade-delete removes the Attachment rows; also remove the files from disk.
  const attachments = await prisma.attachment.findMany({ where: { transactionId: { in: ids } } });

  await prisma.transaction.deleteMany({ where: { id: { in: ids } } });

  for (const a of attachments) await removeUploadFile(a.filePath);

  revalidatePath("/ledger");
  revalidatePath("/accounts");
  revalidatePath("/");
  return;
}

export async function editTransaction(id: string, formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return { success: false, message: "Not found." };
  if (existing.type !== "INCOME" && existing.type !== "EXPENSE") {
    return { success: false, message: "Edit transfers, capital and loans on the Accounts page." };
  }

  const parsed = await parseEntry(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };

  await prisma.transaction.update({ where: { id }, data: parsed.data });

  // Append any newly attached receipts
  await persistUploads(formData.getAll("files") as File[], { transactionId: id });

  revalidatePath("/ledger");
  revalidatePath("/accounts");
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
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
}
