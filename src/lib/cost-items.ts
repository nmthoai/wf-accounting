import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { record } from "@/lib/history";
import { getT } from "@/i18n/server";

// A register item can become a ledger expense once, while it is pending.
export async function costItemProblem(id: string) {
  const item = await prisma.costItem.findUnique({ where: { id } });
  const t = await getT("costs");
  if (!item) return t("errors.itemGone");
  if (item.status !== "PENDING" || item.transactionId) return t("errors.itemTaken");
  return null;
}

export class CostItemTaken extends Error {}

// Mark the item as in the ledger and share its receipts with the expense —
// only if it is still pending, checked and changed in one step.
export async function convertCostItem(id: string, transactionId: string, user: string | null, tx?: Prisma.TransactionClient) {
  const run = async (db: Prisma.TransactionClient) => {
    const { count } = await db.costItem.updateMany({ where: { id, status: "PENDING", transactionId: null }, data: { status: "CONVERTED", transactionId } });
    if (count === 0) throw new CostItemTaken();
    await db.attachment.updateMany({ where: { costItemId: id }, data: { transactionId } });
    await record([{ entityId: transactionId, action: "LINK", field: "costItem", newValue: id }], user, db);
  };
  return tx ? run(tx) : prisma.$transaction(run);
}
