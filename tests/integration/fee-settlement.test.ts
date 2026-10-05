// Acceptance tests: settling an invoice when the bank withholds a fee from the
// receipt (Mark paid → "Fee deducted"). The owner's example: invoice
// US$1,998.75, settled 1,998.75, fee deducted 26, bank credit 1,972.75,
// outstanding 0 — and a separate US$5.50 bank charge that stays its own entry.
import { as, fd, seed, uploadDir } from "../helpers/setup";
import { before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as xlsx from "xlsx";

// The bank page is called directly to read what it would show (line status,
// what's left, candidates): its client component is a stub that receives the
// props, and its translations come from the app's own message files.
function BankClientStub() { return null; }
mock.module("@/components/bank/bank-client", { namedExports: { BankClient: BankClientStub } });
mock.module("next-intl/server", {
  namedExports: {
    getTranslations: async (namespace: string) => (await import("@/i18n/server")).translator("en", namespace as never),
  },
});

let I: typeof import("@/app/actions/invoices");
let L: typeof import("@/app/actions/ledger");
let B: typeof import("@/app/actions/bank");
let M: typeof import("@/lib/bank-match");
let $: typeof import("@/lib/money");
let bankPage: (typeof import("@/app/(dashboard)/bank/page"))["default"];
let S: Awaited<ReturnType<typeof seed>>;
let fees: { id: string; name: string };
before(async () => {
  I = await import("@/app/actions/invoices");
  L = await import("@/app/actions/ledger");
  B = await import("@/app/actions/bank");
  M = await import("@/lib/bank-match");
  $ = await import("@/lib/money");
  bankPage = (await import("@/app/(dashboard)/bank/page")).default;
  S = await seed();
  fees = await S.prisma.category.create({ data: { name: "Bank & FX Fees", type: "EXPENSE" } });
});

const PAID_ON = "2026-08-07";
const near = (actual: number, expected: number, msg?: string) =>
  assert.ok(Math.abs(actual - expected) <= 0.005, `${msg ?? "amount"}: expected ${expected}, got ${actual}`);

// A bank account of its own per test, so balances only show that test's entries.
const bankAccount = (name: string, currency = "USD") =>
  S.prisma.account.create({ data: { name, type: "BANK", currency, openingDate: new Date("2026-05-01T00:00:00.000Z") } });

async function receivable(number: string, amount = 1998.75, currency = "USD") {
  const res = await I.createInvoice(fd({ direction: "RECEIVABLE", number, issueDate: "2026-08-01", dueDate: "2026-08-31", currency, amount, categoryId: S.income.id }));
  assert.equal(res.success, true);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
}

// The Mark paid form: the full invoice settled at a manual rate unless told otherwise.
const settle = (invoiceId: string, values: Record<string, string | number | File | File[]>) =>
  I.recordPayment(invoiceId, fd({ amount: 1998.75, paidDate: PAID_ON, rateMode: "MANUAL", rate: 26000, ...values }));
const withFee = (accountId: string, extra: Record<string, string | number | File | File[]> = {}) =>
  ({ feeDeducted: 26, feeCategoryId: fees.id, accountId, ...extra });

// The receipt recorded for an invoice and the fee withheld from it (if any).
async function pairOf(number: string) {
  const receipt = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: number, type: "INCOME", reversalOfId: null } });
  const fee = await S.prisma.transaction.findUnique({ where: { deductedFromId: receipt.id } });
  return { receipt, fee };
}
const entriesOf = (number: string) => S.prisma.transaction.findMany({ where: { invoiceNumber: number } });
const invoiceOf = (id: string) => S.prisma.invoice.findUniqueOrThrow({ where: { id } });

// What's still open on an invoice, counting booked payments only (as the app does).
async function outstanding(id: string) {
  const inv = await S.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { allocations: $.BOOKED_ALLOCATIONS } });
  return $.settlement(inv.amount, inv.allocations).difference;
}

// The account's balance as the Accounts page computes it (booked entries only).
async function balanceOf(accountId: string) {
  const account = await S.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const txns = await S.prisma.transaction.findMany({ where: { accountId } });
  return $.computeBalances([account], txns.filter($.isBooked)).get(accountId)!;
}

// Profit & loss as the Reports page computes it: booked INCOME/EXPENSE, valued in VND.
async function pnl(where: object) {
  const txns = await S.prisma.transaction.findMany({ where: { type: { in: ["INCOME", "EXPENSE"] }, ...$.BOOKED, ...where }, include: { category: true } });
  const sum = (type: string) => txns.filter((t) => t.type === type).reduce((s, t) => s + $.toVnd(t), 0);
  const expenseCategories = [...new Set(txns.filter((t) => t.type === "EXPENSE").map((t) => t.category?.name))];
  return { income: sum("INCOME"), expense: sum("EXPENSE"), expenseCategories };
}

