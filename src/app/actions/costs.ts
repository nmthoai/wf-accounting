"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { CURRENCIES } from "@/lib/money";
import { DOC_STATUS } from "@/lib/review";
import { PAYER, REIMBURSEMENT } from "@/lib/costs";
import { convertCostItem, CostItemTaken } from "@/lib/cost-items";
import { getT, type Translate } from "@/i18n/server";

async function currentUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return { name: session.user.name ?? null, isAdmin: session.user.role === "ADMIN" };
}

function revalidateAll() {
  for (const p of ["/costs", "/ledger", "/"]) revalidatePath(p);
}

const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);

const str = (fd: FormData, k: string) => ((fd.get(k) as string) || "").trim();
// A value from a fixed list (own keys only — "toString" and friends don't count).
const pick = (map: Record<string, string>, v: string, fallback: string) => (Object.hasOwn(map, v) ? v : fallback);

// The review — always editable.
function parseReview(fd: FormData) {
  return {
    payer: pick(PAYER, str(fd, "payer"), "UNKNOWN"),
    reimbursement: pick(REIMBURSEMENT, str(fd, "reimbursement"), "UNRESOLVED"),
    docStatus: pick(DOC_STATUS, str(fd, "docStatus"), "RECEIPT"),
    renewalDate: day(str(fd, "renewalDate")),
    reviewNote: str(fd, "reviewNote") || null,
  };
}

// The receipt's evidence — fixed once the item is in the ledger.
function parseItem(fd: FormData, t: Translate) {
  const str = (k: string) => ((fd.get(k) as string) || "").trim();
  const provider = str("provider");
  const receiptDate = day(str("receiptDate"));
  const amount = parseFloat(str("amount"));
  const currency = str("currency") || "USD";
  if (!provider) return { error: t("errors.providerRequired") };
  if (!receiptDate) return { error: t("errors.dateRequired") };
  if (!(amount >= 0)) return { error: t("errors.amountRequired") };
  if (!CURRENCIES.includes(currency)) return { error: t("errors.unsupportedCurrency") };
  const from = day(str("servicePeriodFrom")), to = day(str("servicePeriodTo"));
  if (from && to && from > to) return { error: t("errors.periodReversed") };
  return {
    evidence: {
      provider, receiptDate, amount, currency, servicePeriodFrom: from, servicePeriodTo: to,
      receiptNumber: str("receiptNumber") || null, billingEntity: str("billingEntity") || null, notes: str("notes") || null,
    },
    review: parseReview(fd),
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
  const t = await getT("costs");
  const tc = await getT("common");
  if (id) {
    const item = await prisma.costItem.findUnique({ where: { id } });
    if (!item) return { success: false, message: tc("errors.notFound") };
    // Once in the ledger, the receipt's evidence stays as recorded (the form
    // doesn't even send it); only the review moves on, and new receipts
    // become evidence on the expense too.
    if (item.status === "CONVERTED") {
      await prisma.costItem.update({ where: { id }, data: parseReview(fd) });
      await persistUploads(fd.getAll("files") as File[], { costItemId: id, transactionId: item.transactionId ?? undefined });
      revalidateAll();
      return { success: true };
    }
    const parsed = parseItem(fd, t);
    if ("error" in parsed) return { success: false, message: parsed.error };
    const dup = await duplicateOf(parsed.evidence, id);
    if (dup) return { success: false, message: t("errors.duplicate", { provider: dup.provider, ref: dup.receiptNumber ?? dup.receiptDate.toISOString().slice(0, 10) }) };
    await prisma.costItem.update({ where: { id }, data: { ...parsed.evidence, ...parsed.review } });
    await persistUploads(fd.getAll("files") as File[], { costItemId: id });
  } else {
    const parsed = parseItem(fd, t);
    if ("error" in parsed) return { success: false, message: parsed.error };
    const dup = await duplicateOf(parsed.evidence);
    if (dup) return { success: false, message: t("errors.duplicate", { provider: dup.provider, ref: dup.receiptNumber ?? dup.receiptDate.toISOString().slice(0, 10) }) };
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
  const t = await getT("costs");
  if (!reason?.trim()) return { success: false, message: t("errors.reasonRequired") };
  const item = await prisma.costItem.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING") return { success: false, message: t("errors.onlyPendingDismiss") };
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
  const t = await getT("costs");
  const item = await prisma.costItem.findUnique({ where: { id } });
  if (!item || item.status === "CONVERTED") return { success: false, message: t("errors.ledgerItemsNoDelete") };
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
  const tr = await getT("costs"); // `t` is the expense below
  const [item, t] = await Promise.all([
    prisma.costItem.findUnique({ where: { id } }),
    prisma.transaction.findUnique({ where: { id: transactionId }, include: { costItem: true, reversedBy: { select: { id: true } } } }),
  ]);
  if (!item || item.status !== "PENDING") return { success: false, message: tr("errors.onlyPendingLink") };
  if (!t || t.type !== "EXPENSE") return { success: false, message: tr("errors.chooseExpense") };
  if (t.reversalOfId || t.reversedBy) return { success: false, message: tr("errors.expenseReversed") };
  if (t.costItem) return { success: false, message: tr("errors.expenseTaken") };
  try {
    await convertCostItem(id, transactionId, me.name);
  } catch (e) {
    if (e instanceof CostItemTaken) return { success: false, message: tr("errors.itemTaken") };
    throw e;
  }
  revalidateAll();
  return { success: true };
}
