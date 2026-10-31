import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

// Owner rules for the Accounts page (1 Nov 2026): unclassified movements can be
// classified as income or an expense; loans can be edited, and deleted only
// while unused; bank, cash and term-deposit accounts never open negative.

let A: typeof import("@/app/actions/accounts");
let S: Awaited<ReturnType<typeof seed>>;
let interest: { id: string };
before(async () => {
  A = await import("@/app/actions/accounts");
  S = await seed();
  interest = await S.prisma.category.create({ data: { name: "Bank interest", type: "INCOME" } });
});

const row = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });

// An unclassified bank movement, as carried over or imported.
const unclassified = (type: "OTHER_IN" | "OTHER_OUT", description: string, extra: Record<string, unknown> = {}) =>
  S.prisma.transaction.create({
    data: { type, amount: 125000, currency: "VND", accountId: S.vnd.id, date: new Date("2026-10-31T00:00:00.000Z"), description, status: "REVIEWED", ...extra },
  });

const classify = (id: string, values: Record<string, string | number>) =>
  A.classifyMovement(id, fd({ amount: 125000, date: "2026-10-31", accountId: S.vnd.id, ...values }));

// ---- Classifying as income or an expense ------------------------------------

test("bank interest classified as income under an income category becomes a P&L entry with history", async () => {
  as.admin();
  const m = await unclassified("OTHER_IN", "Lai nhap von");
  const res = await classify(m.id, { type: "INCOME", categoryId: interest.id, description: "Lai nhap von" });
  assert.deepEqual(res, { success: true });

  const now = await row(m.id);
  assert.equal(now.type, "INCOME");
  assert.equal(now.categoryId, interest.id);
  assert.equal(now.status, "REVIEWED"); // the owner's change keeps it booked
  assert.equal(now.amount, 125000);
  for (const f of ["docStatus", "purposeStatus", "citStatus", "vatStatus"] as const) assert.equal(now[f], "PENDING");
  assert.equal(now.vatAmount, null);

  const log = await S.prisma.changeLog.findMany({ where: { entityId: m.id, action: "UPDATE" } });
  const typeChange = log.find((c) => c.field === "type");
  assert.equal(typeChange?.oldValue, "OTHER_IN");
  assert.equal(typeChange?.newValue, "INCOME");
  assert.equal(log.find((c) => c.field === "categoryId")?.newValue, interest.id);
  assert.equal(log[0].user, "owner");

  // Classified, it no longer counts as unclassified: classifying it again is refused.
  const again = await classify(m.id, { type: "INCOME", categoryId: interest.id });
  assert.equal(again.success, false);
  assert.match(again.message ?? "", /already classified/i);
});

test("staff classifying a reviewed card charge as an expense sends it for review", async () => {
  as.staff();
  const m = await unclassified("OTHER_OUT", "Phi the VISA");
  const res = await classify(m.id, { type: "EXPENSE", categoryId: S.expense.id });
  assert.equal(res.success, true);
  const now = await row(m.id);
  assert.equal(now.type, "EXPENSE");
  assert.equal(now.categoryId, S.expense.id);
  assert.equal(now.status, "DRAFT");
});

test("income and expense each need a category of their own type", async () => {
  as.admin();
  const inn = await unclassified("OTHER_IN", "Refund");
  const out = await unclassified("OTHER_OUT", "SMS fee");

  const none = await classify(inn.id, { type: "INCOME" });
  assert.equal(none.success, false);
  assert.match(none.message ?? "", /income category.*Settings/i);

  const wrongIn = await classify(inn.id, { type: "INCOME", categoryId: S.expense.id });
  assert.equal(wrongIn.success, false);
  assert.match(wrongIn.message ?? "", /“Cloud & software” is an expense category/);

  const noneOut = await classify(out.id, { type: "EXPENSE" });
  assert.match(noneOut.message ?? "", /expense category.*Settings/i);
  const wrongOut = await classify(out.id, { type: "EXPENSE", categoryId: interest.id });
  assert.match(wrongOut.message ?? "", /“Bank interest” is an income category/);

  assert.equal((await row(inn.id)).type, "OTHER_IN");
  assert.equal((await row(out.id)).type, "OTHER_OUT");
});

