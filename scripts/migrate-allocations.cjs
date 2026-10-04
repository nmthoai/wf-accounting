// One-off, idempotent migration (Phase 2): the old one-to-one "this transaction
// paid this invoice" link becomes a PaymentAllocation, then every invoice's
// status is recomputed from its allocations (OPEN / PARTIAL / PAID).
// Safe to re-run; nothing is deleted. The legacy Transaction.invoiceId column
// is left in place for history.
// Run with the app's DATABASE_URL:  node scripts/migrate-allocations.cjs
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const EPS = 0.005;

(async () => {
  const legacy = await p.transaction.findMany({ where: { invoiceId: { not: null } }, include: { invoice: true } });
  let created = 0;
  for (const t of legacy) {
    const key = { invoiceId_transactionId: { invoiceId: t.invoiceId, transactionId: t.id } };
    if (await p.paymentAllocation.findUnique({ where: key })) continue;
    // Under the old flow a payment settled its invoice in full.
    const amount = t.currency === t.invoice.currency ? Math.min(t.amount, t.invoice.amount) : t.invoice.amount;
    await p.paymentAllocation.create({ data: { invoiceId: t.invoiceId, transactionId: t.id, kind: "PAYMENT", amount } });
    created++;
  }

  // Same rule as the app (src/lib/invoice-status.ts). Existing paid dates are kept.
  const changes = [];
  for (const inv of await p.invoice.findMany({ include: { allocations: { include: { transaction: true } } } })) {
    if (inv.status === "VOID") continue;
    const settled = inv.allocations.reduce((s, a) => s + a.amount, 0);
    const status = settled <= EPS ? "OPEN" : settled >= inv.amount - EPS ? "PAID" : "PARTIAL";
    if (status === inv.status) continue;
    const last = inv.allocations.filter((a) => a.kind === "PAYMENT").map((a) => a.transaction.date).sort((a, b) => b - a)[0];
    await p.invoice.update({ where: { id: inv.id }, data: { status, paidDate: status === "PAID" ? inv.paidDate ?? last ?? null : null } });
    changes.push(`${inv.number ?? inv.id}: ${inv.status} -> ${status}`);
  }

  console.log(JSON.stringify({
    legacyLinks: legacy.length,
    allocationsCreated: created,
    allocationsTotal: await p.paymentAllocation.count(),
    statusChanges: changes,
  }));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