type Unit = { id: string; accountId: string; amount: number; label: string };
type Row = { id: string; amount: number; remaining: number; status: string; entries: { id: string; amount: number }[]; suggestion: Unit | null };
type Summary = { id: string; bankClosing: number | null; appBalance: number | null; open: number; notOnStatement: Unit[] };
async function bankView() {
  const page = (await bankPage({ searchParams: Promise.resolve({ view: "all" }) })) as { props: { children: unknown } };
  const client = [page.props.children].flat().find((c) => (c as { type?: unknown })?.type === BankClientStub) as
    { props: { lines: Row[]; entries: Unit[]; summaries: Summary[] } } | undefined;
  assert.ok(client, "the bank page renders its client component");
  return client.props;
}

// A synthetic MB-style USD statement: the net remittance credited, and the
// bank's own US$5.50 charge as a separate debit.
function usdStatement(memo: string) {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
    ["Loại tiền/Currency: USD"], ["Số dư đầu kỳ/ Opening Balance: 0"],
    ["Ngày giao dịch", "Ngày hạch toán", "Số bút toán", "Phát sinh nợ", "Phát sinh có", "Nội dung"],
    ["07/08/2026", "07/08/2026", "FT-REMIT", "", 1972.75, `ACME remittance ${memo}`],
    ["07/08/2026", "07/08/2026", "FT-CHARGE", 5.5, "", "Service charge"],
    ["Số dư cuối kỳ/ Closing Balance: 1,967.25"],
  ]), "Thông tin giao dịch");
  return new File([new Uint8Array(xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer)], `mb-usd-${memo}.xlsx`);
}

// The separate US$5.50 bank charge, entered like any other expense.
async function bankCharge(accountId: string, description: string) {
  const res = await L.createTransaction(fd({ type: "EXPENSE", amount: 5.5, currency: "USD", date: PAID_ON, accountId, rateMode: "MANUAL", rate: 26000, categoryId: fees.id, description }));
  assert.equal(res.success, true, res.message);
  return S.prisma.transaction.findFirstOrThrow({ where: { description } });
}

test("owner's example: US$1,998.75 settled with US$26 deducted — invoice paid, fee booked, account +1,972.75", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (example)");
  const inv = await receivable("E-1998");
  const res = await settle(inv.id, withFee(acct.id, { requestId: "req-example" }));
  assert.equal(res.success, true, res.message);

  // Client outstanding: 0.
  const after = await invoiceOf(inv.id);
  assert.equal(after.status, "PAID");
  assert.equal(after.paidDate?.toISOString().slice(0, 10), PAID_ON);
  near(await outstanding(inv.id), 0, "outstanding");

  // Income of the full amount settled; the fee as an expense in the chosen category, same account.
  const { receipt, fee } = await pairOf("E-1998");
  assert.ok(fee, "a fee entry was booked");
  assert.deepEqual([receipt.type, receipt.amount, receipt.currency, receipt.accountId, receipt.categoryId, receipt.status], ["INCOME", 1998.75, "USD", acct.id, S.income.id, "REVIEWED"]);
  assert.deepEqual([fee.type, fee.amount, fee.currency, fee.accountId, fee.categoryId, fee.status], ["EXPENSE", 26, "USD", acct.id, fees.id, "REVIEWED"]);
  assert.equal(fee.deductedFromId, receipt.id);
  assert.equal(await S.prisma.transaction.count({ where: { accountId: acct.id } }), 2, "no other movement in the account");

  // Only the receipt settles the invoice, for the full amount; the fee isn't allocated as well.
  const allocations = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
  assert.deepEqual(allocations.map((a) => [a.transactionId, a.kind, a.amount]), [[receipt.id, "PAYMENT", 1998.75]]);

  // The bank account moves by the net the bank credited.
  near($.accountDelta(receipt, "USD") + $.accountDelta(fee, "USD"), 1972.75, "pair's net movement");
  near(await balanceOf(acct.id), 1972.75, "USD account balance");

  // P&L: income 1,998.75 and the fee in expenses (both at the booked 26,000).
  const p = await pnl({ invoiceNumber: "E-1998" });
  near(p.income, 1998.75 * 26000, "P&L income (VND)");
  near(p.expense, 26 * 26000, "P&L expense (VND)");
  assert.deepEqual(p.expenseCategories, ["Bank & FX Fees"]);
  near(p.income - p.expense, 1972.75 * 26000, "P&L net (VND)");
});

test("the separate US$5.50 bank charge stays its own entry and is not folded into the US$26 deduction", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (charge)");
  const inv = await receivable("E-CHARGE");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const charge = await bankCharge(acct.id, "MB USD service charge Aug");

  const { receipt, fee } = await pairOf("E-CHARGE");
  assert.equal(fee!.amount, 26, "the deducted fee is still 26");
  assert.equal(charge.amount, 5.5);
  assert.equal(charge.deductedFromId, null, "the charge isn't withheld from the receipt");
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: receipt.id }, include: { deductedFee: true } })).deductedFee!.id, fee!.id);
  // The invoice is untouched by the charge: still settled once, by the receipt alone.
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 1);
  assert.equal(await S.prisma.paymentAllocation.count({ where: { transactionId: charge.id } }), 0);
  // Account: +1,972.75 − 5.50; the fees category carries 26 and 5.50 as two entries.
  near(await balanceOf(acct.id), 1967.25, "USD balance after the separate charge");
  const feeEntries = await S.prisma.transaction.findMany({ where: { accountId: acct.id, categoryId: fees.id }, orderBy: { amount: "asc" } });
  assert.deepEqual(feeEntries.map((t) => t.amount), [5.5, 26]);
});

