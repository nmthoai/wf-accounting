import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let A: typeof import("@/app/actions/accounts");
let I: typeof import("@/app/actions/invoices");
let L: typeof import("@/app/actions/ledger");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  A = await import("@/app/actions/accounts");
  I = await import("@/app/actions/invoices");
  L = await import("@/app/actions/ledger");
  S = await seed();
});
const invoice = async (number: string, values: Record<string, string | number>) => {
  const res = await I.createInvoice(fd({ number, issueDate: "2026-08-01", dueDate: "2026-08-31", ...values }));
  assert.equal(res.success, true, res.message);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
};
const status = async (id: string) => (await S.prisma.invoice.findUniqueOrThrow({ where: { id } })).status;

test("a USD → VND conversion keeps both sides and the rate implied by them (3,000 → 77,385,000 = 25,795)", async () => {
  as.admin();
  const res = await A.createTransfer(fd({ fromAccountId: S.usd.id, toAccountId: S.vnd.id, amountOut: 3000, amountIn: 77385000, date: "2026-09-30", description: "conversion" }));
  assert.equal(res.success, true, res.message);
  const legs = await S.prisma.transaction.findMany({ where: { description: "conversion" }, orderBy: { type: "asc" } });
  const [inn, out] = legs; // TRANSFER_IN, TRANSFER_OUT
  assert.equal(out.accountId, S.usd.id);
  assert.equal(out.amount, 3000);
  assert.equal(out.exchangeRate, 25795);
  assert.equal(out.vndAmount, 77385000);
  assert.equal(out.rateSource, "BANK");
  assert.equal(inn.amount, 77385000);
  assert.equal(out.transferId, inn.transferId);
  assert.equal((await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.vnd.id, amountOut: 1, date: "2026-09-30" }))).success, false);
});

test("a loan received and repaid in two parts has nothing outstanding; the loan's currency must match the account", async () => {
  as.admin();
  assert.equal((await A.createLoan(fd({ lender: "Owner", currency: "VND" }))).success, true);
  const loan = await S.prisma.loan.findFirstOrThrow({ where: { lender: "Owner" } });
  for (const [type, amount, date] of [["LOAN_IN", 50000000, "2026-06-21"], ["LOAN_REPAY", 25000000, "2026-08-28"], ["LOAN_REPAY", 25000000, "2026-09-29"]] as const) {
    assert.equal((await A.recordMovement(fd({ type, amount, date, accountId: S.vnd.id, loanId: loan.id }))).success, true);
  }
  const ts = await S.prisma.transaction.findMany({ where: { loanId: loan.id } });
  const received = ts.filter((t) => t.type === "LOAN_IN").reduce((s, t) => s + t.amount, 0);
  const repaid = ts.filter((t) => t.type === "LOAN_REPAY").reduce((s, t) => s + t.amount, 0);
  assert.equal(received - repaid, 0);
  assert.match((await A.recordMovement(fd({ type: "LOAN_IN", amount: 10, date: "2026-06-21", accountId: S.usd.id, loanId: loan.id }))).message!, /VND/);
});

test("posted movements are locked; staff edits of reviewed ones go back to draft; only the owner manages accounts", async () => {
  as.admin();
  await A.recordMovement(fd({ type: "CAPITAL_IN", amount: 100000000, date: "2026-06-17", accountId: S.vnd.id, description: "capital" }));
  const cap = await S.prisma.transaction.findFirstOrThrow({ where: { description: "capital" } });
  as.staff();
  assert.equal((await A.updateMovement(cap.id, fd({ type: "CAPITAL_IN", amount: 100000000, date: "2026-06-18", accountId: S.vnd.id, description: "capital" }))).success, true);
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: cap.id } })).status, "DRAFT");
  await assert.rejects(() => A.saveAccount(null, fd({ name: "Sneaky", type: "BANK", currency: "VND", openingBalance: 999999999 })), /Unauthorized/);
  as.admin();
  await L.reviewEntries([cap.id]);
  await L.postEntries([cap.id]);
  assert.match((await A.updateMovement(cap.id, fd({ type: "CAPITAL_IN", amount: 1, date: "2026-06-18", accountId: S.vnd.id }))).message!, /posted/);
});

