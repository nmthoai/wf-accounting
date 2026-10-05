import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let L: typeof import("@/app/actions/ledger");
let I: typeof import("@/app/actions/invoices");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  L = await import("@/app/actions/ledger");
  I = await import("@/app/actions/invoices");
  S = await seed();
});

const expense = (extra: Record<string, string | number> = {}) =>
  fd({ type: "EXPENSE", amount: 250000, currency: "VND", date: "2026-07-10", accountId: S.vnd.id, categoryId: S.expense.id, description: "Hosting", ...extra });
const make = async (description: string, extra: Record<string, string | number> = {}) => {
  const res = await L.createTransaction(expense({ description, ...extra }));
  assert.equal(res.success, true, res.message);
  return S.prisma.transaction.findFirstOrThrow({ where: { description } });
};
const history = (id: string) => S.prisma.changeLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });

test("signed out: nothing can be created or changed", async () => {
  as.nobody();
  await assert.rejects(() => L.createTransaction(expense()), /Unauthorized/);
  await assert.rejects(() => L.reviewEntries(["x"]), /Unauthorized/);
  assert.equal(await S.prisma.transaction.count(), 0);
});

test("the owner's entries start reviewed, staff entries start as drafts; creation is in the history", async () => {
  as.admin();
  const mine = await make("owner entry");
  as.staff();
  const dots = await make("staff entry");
  assert.equal(mine.status, "REVIEWED");
  assert.equal(dots.status, "DRAFT");
  assert.equal(dots.createdBy, "dot");
  assert.deepEqual((await history(dots.id)).map((h) => [h.action, h.user]), [["CREATE", "dot"]]);
});

test("staff can't make business-use, CIT or VAT decisions — even with a crafted form", async () => {
  as.staff();
  const t = await make("crafted", { docStatus: "INVOICE", purposeStatus: "CONFIRMED", citStatus: "DEDUCTIBLE", vatStatus: "CLAIMABLE", vatAmount: 1000 });
  assert.deepEqual([t.docStatus, t.purposeStatus, t.citStatus, t.vatStatus], ["INVOICE", "PENDING", "PENDING", "PENDING"]);
});

test("a reviewed entry changed by staff goes back to draft, with old → new and the reason recorded", async () => {
  as.admin();
  const t = await make("to be edited");
  as.staff();
  const res = await L.editTransaction(t.id, expense({ description: "to be edited (fixed)", reason: "typo in name" }));
  assert.equal(res.success, true, res.message);
  const after = await S.prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
  assert.equal(after.status, "DRAFT");
  const rows = (await history(t.id)).filter((h) => h.action === "UPDATE");
  assert.deepEqual(rows.map((h) => [h.field, h.oldValue, h.newValue, h.reason]), [
    ["description", "to be edited", "to be edited (fixed)", "typo in name"],
    ["status", "REVIEWED", "DRAFT", "typo in name"],
  ]);
});

test("only the owner approves, posts and reverses", async () => {
  as.admin();
  const t = await make("needs approval");
  as.staff();
  await assert.rejects(() => L.reviewEntries([t.id]), /Unauthorized/);
  await assert.rejects(() => L.postEntries([t.id]), /Unauthorized/);
  await assert.rejects(() => L.reverseEntry(t.id, "why"), /Unauthorized/);
  await assert.rejects(() => L.deleteTransaction(t.id), /Unauthorized/);
});