test("the separate US$5.50 charge can't also be linked as a fee on the invoice the US$26 deduction already settled", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (no double fee)");
  const inv = await receivable("E-NODOUBLE");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const charge = await bankCharge(acct.id, "MB USD service charge (evidenced)");
  await S.prisma.attachment.create({ data: { filePath: "charge-advice.pdf", fileName: "charge-advice.pdf", fileType: "application/pdf", transactionId: charge.id } });

  const res = await I.linkToInvoice(inv.id, fd({ kind: "FEE", transactionId: charge.id, amount: 5.5 }));
  assert.equal(res.success, false, "an invoice settled in full shouldn't take another fee allocation");
  near(await outstanding(inv.id), 0, "outstanding stays 0, not overpaid");
});

test("bank reconciliation: the receipt and its fee match the +1,972.75 credit exactly; the 5.50 line matches the separate charge", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (reconcile)");
  const inv = await receivable("E-REC");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const charge = await bankCharge(acct.id, "MB USD service charge (reconcile)");
  const { receipt, fee } = await pairOf("E-REC");

  const preview = await B.previewStatement(fd({ file: usdStatement("E-REC"), accountId: acct.id }));
  assert.equal(preview.success, true, preview.success ? undefined : preview.message);
  if (preview.success) {
    near(preview.preview.inflows, 1972.75, "statement inflows");
    near(preview.preview.outflows, 5.5, "statement outflows");
  }
  const imported = await B.importStatement(fd({ file: usdStatement("E-REC"), accountId: acct.id, opening: 0, closing: 1967.25 }));
  assert.deepEqual([imported.success, imported.added], [true, 2], imported.message);
  const credit = await S.prisma.bankLine.findFirstOrThrow({ where: { accountId: acct.id, amount: 1972.75 } });
  const debit = await S.prisma.bankLine.findFirstOrThrow({ where: { accountId: acct.id, amount: -5.5 } });

  // Before matching: the pair is offered as ONE candidate at the net, and suggested for the credit.
  let view = await bankView();
  const unit = view.entries.find((e) => e.id === receipt.id);
  assert.ok(unit, "the receipt is offered for matching");
  near(unit.amount, 1972.75, "candidate amount (receipt net of its fee)");
  assert.match(unit.label, /fee/i);
  assert.equal(view.entries.some((e) => e.id === fee!.id), false, "the withheld fee isn't offered on its own");
  assert.equal(view.lines.find((l) => l.id === credit.id)!.suggestion?.id, receipt.id);
  assert.equal(view.lines.find((l) => l.id === debit.id)!.suggestion?.id, charge.id);

  // The receipt alone would exceed the credit; the fee alone runs the wrong way; the fee can't stand in for the 5.50 charge.
  assert.match((await M.bankLinkProblem(credit.id, [receipt]))!, /more than the bank line/);
  assert.match((await M.bankLinkProblem(credit.id, [fee!]))!, /money in; this entry is money out/);
  assert.ok(await M.bankLinkProblem(debit.id, [fee!]), "the 26 fee doesn't fit the 5.50 charge line");
  assert.equal(await M.bankLinkProblem(credit.id, [receipt, fee!]), null);
  // Matching the fee (with its receipt) to the 5.50 debit is refused.
  assert.equal((await B.matchLine(debit.id, [fee!.id])).success, false);

  // Matching only the receipt brings its fee along — the line is fully explained.
  const before = await S.prisma.transaction.count();
  assert.equal((await B.matchLine(credit.id, [receipt.id])).success, true);
  const onLine = await S.prisma.transaction.findMany({ where: { bankLineId: credit.id } });
  assert.deepEqual(onLine.map((t) => t.id).sort(), [receipt.id, fee!.id].sort());
  assert.equal((await B.matchLine(debit.id, [charge.id])).success, true);
  assert.equal(await S.prisma.transaction.count(), before, "reconciling creates no extra bank movement");

  view = await bankView();
  const creditRow = view.lines.find((l) => l.id === credit.id)!;
  assert.equal(creditRow.status, "MATCHED");
  assert.equal(creditRow.remaining, 0);
  near(creditRow.entries.reduce((s, e) => s + e.amount, 0), 1972.75, "entries on the credit line");
  const debitRow = view.lines.find((l) => l.id === debit.id)!;
  assert.deepEqual([debitRow.status, debitRow.remaining, debitRow.entries.map((e) => e.id)], ["MATCHED", 0, [charge.id]]);
  const summary = view.summaries.find((s) => s.id === acct.id)!;
  near(summary.appBalance!, 1967.25, "app balance on the statement date");
  assert.equal(summary.bankClosing, 1967.25);
  assert.deepEqual([summary.open, summary.notOnStatement.length], [0, 0]);
  const matchLog = await S.prisma.changeLog.findMany({ where: { action: "MATCH", newValue: credit.id } });
  assert.deepEqual(matchLog.map((c) => c.entityId).sort(), [receipt.id, fee!.id].sort());

  // Unmatching either one takes both off the line.
  assert.equal((await B.unmatchEntry(fee!.id)).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { bankLineId: credit.id } }), 0);
  assert.equal((await bankView()).lines.find((l) => l.id === credit.id)!.status, "UNMATCHED");
  // …and matching by the fee's id brings the receipt along.
  assert.equal((await B.matchLine(credit.id, [fee!.id])).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { bankLineId: credit.id } }), 2);
  assert.equal((await B.unmatchEntry(receipt.id)).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { bankLineId: credit.id } }), 0);
  // The separate charge stays matched throughout.
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: charge.id } })).bankLineId, debit.id);
});

