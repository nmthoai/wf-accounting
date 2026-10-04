import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// Change history for ledger entries: who changed what, when and why.

type Db = Prisma.TransactionClient | typeof prisma;
export type Change = { entityId: string; action: string; field?: string; oldValue?: string | null; newValue?: string | null; reason?: string | null };

// Fields worth recording when an entry changes.
export const TRACKED = [
  "type", "date", "amount", "currency", "exchangeRate", "vndAmount", "rateSource", "accountId", "loanId",
  "description", "invoiceNumber", "categoryId", "projectId", "vendorId",
  "docStatus", "purposeStatus", "citStatus", "vatStatus", "vatAmount", "reviewNote", "status",
] as const;

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);

// One UPDATE row per tracked field whose value differs.
export function diff(entityId: string, before: Record<string, unknown>, after: Record<string, unknown>, reason?: string | null): Change[] {
  return TRACKED.filter((f) => f in after && show(before[f]) !== show(after[f])).map((f) => ({
    entityId, action: "UPDATE", field: f, oldValue: show(before[f]), newValue: show(after[f]), reason: reason || null,
  }));
}

export async function record(changes: Change[], user: string | null | undefined, db: Db = prisma) {
  if (changes.length === 0) return;
  await db.changeLog.createMany({ data: changes.map((c) => ({ ...c, user: user ?? null })) });
}

// A one-line picture of an entry, kept when it is created or deleted.
export const snapshot = (t: { type: string; date: Date; amount: number; currency: string; description: string | null }) =>
  `${t.type} ${show(t.date)} ${t.amount} ${t.currency}${t.description ? ` · ${t.description}` : ""}`;
