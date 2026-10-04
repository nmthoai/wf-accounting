"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { CURRENCIES } from "@/lib/money";
import { DOC_STATUS } from "@/lib/review";
import { PAYER, REIMBURSEMENT } from "@/lib/costs";
import { convertCostItem } from "@/lib/cost-items";

async function currentUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return { name: session.user.name ?? null, isAdmin: session.user.role === "ADMIN" };
}

function revalidateAll() {
  for (const p of ["/costs", "/ledger", "/"]) revalidatePath(p);
}

const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

function parseItem(fd: FormData) {
  const str = (k: string) => ((fd.get(k) as string) || "").trim();
  const provider = str("provider");
  const receiptDate = day(str("receiptDate"));
  const amount = parseFloat(str("amount"));
  const currency = str("currency") || "USD";
  if (!provider) return { error: "Who is the provider?" };
  if (!receiptDate) return { error: "Enter the date on the receipt." };
  if (!(amount >= 0)) return { error: "Enter the amount as printed." };
  if (!CURRENCIES.includes(currency)) return { error: "Unsupported currency." };
  const payer = str("payer") in PAYER ? str("payer") : "UNKNOWN";
  const reimbursement = str("reimbursement") in REIMBURSEMENT ? str("reimbursement") : "UNRESOLVED";
  const docStatus = str("docStatus") in DOC_STATUS ? str("docStatus") : "RECEIPT";
  const from = day(str("servicePeriodFrom")), to = day(str("servicePeriodTo"));
  if (from && to && from > to) return { error: "The service period ends before it starts." };
  return {
    evidence: {
      provider, receiptDate, amount, currency, servicePeriodFrom: from, servicePeriodTo: to,
      receiptNumber: str("receiptNumber") || null, billingEntity: str("billingEntity") || null, notes: str("notes") || null,
    },
    review: { payer, reimbursement, docStatus, renewalDate: day(str("renewalDate")), reviewNote: str("reviewNote") || null },
  };
}

// The same receipt must not be registered twice.
async function duplicateOf(e: { provider: string; receiptNumber: string | null; receiptDate: Date; amount: number; currency: string }, exceptId?: string) {
  const same = await prisma.costItem.findFirst({
    where: {
      id: exceptId ? { not: exceptId } : undefined,
      provider: e.provider,
      OR: e.receiptNumber
        ? [{ receiptNumber: e.receiptNumber }]
        : [{ receiptDate: e.receiptDate, amount: e.amount, currency: e.currency }],
    },
  });
  return same;
}

export async function saveCostItem(id: string | null, fd: FormData) {
  const me = await currentUser();
  const parsed = parseItem(fd);
  if ("error" in parsed) return { success: false, message: parsed.error };

  if (id) {
    const item = await prisma.costItem.findUnique({ where: { id } });
    if (!item) return { success: false, message: "Not found." };
    // Once in the ledger, the receipt's evidence stays as recorded; only the review moves on.
    const data = item.status === "CONVERTED" ? parsed.review : { ...parsed.evidence, ...parsed.review };
    if (item.status !== "CONVERTED") {
      const dup = await duplicateOf(parsed.evidence, id);
      if (dup) return { success: false, message: `Already in the register: ${dup.provider} ${dup.receiptNumber ?? dup.receiptDate.toISOString().slice(0, 10)}.` };
    }
    await prisma.costItem.update({ where: { id }, data });
    await persistUploads(fd.getAll("files") as File[], { costItemId: id });
  } else {
    const dup = await duplicateOf(parsed.evidence);
    if (dup) return { success: false, message: `Already in the register: ${dup.provider} ${dup.receiptNumber ?? dup.receiptDate.toISOString().slice(0, 10)}.` };
    const item = await prisma.costItem.create({ data: { ...parsed.evidence, ...parsed.review, createdBy: me.name } });
    await persistUploads(fd.getAll("files") as File[], { costItemId: item.id });
  }
  revalidateAll();
  return { success: true };
}

// Admin: not a company cost (e.g. personal, or a zero-due statement) — kept for the record.
export async function dismissCostItem(id: string, reason: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  if (!reason?.trim()) return { success: false, message: "Give the reason." };
  const item = await prisma.costItem.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING") return { success: false, message: "Only pending items can be dismissed." };
  await prisma.costItem.update({ where: { id }, data: { status: "DISMISSED", reviewNote: reason.trim() } });
  revalidateAll();
  return { success: true };
}

export async function reopenCostItem(id: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  await prisma.costItem.updateMany({ where: { id, status: "DISMISSED" }, data: { status: "PENDING" } });
  revalidateAll();
  return { success: true };
}

// Admin: remove a pending item entered by mistake (with its receipt files).
export async function deleteCostItem(id: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  const item = await prisma.costItem.findUnique({ where: { id } });
  if (!item || item.status === "CONVERTED") return { success: false, message: "Items in the ledger can't be deleted." };
  const files = await prisma.attachment.findMany({ where: { costItemId: id, transactionId: null } });
  await prisma.costItem.delete({ where: { id } });
  for (const f of files) await removeUploadFile(f.filePath);
  revalidateAll();
  return { success: true };
}

// Link a pending item to an expense already in the ledger instead of creating
// a second one. Its receipts become evidence on that expense too.
export async function linkCostItem(id: string, transactionId: string) {
  const me = await currentUser();
  const [item, t] = await Promise.all([
    prisma.costItem.findUnique({ where: { id } }),
    prisma.transaction.findUnique({ where: { id: transactionId }, include: { costItem: true, reversedBy: { select: { id: true } } } }),
  ]);
  if (!item || item.status !== "PENDING") return { success: false, message: "Only pending items can be linked." };
  if (!t || t.type !== "EXPENSE") return { success: false, message: "Choose an expense." };
  if (t.reversalOfId || t.reversedBy) return { success: false, message: "That expense has been reversed — link its correction." };
  if (t.costItem) return { success: false, message: "That expense already comes from another register item." };
  await convertCostItem(id, transactionId, me.name);
  revalidateAll();
  return { success: true };
}