test("a fee withheld from a bank-matched receipt can't be deleted out from under the line it nets to", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (matched fee delete)");
  const inv = await receivable("E-MDEL");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  await bankCharge(acct.id, "MB USD service charge (matched fee delete)");
  const { receipt, fee } = await pairOf("E-MDEL");
  assert.equal((await B.importStatement(fd({ file: usdStatement("E-MDEL"), accountId: acct.id, opening: 0, closing: 1967.25 }))).success, true);
  const credit = await S.prisma.bankLine.findFirstOrThrow({ where: { accountId: acct.id, amount: 1972.75 } });
  assert.equal((await B.matchLine(credit.id, [receipt.id])).success, true);

  try { await L.deleteTransaction(fee!.id); } catch { /* refusing is fine */ }
  // Either the fee stays, or the receipt left the line with it — never 1,998.75 sitting on a 1,972.75 credit.
  const onLine = await S.prisma.transaction.findMany({ where: { bankLineId: credit.id } });
  const explained = onLine.reduce((s, t) => s + $.accountDelta(t, "USD"), 0);
  assert.ok(explained <= 1972.75 + 0.005, `entries on the 1,972.75 credit add up to ${explained}`);
});

test("partial payment with a fee clears only the amount settled", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (partial)");
  const inv = await receivable("E-PART");
  assert.equal((await settle(inv.id, withFee(acct.id, { amount: 1000, feeDeducted: 10 }))).success, true);
  let now = await invoiceOf(inv.id);
  assert.equal(now.status, "PARTIAL");
  near(await outstanding(inv.id), 998.75, "open after the first part");
  near(await balanceOf(acct.id), 990, "account after the first part");
  const alloc = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
  assert.deepEqual(alloc.map((a) => [a.kind, a.amount]), [["PAYMENT", 1000]]);

  // More than what's still open is refused, fee or not.
  const over = await settle(inv.id, withFee(acct.id, { amount: 1000, feeDeducted: 16 }));
  assert.equal(over.success, false);
  assert.match(over.message!, /more than what's still open/);

  assert.equal((await settle(inv.id, withFee(acct.id, { amount: 998.75, feeDeducted: 16 }))).success, true);
  now = await invoiceOf(inv.id);
  assert.equal(now.status, "PAID");
  near(await outstanding(inv.id), 0, "open after the second part");
  near(await balanceOf(acct.id), 990 + 982.75, "account after both parts");
  const feeTotal = (await S.prisma.transaction.findMany({ where: { accountId: acct.id, deductedFromId: { not: null } } })).reduce((s, t) => s + t.amount, 0);
  near(feeTotal, 26, "fees across both parts");
  assert.match((await settle(inv.id, withFee(acct.id, { amount: 1 }))).message!, /Nothing left to settle/);
});

test("idempotency: the same save sent twice records once, files included", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (retry)");
  const inv = await receivable("E-RETRY");
  const form = () => withFee(acct.id, { requestId: "req-retry-1", files: new File([new Uint8Array(8)], "remittance.pdf", { type: "application/pdf" }) });
  assert.equal((await settle(inv.id, form())).success, true);
  assert.equal((await settle(inv.id, form())).success, true, "a retry is reported as saved");
  assert.equal((await entriesOf("E-RETRY")).length, 2, "one receipt and one fee");
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 1);
  assert.equal(await S.prisma.changeLog.count({ where: { entity: "Invoice", entityId: inv.id, action: "PAYMENT" } }), 1);
  const { receipt } = await pairOf("E-RETRY");
  assert.equal(await S.prisma.attachment.count({ where: { transactionId: receipt.id } }), 1, "the evidence is attached once");
  near(await balanceOf(acct.id), 1972.75, "account moved once");
});

test("idempotency: a partial save sent twice at the same time records once", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (double click partial)");
  const inv = await receivable("E-DBL-PART");
  const results = await Promise.all([1, 2].map(() => settle(inv.id, withFee(acct.id, { amount: 500, feeDeducted: 5, requestId: "req-dbl-part" }))));
  assert.deepEqual(results.map((r) => r.success), [true, true]);
  assert.equal((await entriesOf("E-DBL-PART")).length, 2);
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 1);
  near(await outstanding(inv.id), 1498.75, "open after one part");
});