test("part payment shows the unmatched difference; a fee only counts with evidence", async () => {
  as.admin();
  const inv = await invoice("E041", { direction: "RECEIVABLE", currency: "USD", amount: 1998.75 });
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 1972.75, paidDate: "2026-08-07", accountId: S.usd.id }))).success, true);
  assert.equal(await status(inv.id), "PARTIAL");
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 30, paidDate: "2026-08-07", accountId: S.usd.id }))).success, false); // more than the 26 still open

  await L.createTransaction(fd({ type: "EXPENSE", amount: 26, currency: "USD", date: "2026-08-07", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, description: "intermediary fee" }));
  const fee = await S.prisma.transaction.findFirstOrThrow({ where: { description: "intermediary fee" } });
  assert.match((await I.linkToInvoice(inv.id, fd({ kind: "FEE", transactionId: fee.id, amount: 26 }))).message!, /evidence/);
  await S.prisma.attachment.create({ data: { filePath: "advice.pdf", fileName: "advice.pdf", fileType: "application/pdf", transactionId: fee.id } });
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "FEE", transactionId: fee.id, amount: 26 }))).success, true);
  assert.equal(await status(inv.id), "PAID");
  // Linked payments block voiding and deleting until unlinked.
  assert.match((await I.voidInvoice(inv.id)).message!, /unlink/);
  const fees = await S.prisma.paymentAllocation.findFirstOrThrow({ where: { invoiceId: inv.id, kind: "FEE" } });
  await I.unlinkAllocation(fees.id);
  assert.equal(await status(inv.id), "PARTIAL");
});

test("one transfer can pay two invoices, but never more than it carried", async () => {
  as.admin();
  const a = await invoice("A", { direction: "RECEIVABLE", currency: "VND", amount: 3000000 });
  const b = await invoice("B", { direction: "RECEIVABLE", currency: "VND", amount: 2000000 });
  await L.createTransaction(fd({ type: "INCOME", amount: 5000000, currency: "VND", date: "2026-08-10", accountId: S.vnd.id, description: "combined" }));
  const t = await S.prisma.transaction.findFirstOrThrow({ where: { description: "combined" } });
  assert.equal((await I.linkToInvoice(a.id, fd({ kind: "PAYMENT", transactionId: t.id, amount: 3000000 }))).success, true);
  assert.match((await I.linkToInvoice(b.id, fd({ kind: "PAYMENT", transactionId: t.id, amount: 2500000 }))).message!, /left to allocate/);
  assert.equal((await I.linkToInvoice(b.id, fd({ kind: "PAYMENT", transactionId: t.id, amount: 2000000 }))).success, true);
  assert.deepEqual([await status(a.id), await status(b.id)], ["PAID", "PAID"]);
  // A receivable is settled by income, not an expense; currencies must match.
  const exp = await S.prisma.transaction.findFirstOrThrow({ where: { description: "intermediary fee" } });
  assert.equal((await I.linkToInvoice(a.id, fd({ kind: "PAYMENT", transactionId: exp.id, amount: 1 }))).success, false);
});

test("editing an invoice carries its details to unposted payments only", async () => {
  as.admin();
  const bill = await invoice("13", { direction: "PAYABLE", vendorId: S.vendor.id, currency: "VND", amount: 33306400 });
  await I.recordPayment(bill.id, fd({ amount: 33306400, paidDate: "2026-06-26", accountId: S.vnd.id }));
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "13" } });
  await L.postEntries([pay.id]);
  const res = await I.updateInvoice(bill.id, fd({ number: "13-FIXED", vendorId: S.vendor.id, issueDate: "2026-06-20", dueDate: "2026-06-30", currency: "VND", amount: 33306400 }));
  assert.equal(res.success, true, res.message);
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: pay.id } })).invoiceNumber, "13"); // posted: untouched
  as.staff();
  await assert.rejects(() => I.deleteInvoice(bill.id), /Unauthorized/);
});
