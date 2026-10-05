// Regression tests for defects found in the October 2026 code review.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let L: typeof import("@/app/actions/ledger");
let I: typeof import("@/app/actions/invoices");
let C: typeof import("@/app/actions/costs");
let A: typeof import("@/app/actions/accounts");
let B: typeof import("@/app/actions/bank");
let ST: typeof import("@/app/actions/settings");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  L = await import("@/app/actions/ledger");
  I = await import("@/app/actions/invoices");
  C = await import("@/app/actions/costs");
  A = await import("@/app/actions/accounts");
  B = await import("@/app/actions/bank");
  ST = await import("@/app/actions/settings");
  S = await seed();
});
const entry = (description: string, extra: Record<string, string | number | File> = {}) =>
  fd({ type: "EXPENSE", amount: 1000000, currency: "VND", date: "2026-07-10", accountId: S.vnd.id, categoryId: S.expense.id, description, ...extra });
const find = (description: string) => S.prisma.transaction.findFirstOrThrow({ where: { description } });
const invoiceStatus = async (id: string) => (await S.prisma.invoice.findUniqueOrThrow({ where: { id } })).status;
async function receivable(number: string, amount: number, currency = "VND") {
  await I.createInvoice(fd({ direction: "RECEIVABLE", number, issueDate: "2026-07-01", dueDate: "2026-07-31", currency, amount }));
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
}

test("H1: a register item already in the ledger can still have its review updated (evidence fields aren't sent)", async () => {
  as.admin();
  await C.saveCostItem(null, fd({ provider: "Contabo", receiptDate: "2026-07-05", amount: 50, currency: "EUR", payer: "OWNER", reimbursement: "OWED" }));
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Contabo" } });
  assert.equal((await L.createTransaction(entry("Contabo VPS", { accountId: S.owner.id, currency: "EUR", amount: 50, rateMode: "BANK", vndAmount: 1500000, costItemId: item.id }))).success, true);
  // The dialog disables the receipt's evidence fields, so only the review fields arrive.
  const res = await C.saveCostItem(item.id, fd({ payer: "OWNER", reimbursement: "REIMBURSED", docStatus: "INVOICE", reviewNote: "paid back 5 Aug", files: new File([new Uint8Array(5)], "repayment.pdf") }));
  assert.equal(res.success, true, res.message);
  const after = await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id }, include: { attachments: true } });
  assert.deepEqual([after.reimbursement, after.docStatus, after.amount, after.provider], ["REIMBURSED", "INVOICE", 50, "Contabo"]);
  assert.equal(after.attachments[0].transactionId, after.transactionId); // a receipt added later reaches the expense too
});

test("H2: an entry that settles invoices can't be shrunk, re-currencied or flipped under them", async () => {
  as.admin();
  const inv = await receivable("H2", 10000000);
  await I.recordPayment(inv.id, fd({ amount: 10000000, paidDate: "2026-07-20", accountId: S.vnd.id }));
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "H2" } });
  const edit = (extra: Record<string, string | number>) =>
    L.editTransaction(pay.id, fd({ type: "INCOME", amount: 10000000, currency: "VND", date: "2026-07-20", accountId: S.vnd.id, description: pay.description!, ...extra }));
  assert.match((await edit({ amount: 8000000 })).message ?? "", /invoice/i);
  assert.match((await edit({ currency: "USD", rateMode: "MANUAL", rate: 25000 })).message ?? "", /invoice/i);
  assert.match((await edit({ type: "EXPENSE" })).message ?? "", /invoice/i);
  assert.equal((await edit({ description: "renamed" })).success, true);
  assert.equal(await invoiceStatus(inv.id), "PAID");
});

test("M1: a draft payment doesn't settle an invoice until it's reviewed", async () => {
  as.admin();
  const inv = await receivable("M1", 5000000);
  as.staff();
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 5000000, paidDate: "2026-07-21", accountId: S.vnd.id }))).success, true);
  assert.equal(await invoiceStatus(inv.id), "OPEN");
  as.admin();
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "M1" } });
  await L.reviewEntries([pay.id]);
  assert.equal(await invoiceStatus(inv.id), "PAID");
  // …and a reviewed payment that staff change goes back to draft — the invoice reopens.
  as.staff();
  await L.editTransaction(pay.id, fd({ type: "INCOME", amount: 5000000, currency: "VND", date: "2026-07-21", accountId: S.vnd.id, description: "edited by staff" }));
  assert.equal(await invoiceStatus(inv.id), "OPEN");
});