test("idempotency: the full amount sent twice at the same time records once and both report it saved", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (double click full)");
  const inv = await receivable("E-DBL-FULL");
  const results = await Promise.allSettled([1, 2].map(() => settle(inv.id, withFee(acct.id, { requestId: "req-dbl-full" }))));
  // Recorded once…
  assert.equal((await entriesOf("E-DBL-FULL")).length, 2);
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 1);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
  // …and the duplicate of a save that went through isn't reported to the user as a failure.
  const outcome = results.map((r) => (r.status === "fulfilled" ? (r.value.success ? "saved" : `refused: ${r.value.message}`) : `threw: ${r.reason}`));
  assert.deepEqual(outcome, ["saved", "saved"]);
});

test("two different saves for the full open amount at the same time can't both settle it", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (race)");
  const inv = await receivable("E-RACE");
  const results = await Promise.allSettled([
    settle(inv.id, withFee(acct.id, { requestId: "req-race-a" })),
    settle(inv.id, withFee(acct.id, { requestId: "req-race-b" })),
  ]);
  const saved = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  assert.equal(saved, 1, `exactly one save goes through (${JSON.stringify(results.map((r) => (r.status === "fulfilled" ? r.value : String(r.reason))))})`);
  assert.equal((await entriesOf("E-RACE")).length, 2, "one receipt and one fee");
  const alloc = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
  near(alloc.reduce((s, a) => s + a.amount, 0), 1998.75, "settled in total");
  near(await balanceOf(acct.id), 1972.75, "account moved once");
  // The loser gets a clear refusal rather than an error.
  const loser = results.find((r) => !(r.status === "fulfilled" && r.value.success));
  assert.equal(loser?.status, "fulfilled", `the second save is refused cleanly (${loser?.status === "rejected" ? String(loser.reason) : ""})`);
});

test("audit trail: the settlement (date, account, fee, net, evidence) and the fee link are recorded; evidence attaches to the receipt", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (audit)");
  const inv = await receivable("E-AUDIT");
  const files = [
    new File([new Uint8Array(16)], "bank-advice.pdf", { type: "application/pdf" }),
    new File([new Uint8Array(12)], "client-remittance.png", { type: "image/png" }),
  ];
  assert.equal((await settle(inv.id, withFee(acct.id, { files, requestId: "req-audit" }))).success, true);
  const { receipt, fee } = await pairOf("E-AUDIT");

  const row = await S.prisma.changeLog.findFirstOrThrow({ where: { entity: "Invoice", entityId: inv.id, action: "PAYMENT", field: "settlement" } });
  assert.equal(row.user, "owner");
  for (const part of ["settled 1998.75 USD", "fee deducted 26", `net 1972.75 into ${acct.name}`, `paid ${PAID_ON}`, `entry ${receipt.id}`, "evidence: bank-advice.pdf, client-remittance.png"]) {
    assert.ok(row.newValue!.includes(part), `settlement row has "${part}": ${row.newValue}`);
  }
  const link = await S.prisma.changeLog.findFirstOrThrow({ where: { entityId: receipt.id, action: "LINK", field: "deductedFee" } });
  assert.equal(link.newValue, `26 USD · ${fee!.id}`);
  assert.equal(await S.prisma.changeLog.count({ where: { entityId: receipt.id, action: "LINK", field: "invoice" } }), 1);
  assert.equal(await S.prisma.changeLog.count({ where: { entityId: receipt.id, action: "CREATE" } }), 1);
  assert.equal(await S.prisma.changeLog.count({ where: { entityId: fee!.id, action: "CREATE" } }), 1);

  // The source files are kept, on the receipt (not on the fee), under their original names.
  const atts = await S.prisma.attachment.findMany({ where: { transactionId: receipt.id }, orderBy: { fileName: "asc" } });
  assert.deepEqual(atts.map((a) => a.fileName), ["bank-advice.pdf", "client-remittance.png"]);
  for (const a of atts) assert.ok(existsSync(join(uploadDir!, a.filePath)), `${a.fileName} is stored`);
  assert.equal(await S.prisma.attachment.count({ where: { transactionId: fee!.id } }), 0);
});