test("posting locks money and classification; evidence and tax review can still change", async () => {
  as.admin();
  const t = await make("to post", { amount: 500000 });
  assert.equal((await L.postEntries([t.id])).count, 1);
  // A crafted edit trying to change the amount and category changes only the review fields.
  const res = await L.editTransaction(t.id, expense({ description: "changed?", amount: 1, docStatus: "INVOICE", reviewNote: "invoice arrived" }));
  assert.equal(res.success, true, res.message);
  const after = await S.prisma.transaction.findUniqueOrThrow({ where: { id: t.id } });
  assert.deepEqual([after.amount, after.description, after.docStatus, after.reviewNote, after.status], [500000, "to post", "INVOICE", "invoice arrived", "POSTED"]);
  await assert.rejects(() => L.deleteTransaction(t.id), /Posted entries can't be deleted/);
  const att = await S.prisma.attachment.create({ data: { filePath: "x.pdf", fileName: "x.pdf", fileType: "application/pdf", transactionId: t.id } });
  assert.equal((await L.deleteAttachment(att.id)).success, false);
});

test("post-through posts every reviewed entry up to the date — never drafts, never later entries", async () => {
  as.admin();
  const june = await make("june reviewed", { date: "2026-06-15" });
  const july = await make("july reviewed", { date: "2026-07-01" });
  as.staff();
  const draft = await make("june draft", { date: "2026-06-20" });
  as.admin();
  await L.postEntries(null, "2026-06-30");
  const s = async (id: string) => (await S.prisma.transaction.findUniqueOrThrow({ where: { id } })).status;
  assert.deepEqual([await s(june.id), await s(july.id), await s(draft.id)], ["POSTED", "REVIEWED", "DRAFT"]);
  assert.equal((await L.postEntries(null, "bad-date")).success, false);
});

test("reverse: needs a reason; mirror is posted; bank match and invoice link released; once only; correction re-entered", async () => {
  as.admin();
  const inv = await I.createInvoice(fd({ direction: "PAYABLE", number: "B-1", vendorId: S.vendor.id, issueDate: "2026-06-20", dueDate: "2026-06-30", currency: "VND", amount: 8221200 }));
  assert.equal(inv.success, true);
  const bill = await S.prisma.invoice.findFirstOrThrow({ where: { number: "B-1" } });
  assert.equal((await I.recordPayment(bill.id, fd({ amount: 8221200, paidDate: "2026-06-21", accountId: S.vnd.id }))).success, true);
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { description: "Vendor payment — Bill B-1" } });
  const st = await S.prisma.bankStatement.create({ data: { accountId: S.vnd.id, fileName: "s.xlsx", periodFrom: new Date("2026-06-01"), periodTo: new Date("2026-06-30"), openingBalance: 0, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 1 } });
  const line = await S.prisma.bankLine.create({ data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-06-21"), amount: -8221200, locator: "x", dedupeKey: "k1" } });
  await S.prisma.transaction.update({ where: { id: pay.id }, data: { bankLineId: line.id } });

  assert.equal((await L.reverseEntry(pay.id, "x")).success, false); // not posted yet
  await L.postEntries([pay.id]);
  assert.equal((await L.reverseEntry(pay.id, "  ")).success, false); // no reason
  const res = await L.reverseEntry(pay.id, "wrong vendor");
  assert.equal(res.success, true, res.message);

  const rev = await S.prisma.transaction.findFirstOrThrow({ where: { reversalOfId: pay.id } });
  const orig = await S.prisma.transaction.findUniqueOrThrow({ where: { id: pay.id }, include: { allocations: true } });
  assert.deepEqual([rev.amount, rev.status, rev.type, rev.accountId], [-8221200, "POSTED", "EXPENSE", S.vnd.id]);
  assert.equal(orig.bankLineId, null);
  assert.equal(orig.allocations.length, 0);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: bill.id } })).status, "OPEN");
  assert.equal((await L.reverseEntry(pay.id, "again")).success, false);
  assert.equal((await L.reverseEntry(rev.id, "reverse the reversal")).success, false);
  assert.deepEqual((await history(pay.id)).map((h) => h.action).slice(-3), ["UNMATCH", "UNLINK", "REVERSE"]);

  // The correction is linked to the reversed entry; a live entry can't be "corrected".
  assert.equal((await L.createTransaction(expense({ description: "corrected", correctionOfId: pay.id }))).success, true);
  assert.equal((await S.prisma.transaction.findFirstOrThrow({ where: { description: "corrected" } })).correctionOfId, pay.id);
  const live = await make("live entry");
  assert.equal((await L.createTransaction(expense({ description: "bad correction", correctionOfId: live.id }))).success, false);
});

test("an entry matched to a bank line can't be moved off it or past its amount", async () => {
  as.admin();
  const t = await make("matched", { amount: 1000000 });
  const st = await S.prisma.bankStatement.create({ data: { accountId: S.vnd.id, fileName: "s2.xlsx", periodFrom: new Date("2026-07-01"), periodTo: new Date("2026-07-31"), openingBalance: 0, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 1 } });
  const line = await S.prisma.bankLine.create({ data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-07-10"), amount: -1000000, locator: "x", dedupeKey: "k2" } });
  await S.prisma.transaction.update({ where: { id: t.id }, data: { bankLineId: line.id } });
  assert.match((await L.editTransaction(t.id, expense({ description: "matched", amount: 1200000 }))).message!, /more than the bank line/);
  assert.match((await L.editTransaction(t.id, expense({ description: "matched", amount: 1000000, accountId: S.cash.id }))).message!, /must be too/);
  assert.match((await L.editTransaction(t.id, expense({ description: "matched", amount: 1000000, type: "INCOME" }))).message!, /money out/);
});

test("deleting one leg of a transfer deletes both", async () => {
  as.admin();
  const A = await import("@/app/actions/accounts");
  assert.equal((await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 300000, date: "2026-07-15", description: "petty cash" }))).success, true);
  const legs = await S.prisma.transaction.findMany({ where: { description: "petty cash" } });
  assert.equal(legs.length, 2);
  await L.deleteTransaction(legs[0].id);
  assert.equal(await S.prisma.transaction.count({ where: { description: "petty cash" } }), 0);
  assert.equal((await S.prisma.changeLog.findMany({ where: { action: "DELETE", entityId: { in: legs.map((l) => l.id) } } })).length, 2);
});
