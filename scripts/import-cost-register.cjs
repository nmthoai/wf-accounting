// Import receipts into the cost register from a JSON file — an array of
// { ref, provider, receiptDate, amount, currency, servicePeriodFrom?,
//   servicePeriodTo?, receiptNumber?, billingEntity?, payer, reimbursement,
//   docStatus, status, notes?, reviewNote? } (dates as YYYY-MM-DD).
// Idempotent: an item whose ref is already in the register is skipped.
// Run with the app's DATABASE_URL:  node scripts/import-cost-register.cjs <file.json>
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const day = (s) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

(async () => {
  const items = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  let added = 0, skipped = 0;
  for (const i of items) {
    if (!i.ref || (await p.costItem.findUnique({ where: { ref: i.ref } }))) { skipped++; continue; }
    await p.costItem.create({
      data: {
        ref: i.ref, provider: i.provider, receiptDate: day(i.receiptDate), amount: i.amount, currency: i.currency,
        servicePeriodFrom: day(i.servicePeriodFrom), servicePeriodTo: day(i.servicePeriodTo),
        receiptNumber: i.receiptNumber || null, billingEntity: i.billingEntity || null,
        payer: i.payer, reimbursement: i.reimbursement, docStatus: i.docStatus, status: i.status,
        notes: i.notes || null, reviewNote: i.reviewNote || null, createdBy: "register import",
      },
    });
    added++;
  }
  const byStatus = await p.costItem.groupBy({ by: ["status"], _count: true });
  console.log(JSON.stringify({ added, skipped, register: Object.fromEntries(byStatus.map((s) => [s.status, s._count])) }));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