test("no fee entered: the payment is recorded exactly as before — one entry, a shortfall stays open", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (no fee)");
  const inv = await receivable("E-NOFEE");
  // The actual receipt alone: the 26 difference stays open, it's never assumed to be a fee.
  assert.equal((await settle(inv.id, { amount: 1972.75, accountId: acct.id })).success, true);
  const rows = await entriesOf("E-NOFEE");
  assert.deepEqual(rows.map((t) => [t.type, t.amount, t.deductedFromId]), [["INCOME", 1972.75, null]]);
  assert.equal((await invoiceOf(inv.id)).status, "PARTIAL");
  near(await outstanding(inv.id), 26, "the shortfall stays open");
  near(await balanceOf(acct.id), 1972.75, "account");
  assert.match((await S.prisma.changeLog.findFirstOrThrow({ where: { entity: "Invoice", entityId: inv.id, action: "PAYMENT" } })).newValue!, /fee deducted 0 · net 1972\.75/);

  // An empty or zero fee field is the same as no fee — no category needed, no fee entry.
  for (const [number, feeDeducted] of [["E-NOFEE-EMPTY", ""], ["E-NOFEE-ZERO", "0"]]) {
    const other = await receivable(number);
    assert.equal((await settle(other.id, { accountId: acct.id, feeDeducted })).success, true, number);
    assert.deepEqual((await entriesOf(number)).map((t) => [t.type, t.amount]), [["INCOME", 1998.75]], number);
    assert.equal((await invoiceOf(other.id)).status, "PAID", number);
  }

  // The bank's VND figure into a VND account, as before: the entry carries it, rate derived.
  const vndAcct = await bankAccount("MB VND (no fee)", "VND");
  const vndInv = await receivable("E-NOFEE-VND");
  assert.equal((await I.recordPayment(vndInv.id, fd({ amount: 1998.75, paidDate: PAID_ON, accountId: vndAcct.id, rateMode: "BANK", vndAmount: 51000000 }))).success, true);
  const [vndEntry] = await entriesOf("E-NOFEE-VND");
  assert.deepEqual([vndEntry.vndAmount, vndEntry.rateSource], [51000000, "BANK"]);
  near(vndEntry.exchangeRate, 51000000 / 1998.75, "derived rate");
  assert.equal(await balanceOf(vndAcct.id), 51000000);

  // A bill paid, as before: one expense.
  const bill = await I.createInvoice(fd({ direction: "PAYABLE", number: "B-NOFEE", vendorId: S.vendor.id, issueDate: "2026-08-01", dueDate: "2026-08-31", currency: "VND", amount: 3000000 }));
  assert.equal(bill.success, true);
  const billInv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "B-NOFEE" } });
  assert.equal((await I.recordPayment(billInv.id, fd({ amount: 3000000, paidDate: PAID_ON, accountId: S.vnd.id }))).success, true);
  assert.deepEqual((await entriesOf("B-NOFEE")).map((t) => [t.type, t.amount, t.vendorId]), [["EXPENSE", 3000000, S.vendor.id]]);
  assert.equal((await invoiceOf(billInv.id)).status, "PAID");
});

test("validation: fee ≥ amount, fee on a bill, fee without an expense category, negative fee — nothing is recorded", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (validation)");
  const inv = await receivable("E-VALID");
  const refused = async (values: Record<string, string | number>, pattern: RegExp) => {
    const res = await settle(inv.id, { accountId: acct.id, requestId: "req-valid", ...values });
    assert.equal(res.success, false, `refused: ${JSON.stringify(values)}`);
    assert.match(res.message!, pattern);
  };
  await refused({ feeDeducted: 1998.75, feeCategoryId: fees.id }, /less than the amount settled/);
  await refused({ feeDeducted: 2500, feeCategoryId: fees.id }, /less than the amount settled/);
  await refused({ feeDeducted: 26 }, /expense category/);
  await refused({ feeDeducted: 26, feeCategoryId: S.income.id }, /expense category/);
  await refused({ feeDeducted: 26, feeCategoryId: "no-such-category" }, /expense category/);
  await refused({ feeDeducted: -5, feeCategoryId: fees.id }, /0 or more/);
  await refused({ feeDeducted: "abc", feeCategoryId: fees.id }, /0 or more/);

  const bill = await I.createInvoice(fd({ direction: "PAYABLE", number: "B-VALID", vendorId: S.vendor.id, issueDate: "2026-08-01", dueDate: "2026-08-31", currency: "USD", amount: 500 }));
  assert.equal(bill.success, true);
  const billInv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "B-VALID" } });
  const onBill = await I.recordPayment(billInv.id, fd({ amount: 500, paidDate: PAID_ON, accountId: acct.id, rateMode: "MANUAL", rate: 26000, feeDeducted: 5, feeCategoryId: fees.id }));
  assert.equal(onBill.success, false);
  assert.match(onBill.message!, /only be entered for money received/);

  assert.equal((await entriesOf("E-VALID")).length + (await entriesOf("B-VALID")).length, 0, "nothing recorded");
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: { in: [inv.id, billInv.id] } } }), 0);
  assert.equal(await S.prisma.changeLog.count({ where: { entity: "Invoice", entityId: { in: [inv.id, billInv.id] } } }), 0);
  assert.deepEqual([(await invoiceOf(inv.id)).status, (await invoiceOf(billInv.id)).status], ["OPEN", "OPEN"]);

  // Corrected and sent again with the same form id, it goes through.
  assert.equal((await settle(inv.id, withFee(acct.id, { requestId: "req-valid" }))).success, true);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
});

test("staff: both entries are drafts; approving the receipt approves the fee; posting either posts both", async () => {
  as.staff();
  const acct = await bankAccount("VCB USD (staff)");
  const inv = await receivable("E-STAFF");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  let { receipt, fee } = await pairOf("E-STAFF");
  assert.deepEqual([receipt.status, fee!.status], ["DRAFT", "DRAFT"]);
  assert.equal((await invoiceOf(inv.id)).status, "OPEN", "a draft doesn't settle the invoice yet");
  assert.equal(await balanceOf(acct.id), 0, "drafts aren't in the balance yet");
  await assert.rejects(() => L.reviewEntries([receipt.id]), /Unauthorized/);

  as.admin();
  assert.equal((await L.reviewEntries([receipt.id])).count, 2);
  ({ receipt, fee } = await pairOf("E-STAFF"));
  assert.deepEqual([receipt.status, fee!.status], ["REVIEWED", "REVIEWED"]);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
  near(await balanceOf(acct.id), 1972.75, "balance once reviewed");

  assert.equal((await L.postEntries([fee!.id])).count, 2);
  ({ receipt, fee } = await pairOf("E-STAFF"));
  assert.deepEqual([receipt.status, fee!.status], ["POSTED", "POSTED"]);
});