test("M2: reversing an expense that came from the register puts the item back to pending", async () => {
  as.admin();
  await C.saveCostItem(null, fd({ provider: "Twilio", receiptDate: "2026-07-01", amount: 20, currency: "USD", files: new File([new Uint8Array(3)], "twilio.pdf") }));
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Twilio" } });
  await L.createTransaction(entry("Twilio", { currency: "USD", amount: 20, rateMode: "MANUAL", rate: 26000, costItemId: item.id }));
  const t = await find("Twilio");
  await L.postEntries([t.id]);
  assert.equal((await L.reverseEntry(t.id, "wrong card")).success, true);
  const after = await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id }, include: { attachments: true } });
  assert.deepEqual([after.status, after.transactionId, after.attachments[0]?.transactionId], ["PENDING", null, null]);
});

test("M3: converting a register item is atomic — two submits make one expense", async () => {
  as.admin();
  await C.saveCostItem(null, fd({ provider: "Runpod", receiptDate: "2026-06-16", amount: 100, currency: "USD" }));
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Runpod" } });
  const submit = () => L.createTransaction(entry("Runpod credits", { currency: "USD", amount: 100, rateMode: "MANUAL", rate: 26000, costItemId: item.id }));
  const results = await Promise.all([submit(), submit()]);
  assert.equal(results.filter((r) => r.success).length, 1);
  assert.equal(await S.prisma.transaction.count({ where: { description: "Runpod credits" } }), 1);
});

test("M4: a reversed entry's tax review is frozen, so the pair keeps netting to zero", async () => {
  as.admin();
  await L.createTransaction(entry("to reverse"));
  const t = await find("to reverse");
  await L.postEntries([t.id]);
  await L.reverseEntry(t.id, "duplicate");
  const res = await L.editTransaction(t.id, fd({ docStatus: "INVOICE", purposeStatus: "CONFIRMED", citStatus: "DEDUCTIBLE" }));
  assert.equal(res.success, false);
  assert.equal((await find("to reverse")).citStatus, "PENDING");
});

test("M5: a category in use can't be deleted or switched between income and expense", async () => {
  as.admin();
  await L.createTransaction(entry("categorised"));
  const res = await ST.deleteCategory(S.expense.id);
  assert.equal(res?.success, false);
  assert.ok(await S.prisma.category.findUnique({ where: { id: S.expense.id } }));
  assert.equal((await ST.updateCategory(S.expense.id, fd({ name: "Cloud & software", type: "INCOME" }))).success, false);
  assert.equal((await ST.updateCategory(S.expense.id, fd({ name: "Cloud services", type: "EXPENSE" }))).success, true);
});

test("M6: editing a default-rate entry keeps its rate — it isn't re-priced at today's default", async () => {
  as.admin();
  await L.createTransaction(entry("usd at default", { currency: "USD", amount: 100, rateMode: "DEFAULT" }));
  const t = await find("usd at default");
  await ST.updateExchangeRate(fd({ rate: 26000 })); // the company default moves on
  await L.editTransaction(t.id, entry("usd at default (renamed)", { currency: "USD", amount: 100, rateMode: "DEFAULT" }));
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: t.id } })).exchangeRate, t.exchangeRate);
});

test("L1: a fee's only evidence can't be removed while the fee explains an invoice", async () => {
  as.admin();
  const inv = await receivable("L1", 100, "USD");
  await I.recordPayment(inv.id, fd({ amount: 95, paidDate: "2026-07-20", accountId: S.usd.id }));
  await L.createTransaction(fd({ type: "EXPENSE", amount: 5, currency: "USD", date: "2026-07-20", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, description: "bank fee", files: new File([new Uint8Array(4)], "advice.pdf") }));
  const fee = await S.prisma.transaction.findFirstOrThrow({ where: { description: "bank fee" }, include: { attachments: true } });
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "FEE", transactionId: fee.id, amount: 5 }))).success, true);
  assert.equal((await L.deleteAttachment(fee.attachments[0].id)).success, false);
});

