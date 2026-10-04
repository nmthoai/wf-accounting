// One-off, idempotent data fix (4 Oct 2026). Phase 1 dated the migrated capital
// and owner-loan entries from the review workbook, whose bank dates run one day
// early. The MB VND statement shows the capital on 17 Jun 2026 and the loan on
// 21 Jun 2026 (posted 22 Jun). Only entries still on the old date are moved.
// Run with the app's DATABASE_URL:  node scripts/fix-financing-dates.cjs
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const DAY = 86400000;
const FIXES = [
  { type: "CAPITAL_IN", amount: 100000000, from: "2026-06-16", to: "2026-06-17" },
  { type: "LOAN_IN", amount: 50000000, from: "2026-06-20", to: "2026-06-21" },
];

(async () => {
  for (const f of FIXES) {
    const start = new Date(`${f.from}T00:00:00.000Z`);
    const hits = await p.transaction.findMany({
      where: { type: f.type, amount: f.amount, date: { gte: start, lt: new Date(+start + DAY) } },
    });
    if (hits.length !== 1) {
      console.log(`${f.type} ${f.amount}: ${hits.length} entries dated ${f.from} — left unchanged`);
      continue;
    }
    await p.transaction.update({ where: { id: hits[0].id }, data: { date: new Date(`${f.to}T00:00:00.000Z`) } });
    console.log(`${f.type} ${f.amount}: ${f.from} -> ${f.to}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