test("money in can't become an expense, nor money out income", async () => {
  as.admin();
  const inn = await unclassified("OTHER_IN", "Interest");
  const out = await unclassified("OTHER_OUT", "Annual card fee");

  const r1 = await classify(inn.id, { type: "EXPENSE", categoryId: S.expense.id });
  assert.equal(r1.success, false);
  assert.match(r1.message ?? "", /came into the account.*can't be an expense/i);
  const r2 = await classify(out.id, { type: "INCOME", categoryId: interest.id });
  assert.equal(r2.success, false);
  assert.match(r2.message ?? "", /went out of the account.*can't be income/i);
  assert.equal((await row(inn.id)).type, "OTHER_IN");
});

test("a posted unclassified movement can't be classified", async () => {
  as.admin();
  const m = await unclassified("OTHER_IN", "Interest Sep", { status: "POSTED" });
  const res = await classify(m.id, { type: "INCOME", categoryId: interest.id });
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /posted/i);
  assert.equal((await row(m.id)).type, "OTHER_IN");
});

test("financing forms can't record income or expenses", async () => {
  as.admin();
  const rec = await A.recordMovement(fd({ type: "INCOME", amount: 1000, date: "2026-10-31", accountId: S.vnd.id }));
  assert.equal(rec.success, false);
  const m = await unclassified("OTHER_IN", "through the edit form");
  const upd = await A.updateMovement(m.id, fd({ type: "INCOME", amount: 125000, date: "2026-10-31", accountId: S.vnd.id }));
  assert.equal(upd.success, false);
  assert.equal((await row(m.id)).type, "OTHER_IN");
});

test("a USD movement keeps the rate and VND it was booked at", async () => {
  as.admin();
  const m = await unclassified("OTHER_IN", "USD interest", {
    accountId: S.usd.id, currency: "USD", amount: 1.25, exchangeRate: 25000, vndAmount: 31250, rateSource: "BANK",
  });
  const res = await A.classifyMovement(m.id, fd({ type: "INCOME", categoryId: interest.id, amount: 1.25, date: "2026-10-31", accountId: S.usd.id }));
  assert.equal(res.success, true);
  const now = await row(m.id);
  assert.equal(now.exchangeRate, 25000);
  assert.equal(now.vndAmount, 31250);
  assert.equal(now.rateSource, "BANK");
});

test("a movement reviewed between reading and saving is not overwritten", async () => {
  as.admin();
  const m = await unclassified("OTHER_OUT", "race fee", { status: "DRAFT" });
  // Reviewed during the category lookup: after the read, before the write.
  const delegate = S.prisma.category;
  const original = delegate.findUnique;
  let calls = 0;
  delegate.findUnique = (async (args: { where: { id: string } }) => {
    if (calls++ === 0) await S.prisma.transaction.update({ where: { id: m.id }, data: { status: "REVIEWED" } });
    return original.call(delegate, args);
  }) as unknown as typeof original;
  as.staff();
  const res = await classify(m.id, { type: "EXPENSE", categoryId: S.expense.id }).finally(() => { delegate.findUnique = original; });
  assert.ok(calls > 0);
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /changed this entry.*try again/i);
  const now = await row(m.id);
  assert.equal(now.type, "OTHER_OUT");
  assert.equal(now.status, "REVIEWED");
  assert.equal(await S.prisma.changeLog.count({ where: { entityId: m.id } }), 0);
});

// ---- Loans: edit, and delete only while unused -------------------------------

test("an admin edits a loan's lender, notes and — while unused — its currency", async () => {
  as.admin();
  const loan = await S.prisma.loan.create({ data: { lender: "Owner", currency: "VND" } });
  const res = await A.updateLoan(loan.id, fd({ lender: "  Owner — Thoai  ", currency: "USD", notes: "0% interest" }));
  assert.deepEqual(res, { success: true });
  const now = await S.prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
  assert.equal(now.lender, "Owner — Thoai");
  assert.equal(now.currency, "USD");
  assert.equal(now.notes, "0% interest");

  const blank = await A.updateLoan(loan.id, fd({ lender: " ", currency: "USD" }));
  assert.equal(blank.success, false);
  assert.match(blank.message ?? "", /lender/i);
});

test("a loan with movements keeps its currency, but its lender and notes can change", async () => {
  as.admin();
  const loan = await S.prisma.loan.create({ data: { lender: "Bank A", currency: "VND" } });
  assert.equal((await A.recordMovement(fd({ type: "LOAN_IN", amount: 10000000, date: "2026-10-01", accountId: S.vnd.id, loanId: loan.id }))).success, true);

  const res = await A.updateLoan(loan.id, fd({ lender: "Bank A", currency: "USD" }));
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /1 movement is recorded against this loan, so its currency stays VND/);

  assert.equal((await A.updateLoan(loan.id, fd({ lender: "Bank A (renamed)", currency: "VND", notes: "12 months" }))).success, true);
  const now = await S.prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
  assert.equal(now.lender, "Bank A (renamed)");
  assert.equal(now.currency, "VND");
});