test("L3: undoing an import is refused while another statement overlaps it", async () => {
  as.admin();
  const mk = (from: string, to: string, key: string) => S.prisma.bankStatement.create({ data: { accountId: S.usd.id, fileName: key, periodFrom: new Date(from), periodTo: new Date(to), openingBalance: 0, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 0 } });
  const a = await mk("2026-05-01", "2026-08-31", "a");
  await mk("2026-08-01", "2026-10-04", "b");
  const res = await B.deleteStatement(a.id);
  assert.equal(res.success, false);
  assert.match(res.message!, /overlap/);
});

test("L11: staff editing an invoice puts its reviewed payments back to draft", async () => {
  as.admin();
  await I.createInvoice(fd({ direction: "PAYABLE", number: "L11", vendorId: S.vendor.id, issueDate: "2026-07-01", dueDate: "2026-07-31", currency: "VND", amount: 2000000 }));
  const bill = await S.prisma.invoice.findFirstOrThrow({ where: { number: "L11" } });
  await I.recordPayment(bill.id, fd({ amount: 2000000, paidDate: "2026-07-15", accountId: S.vnd.id }));
  as.staff();
  await I.updateInvoice(bill.id, fd({ number: "L11-B", vendorId: S.vendor.id, issueDate: "2026-07-01", dueDate: "2026-07-31", currency: "VND", amount: 2000000 }));
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "L11-B" } });
  assert.equal(pay.status, "DRAFT");
});

test("L13: an account's currency can't change once it has bank statement lines", async () => {
  as.admin();
  const acct = await S.prisma.account.create({ data: { name: "Spare", type: "BANK", currency: "VND" } });
  const st = await S.prisma.bankStatement.create({ data: { accountId: acct.id, fileName: "s", periodFrom: new Date("2026-06-01"), periodTo: new Date("2026-06-30"), openingBalance: 0, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 1 } });
  await S.prisma.bankLine.create({ data: { accountId: acct.id, statementId: st.id, txnDate: new Date("2026-06-02"), amount: 5, locator: "x", dedupeKey: "k" } });
  assert.equal((await A.saveAccount(acct.id, fd({ name: "Spare", type: "BANK", currency: "USD", openingBalance: 0 }))).success, false);
});

test("L5: the default USD rate is the owner's setting, whichever admin account is oldest or inactive", async () => {
  as.admin();
  const { defaultUsdRate } = await import("@/lib/fx");
  const old = await S.prisma.user.create({ data: { username: "former", passwordHash: "x", role: "ADMIN", defaultUsdRate: 1, isActive: false, createdAt: new Date("2020-01-01") } });
  await ST.updateExchangeRate(fd({ rate: 26400 }));
  assert.equal(await defaultUsdRate(), 26400);
  await S.prisma.user.delete({ where: { id: old.id } });
});

test("security: statuses must be real values — built-in names like toString are refused", async () => {
  as.staff();
  const res = await L.createTransaction(entry("sneaky", { docStatus: "toString" }));
  assert.equal(res.success, false);
  assert.equal((await C.saveCostItem(null, fd({ provider: "X", receiptDate: "2026-07-01", amount: 1, currency: "USD", payer: "constructor", docStatus: "__proto__" }))).success, true);
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "X" } });
  assert.deepEqual([item.payer, item.docStatus], ["UNKNOWN", "RECEIPT"]);
});

test("security: staff can't remove evidence from reviewed entries, void invoices, or unlink/unmatch posted payments", async () => {
  as.admin();
  await L.createTransaction(entry("reviewed with receipt", { files: new File([new Uint8Array(2)], "r.pdf") }));
  const t = await S.prisma.transaction.findFirstOrThrow({ where: { description: "reviewed with receipt" }, include: { attachments: true } });
  const inv = await receivable("SEC", 100);
  as.staff();
  assert.equal((await L.deleteAttachment(t.attachments[0].id)).success, false);
  assert.equal((await I.voidInvoice(inv.id)).success, false);
  as.admin();
  await I.recordPayment(inv.id, fd({ amount: 100, paidDate: "2026-07-20", accountId: S.vnd.id }));
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "SEC" }, include: { allocations: true } });
  await L.postEntries([pay.id]);
  as.staff();
  assert.equal((await I.unlinkAllocation(pay.allocations[0].id)).success, false);
  as.admin();
  assert.equal((await I.voidInvoice((await receivable("SEC2", 5)).id)).success, true);
});