test("reversing a posted receipt reverses its fee too, the reversals stay paired, and the invoice reopens", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (reverse)");
  const inv = await receivable("E-REV");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const { receipt, fee } = await pairOf("E-REV");
  await L.postEntries([receipt.id]);

  assert.equal((await L.reverseEntry(receipt.id, "client payment recalled")).success, true);
  const revReceipt = await S.prisma.transaction.findFirstOrThrow({ where: { reversalOfId: receipt.id } });
  const revFee = await S.prisma.transaction.findFirstOrThrow({ where: { reversalOfId: fee!.id } });
  assert.deepEqual([revReceipt.type, revReceipt.amount, revReceipt.status], ["INCOME", -1998.75, "POSTED"]);
  assert.deepEqual([revFee.type, revFee.amount, revFee.status, revFee.categoryId], ["EXPENSE", -26, "POSTED", fees.id]);
  assert.equal(revFee.deductedFromId, revReceipt.id, "the fee's reversal is paired with the receipt's reversal");
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: fee!.id } })).deductedFromId, receipt.id, "the original pair is kept");

  assert.equal((await invoiceOf(inv.id)).status, "OPEN");
  near(await outstanding(inv.id), 1998.75, "open again");
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);
  near(await balanceOf(acct.id), 0, "the account nets back to zero");
  near((await pnl({ invoiceNumber: "E-REV" })).income, 0, "P&L income nets to zero");
  assert.equal(await S.prisma.changeLog.count({ where: { action: "REVERSE", entityId: { in: [receipt.id, fee!.id] } } }), 2);
  assert.equal((await L.reverseEntry(fee!.id, "again")).success, false, "already reversed");

  // Reversing by the fee's id reverses the receipt as well.
  const inv2 = await receivable("E-REV-FEE");
  assert.equal((await settle(inv2.id, withFee(acct.id))).success, true);
  const pair2 = await pairOf("E-REV-FEE");
  await L.postEntries([pair2.receipt.id]);
  assert.equal((await L.reverseEntry(pair2.fee!.id, "wrong account")).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { reversalOfId: { in: [pair2.receipt.id, pair2.fee!.id] } } }), 2);
  assert.equal((await invoiceOf(inv2.id)).status, "OPEN");

  // The reopened invoice can be settled again.
  assert.equal((await settle(inv.id, withFee(acct.id, { requestId: "req-rev-again" }))).success, true);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
});

test("deleting a receipt deletes its fee; deleting the fee alone keeps the receipt", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (delete)");
  const inv = await receivable("E-DEL");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const { receipt, fee } = await pairOf("E-DEL");
  as.staff();
  await assert.rejects(() => L.deleteTransaction(receipt.id), /Unauthorized/);
  as.admin();
  await L.deleteTransaction(receipt.id);
  assert.equal(await S.prisma.transaction.count({ where: { id: { in: [receipt.id, fee!.id] } } }), 0);
  assert.equal((await invoiceOf(inv.id)).status, "OPEN");
  assert.equal(await balanceOf(acct.id), 0);
  assert.equal(await S.prisma.changeLog.count({ where: { action: "DELETE", entityId: { in: [receipt.id, fee!.id] } } }), 2);

  const inv2 = await receivable("E-DEL-FEE");
  assert.equal((await settle(inv2.id, withFee(acct.id))).success, true);
  const pair2 = await pairOf("E-DEL-FEE");
  await L.deleteTransaction(pair2.fee!.id);
  assert.equal(await S.prisma.transaction.count({ where: { id: pair2.fee!.id } }), 0);
  const kept = await S.prisma.transaction.findUniqueOrThrow({ where: { id: pair2.receipt.id }, include: { deductedFee: true } });
  assert.deepEqual([kept.amount, kept.deductedFee], [1998.75, null]);
  assert.equal((await invoiceOf(inv2.id)).status, "PAID", "the invoice is still settled by the receipt");
  near(await balanceOf(acct.id), 1998.75, "the account now shows the gross receipt");
});

