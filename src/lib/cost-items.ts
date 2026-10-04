import { prisma } from "@/lib/prisma";
import { record } from "@/lib/history";

// A register item can become a ledger expense once, while it is pending.
export async function costItemProblem(id: string) {
  const item = await prisma.costItem.findUnique({ where: { id } });
  if (!item) return "That register item no longer exists.";
  if (item.status !== "PENDING" || item.transactionId) return "That register item is already in the ledger or dismissed.";
  return null;
}

// Mark the item as in the ledger and share its receipts with the expense.
export async function convertCostItem(id: string, transactionId: string, user: string | null) {
  await prisma.$transaction(async (tx) => {
    await tx.costItem.update({ where: { id }, data: { status: "CONVERTED", transactionId } });
    await tx.attachment.updateMany({ where: { costItemId: id }, data: { transactionId } });
    await record([{ entityId: transactionId, action: "LINK", field: "costItem", newValue: id }], user, tx);
  });
}