test("a loan is deleted only while no movement uses it, and the refusal says how many do", async () => {
  as.admin();
  const unused = await S.prisma.loan.create({ data: { lender: "Typo loan" } });
  assert.deepEqual(await A.deleteLoan(unused.id), { success: true });
  assert.equal(await S.prisma.loan.count({ where: { id: unused.id } }), 0);

  const used = await S.prisma.loan.create({ data: { lender: "Owner loan" } });
  for (const [type, amount] of [["LOAN_IN", 5000000], ["LOAN_REPAY", 1000000]] as const) {
    assert.equal((await A.recordMovement(fd({ type, amount, date: "2026-10-02", accountId: S.vnd.id, loanId: used.id }))).success, true);
  }
  const res = await A.deleteLoan(used.id);
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /2 movements are recorded against it/);
  assert.equal(await S.prisma.loan.count({ where: { id: used.id } }), 1);
  assert.equal(await S.prisma.transaction.count({ where: { loanId: used.id } }), 2);
});

test("a loan used by a movement recorded meanwhile is not deleted", async () => {
  as.admin();
  const loan = await S.prisma.loan.create({ data: { lender: "Race loan" } });
  // The movement lands after the in-use check, before the delete.
  const delegate = S.prisma.transaction;
  const original = delegate.count;
  let calls = 0;
  delegate.count = (async (args: unknown) => {
    const n = await original.call(delegate, args as Parameters<typeof original>[0]);
    if (calls++ === 0) {
      await S.prisma.transaction.create({ data: { type: "LOAN_IN", amount: 1000, accountId: S.vnd.id, date: new Date("2026-10-03"), loanId: loan.id } });
    }
    return n;
  }) as unknown as typeof original;
  const res = await A.deleteLoan(loan.id).finally(() => { delegate.count = original; });
  assert.ok(calls > 0);
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /1 movement is recorded against it/);
  assert.equal(await S.prisma.loan.count({ where: { id: loan.id } }), 1);
});

test("only an admin edits or deletes a loan", async () => {
  as.admin();
  const loan = await S.prisma.loan.create({ data: { lender: "Admin only" } });
  as.staff();
  await assert.rejects(A.updateLoan(loan.id, fd({ lender: "Changed", currency: "VND" })));
  await assert.rejects(A.deleteLoan(loan.id));
  const now = await S.prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
  assert.equal(now.lender, "Admin only");
});

// ---- Opening balances ---------------------------------------------------------

test("bank, cash and term-deposit accounts refuse a negative opening balance; owner accounts allow it", async () => {
  as.admin();
  for (const type of ["BANK", "CASH", "TERM_DEPOSIT"]) {
    const res = await A.saveAccount(null, fd({ name: `Negative ${type}`, type, currency: "VND", openingBalance: -1 }));
    assert.equal(res.success, false, type);
    assert.match(res.message ?? "", /can't have a negative opening balance — enter 0 or more/);
    assert.equal(await S.prisma.account.count({ where: { name: `Negative ${type}` } }), 0);
  }
  assert.equal((await A.saveAccount(null, fd({ name: "Zero bank", type: "BANK", currency: "VND", openingBalance: 0 }))).success, true);

  // Negative = the company owes the owner.
  assert.equal((await A.saveAccount(null, fd({ name: "Owner owed", type: "OWNER", currency: "VND", openingBalance: -5000000 }))).success, true);
  const owner = await S.prisma.account.findFirstOrThrow({ where: { name: "Owner owed" } });
  assert.equal(owner.openingBalance, -5000000);
});

test("editing an account to a negative opening balance is refused unless it is an owner account", async () => {
  as.admin();
  const res = await A.saveAccount(S.cash.id, fd({ name: "Company cash", type: "CASH", currency: "VND", openingBalance: -200000 }));
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /Cash account can't have a negative opening balance/);
  assert.equal((await S.prisma.account.findUniqueOrThrow({ where: { id: S.cash.id } })).openingBalance, 0);

  assert.equal((await A.saveAccount(S.owner.id, fd({ name: "Owner-paid", type: "OWNER", currency: "VND", openingBalance: -300000 }))).success, true);
  assert.equal((await S.prisma.account.findUniqueOrThrow({ where: { id: S.owner.id } })).openingBalance, -300000);
});

test("an old account that already opens negative can still be renamed or deactivated as it is", async () => {
  as.admin();
  const old = await S.prisma.account.create({ data: { name: "Old cash", type: "CASH", currency: "VND", openingBalance: -50000 } });
  assert.equal((await A.saveAccount(old.id, fd({ name: "Old cash (closed)", type: "CASH", currency: "VND", openingBalance: -50000, isActive: "false" }))).success, true);
  const now = await S.prisma.account.findUniqueOrThrow({ where: { id: old.id } });
  assert.deepEqual([now.name, now.isActive, now.openingBalance], ["Old cash (closed)", false, -50000]);
  // Changing the figure (or the type) is held to the rule.
  assert.equal((await A.saveAccount(old.id, fd({ name: "Old cash (closed)", type: "CASH", currency: "VND", openingBalance: -60000 }))).success, false);
  assert.equal((await A.saveAccount(old.id, fd({ name: "Old cash (closed)", type: "BANK", currency: "VND", openingBalance: -50000 }))).success, false);
});