test("a receipt and its fee can't be moved to another account, currency or type by editing", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (edit A)");
  const other = await bankAccount("VCB USD (edit B)");
  const inv = await receivable("E-EDIT");
  assert.equal((await settle(inv.id, withFee(acct.id))).success, true);
  const { receipt, fee } = await pairOf("E-EDIT");
  const editReceipt = (extra: Record<string, string | number>) => L.editTransaction(receipt.id, fd({
    type: "INCOME", amount: 1998.75, currency: "USD", date: PAID_ON, accountId: acct.id, categoryId: S.income.id,
    invoiceNumber: "E-EDIT", description: receipt.description!, ...extra,
  }));
  const editFee = (extra: Record<string, string | number>) => L.editTransaction(fee!.id, fd({
    type: "EXPENSE", amount: 26, currency: "USD", date: PAID_ON, accountId: acct.id, categoryId: fees.id,
    invoiceNumber: "E-EDIT", description: fee!.description!, ...extra,
  }));

  for (const [label, res] of [
    ["receipt to another account", await editReceipt({ accountId: other.id })],
    ["receipt to VND", await editReceipt({ currency: "VND", accountId: S.vnd.id, amount: 51967500 })],
    ["fee to another account", await editFee({ accountId: other.id })],
    ["fee to VND", await editFee({ currency: "VND", accountId: S.vnd.id, amount: 676000 })],
    ["fee to income", await editFee({ type: "INCOME", categoryId: S.income.id })],
  ] as const) {
    assert.equal(res.success, false, `${label} is refused`);
  }
  assert.match((await editFee({ accountId: other.id })).message!, /same account, currency, type, date and project/);

  // An ordinary edit (the note) is fine and keeps the pair, account and booked rate.
  assert.equal((await editFee({ description: "MB withheld intermediary fee — see bank advice" })).success, true);
  const [r, f] = await Promise.all([receipt.id, fee!.id].map((id) => S.prisma.transaction.findUniqueOrThrow({ where: { id } })));
  assert.deepEqual([r.accountId, r.currency, f.accountId, f.currency, f.deductedFromId, f.exchangeRate], [acct.id, "USD", acct.id, "USD", receipt.id, 26000]);
  near(await balanceOf(acct.id), 1972.75, "account unchanged");
  near(await balanceOf(other.id), 0, "nothing moved to the other account");
});

test("BANK rate into a VND account for a USD invoice: the receipt and fee VND values net exactly to the VND credited", async () => {
  as.admin();
  const vndAcct = await bankAccount("MB VND (bank rate)", "VND");
  const inv = await receivable("E-VNDBANK");
  const credited = 51300000; // what the bank actually credited, for the net US$1,972.75
  const res = await I.recordPayment(inv.id, fd({ amount: 1998.75, paidDate: PAID_ON, accountId: vndAcct.id, rateMode: "BANK", vndAmount: credited, feeDeducted: 26, feeCategoryId: fees.id }));
  assert.equal(res.success, true, res.message);
  const { receipt, fee } = await pairOf("E-VNDBANK");
  const rate = credited / 1972.75;

  assert.deepEqual([receipt.currency, receipt.amount, receipt.rateSource, fee!.currency, fee!.amount, fee!.rateSource], ["USD", 1998.75, "BANK", "USD", 26, "BANK"]);
  near(receipt.exchangeRate, rate, "receipt rate");
  near(fee!.exchangeRate, rate, "fee rate");
  assert.equal(receipt.vndAmount, Math.round(1998.75 * rate));
  assert.ok(Math.abs(fee!.vndAmount! - 26 * rate) <= 1, `fee VND ${fee!.vndAmount} ≈ 26 × ${rate}`);
  assert.equal(receipt.vndAmount! - fee!.vndAmount!, credited, "receipt − fee = VND credited, to the đồng");
  assert.equal($.accountDelta(receipt, "VND") + $.accountDelta(fee!, "VND"), credited);
  assert.equal(await balanceOf(vndAcct.id), credited);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
  const p = await pnl({ invoiceNumber: "E-VNDBANK" });
  assert.deepEqual([p.income, p.expense, p.income - p.expense], [receipt.vndAmount, fee!.vndAmount, credited]);
});

test("an unpaid invoice short-paid before this change stays as it was until the user re-records it with the fee", async () => {
  as.admin();
  const acct = await bankAccount("VCB USD (legacy)");
  const inv = await receivable("E-LEGACY");
  // Recorded the old way: the actual receipt only, the 26 left open.
  assert.equal((await settle(inv.id, { amount: 1972.75, accountId: acct.id })).success, true);
  const legacy = (await entriesOf("E-LEGACY"))[0];
  // Other settlements with fees don't touch it.
  const other = await receivable("E-LEGACY-OTHER");
  assert.equal((await settle(other.id, withFee(acct.id))).success, true);
  assert.equal((await invoiceOf(inv.id)).status, "PARTIAL");
  assert.deepEqual((await entriesOf("E-LEGACY")).map((t) => [t.id, t.amount, t.vndAmount, t.exchangeRate]), [[legacy.id, 1972.75, legacy.vndAmount, legacy.exchangeRate]]);
  // A fee can't be entered on the 26 alone — it must be less than the amount settled.
  assert.equal((await settle(inv.id, withFee(acct.id, { amount: 26 }))).success, false);

  // After review, the user removes the short entry and records the settlement with the fee.
  await L.deleteTransaction(legacy.id);
  assert.equal((await settle(inv.id, withFee(acct.id, { requestId: "req-legacy-fix" }))).success, true);
  assert.equal((await invoiceOf(inv.id)).status, "PAID");
  near(await outstanding(inv.id), 0, "outstanding after the correction");
  near(await balanceOf(acct.id), 1972.75 * 2, "both invoices' net receipts");
});
