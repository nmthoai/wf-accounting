// One-off, idempotent migration onto per-account balances (Phase 1).
//
// The mapping follows the owner-confirmed facts in the 4 Oct 2026 accounting
// review (WorkFactory_Accounting_Review_2026-10-04.xlsx):
//   - Both MBBank statements start on 1 May 2026 at 0, so MB VND, MB USD and the
//     term deposit open at 0 on 2026-05-01.
//   - The old Balance tab's 100,000,000 "opening balance" was the charter-capital
//     contribution (bank VND-009, 16 Jun 2026, "Von dieu le") -> capital movement.
//   - Its 50,000,000 deposit was the owner loan (bank VND-011, 20 Jun 2026)
//     -> loan received, on an "Owner loan". The two 25,000,000 repayments
//     (VND-029, VND-038) arrive with the bank-statement import, not here.
//   - The June USD client receipts (1,100 + 3,100) were cash paid to the owner
//     directly, not into MB USD -> an owner account in USD; custody unreconciled.
// The old Balance tab's own dates were entry timestamps, so the bank dates are used.
//
// Safe to re-run: every step checks before writing, and nothing is deleted
// (the old BankBalance rows stay until the new balances are confirmed).
// Run with the app's DATABASE_URL:  node scripts/migrate-accounts.cjs
const { PrismaClient } = require("@prisma/client");

const p = new PrismaClient();
const MARK = "[from old Balance tab]";
const STATEMENT_START = new Date("2026-05-01");

const SEED = [
  { name: "MB VND", type: "BANK", currency: "VND", openingDate: STATEMENT_START, notes: "MBBank company VND account" },
  { name: "MB USD", type: "BANK", currency: "USD", openingDate: STATEMENT_START, notes: "MBBank company USD account" },
  { name: "MB Term Deposit", type: "TERM_DEPOSIT", currency: "VND", openingDate: STATEMENT_START, notes: "MBBank term deposits" },
  { name: "Company cash", type: "CASH", currency: "VND", openingDate: null, notes: null },
  { name: "Owner-paid", type: "OWNER", currency: "VND", openingDate: null, notes: "Costs the owner paid personally" },
  {
    name: "Owner-held cash (USD)", type: "OWNER", currency: "USD", openingDate: null,
    notes: "June 2026 client cash (USD 1,100 + 3,100) received by the owner directly; custody not reconciled (review 4 Oct 2026)",
  },
];

async function account(name) {
  const a = await p.account.findFirst({ where: { name } });
  if (!a) throw new Error(`account missing: ${name}`);
  return a;
}

// Create a movement once (matched on type + amount + marker text).
async function once(data) {
  const exists = await p.transaction.findFirst({ where: { type: data.type, amount: data.amount, description: data.description } });
  if (exists) return false;
  await p.transaction.create({ data });
  return true;
}

(async () => {
  // 1. Accounts (created one by one so they list in this order).
  if ((await p.account.count()) === 0) {
    for (const a of SEED) await p.account.create({ data: a });
  }
  const mbVnd = await account("MB VND");
  const mbUsd = await account("MB USD");
  const ownerUsd = await account("Owner-held cash (USD)");

  // 2. Existing entries get an account. June USD income was client cash taken
  //    by the owner; any other USD goes to MB USD; VND to MB VND.
  const juneCash = await p.transaction.updateMany({
    where: { accountId: null, type: "INCOME", currency: "USD", date: { gte: new Date("2026-06-01"), lt: new Date("2026-07-01") } },
    data: { accountId: ownerUsd.id },
  });
  const usd = await p.transaction.updateMany({ where: { accountId: null, currency: "USD" }, data: { accountId: mbUsd.id } });
  const vnd = await p.transaction.updateMany({ where: { accountId: null, currency: "VND" }, data: { accountId: mbVnd.id } });
  //    USD entries were booked at the app default (26,400) — keep them, flagged as such.
  const rate = await p.transaction.updateMany({ where: { currency: { not: "VND" }, rateSource: null }, data: { rateSource: "DEFAULT" } });

  // 3. The old Balance tab's rows become what they really were.
  const created = [];
  for (const m of await p.bankBalance.findMany({ orderBy: { date: "asc" } })) {
    const was = `${m.type.toLowerCase()} of ${m.date.toISOString().slice(0, 10)}`;
    if (m.type === "OPENING" && m.amount === 100000000) {
      if (await once({
        type: "CAPITAL_IN", amount: m.amount, currency: "VND", exchangeRate: 1, accountId: mbVnd.id,
        date: new Date("2026-06-16"), description: `Charter capital contribution (Von dieu le) ${MARK} — was the ${was}`,
      })) created.push("capital 100,000,000 (2026-06-16)");
    } else if (m.type === "DEPOSIT" && m.amount === 50000000) {
      let loan = await p.loan.findFirst({ where: { lender: "Owner loan — Nguyễn Minh Thoại" } });
      if (!loan) loan = await p.loan.create({ data: { lender: "Owner loan — Nguyễn Minh Thoại", currency: "VND", notes: "Owner-confirmed loan, repaid in two VND 25m transfers (Aug & Sep 2026)" } });
      if (await once({
        type: "LOAN_IN", amount: m.amount, currency: "VND", exchangeRate: 1, accountId: mbVnd.id, loanId: loan.id,
        date: new Date("2026-06-20"), description: `Owner loan received ${MARK} — was the ${was}`,
      })) created.push("loan received 50,000,000 (2026-06-20)");
    } else if (m.type === "DEPOSIT" || m.type === "WITHDRAWAL") {
      // Anything else stays visible but unclassified.
      const type = m.type === "DEPOSIT" ? "OTHER_IN" : "OTHER_OUT";
      if (await once({
        type, amount: m.amount, currency: "VND", exchangeRate: 1, accountId: mbVnd.id, date: m.date,
        description: `${m.description ?? ""} ${MARK}`.trim(),
      })) created.push(`${type} ${m.amount}`);
    }
  }

  console.log(JSON.stringify({
    accounts: await p.account.count(),
    juneCashToOwner: juneCash.count, assignedUsd: usd.count, assignedVnd: vnd.count,
    foreignMarkedDefaultRate: rate.count,
    created,
    unassignedLeft: await p.transaction.count({ where: { accountId: null } }),
  }));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
