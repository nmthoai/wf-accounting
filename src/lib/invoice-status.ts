import { prisma } from "@/lib/prisma";
import { EPS, settlement } from "@/lib/money";

// Recompute invoice status from its allocations: OPEN (nothing settled yet),
// PARTIAL, or PAID (payments + evidenced fees cover the gross). VOID is left alone.
// paidDate = the latest payment date once fully settled.
export async function refreshInvoiceStatus(invoiceIds: (string | null | undefined)[]) {
  for (const id of new Set(invoiceIds.filter((x): x is string => !!x))) {
    const inv = await prisma.invoice.findUnique({
      where: { id },
      // Draft payments don't settle anything until reviewed.
      include: { allocations: { where: { transaction: { status: { not: "DRAFT" } } }, include: { transaction: { select: { date: true } } } } },
    });
    if (!inv || inv.status === "VOID") continue;
    const { received, fees } = settlement(inv.amount, inv.allocations);
    const settled = received + fees;
    const status = settled <= EPS ? "OPEN" : settled >= inv.amount - EPS ? "PAID" : "PARTIAL";
    const lastPayment = inv.allocations
      .filter((a) => a.kind === "PAYMENT")
      .map((a) => a.transaction.date)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    await prisma.invoice.update({
      where: { id },
      data: { status, paidDate: status === "PAID" ? lastPayment ?? null : null },
    });
  }
}

// Invoices touched by these transactions (so a payment edit/delete can refresh them).
export async function invoicesOf(transactionIds: string[]) {
  const rows = await prisma.paymentAllocation.findMany({
    where: { transactionId: { in: transactionIds } },
    select: { invoiceId: true },
  });
  return rows.map((r) => r.invoiceId);
}
