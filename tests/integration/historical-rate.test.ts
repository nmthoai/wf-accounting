// Booked exchange rates: an ordinary edit never re-prices a recorded
// foreign-currency entry; only an explicit, admin-only revaluation (with a
// reason, recorded in the history) changes its VND value. New entries use the
// current default rate.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let L: typeof import("@/app/actions/ledger");
let A: typeof import("@/app/actions/accounts");
let I: typeof import("@/app/actions/invoices");
let ST: typeof import("@/app/actions/settings");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  L = await import("@/app/actions/ledger");
  A = await import("@/app/actions/accounts");
  I = await import("@/app/actions/invoices");
  ST = await import("@/app/actions/settings");
  S = await seed();
});

type Values = Record<string, string | number | File | undefined>;

// The company default USD rate, changed the way Settings changes it.
async function setDefault(rate: number) {
  as.admin();
  const res = await ST.updateExchangeRate(fd({ rate }));
  assert.equal(res.success, true, res.message);
}
// VND value as every report reads it (exact settled VND when known, else amount × rate).
const vndOf = (t: { amount: number; exchangeRate: number; vndAmount: number | null }) => Math.round(t.vndAmount ?? t.amount * t.exchangeRate);
const get = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });
const find = (description: string) => S.prisma.transaction.findFirstOrThrow({ where: { description } });
const history = (id: string) => S.prisma.changeLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
// UPDATE rows that touched the money of an entry.
const moneyEdits = async (id: string) =>
  (await history(id)).filter((h) => h.action === "UPDATE" && ["amount", "currency", "exchangeRate", "vndAmount", "rateSource"].includes(h.field ?? ""));

// Everything the income/expense entry form sends (entry-form.tsx handleSubmit),
// for a US$1,100 expense in the USD account.
const entryForm = (description: string, extra: Values = {}) => fd({
  type: "EXPENSE", amount: 1100, currency: "USD", date: "2026-09-15", accountId: S.usd.id,
  categoryId: S.expense.id, projectId: "", vendorId: "", rateMode: "DEFAULT",
  docStatus: "PENDING", purposeStatus: "PENDING", citStatus: "PENDING", vatStatus: "PENDING",
  invoiceNumber: "", description, reviewNote: "", ...extra,
});
async function create(description: string, extra: Values = {}) {
  const res = await L.createTransaction(entryForm(description, extra));
  assert.equal(res.success, true, res.message);
  return find(description);
}
async function edit(id: string, description: string, extra: Values = {}) {
  const res = await L.editTransaction(id, entryForm(description, extra));
  assert.equal(res.success, true, res.message);
  return get(id);
}
// What a client may send for the rate on an edit: the old form always sent its
// rate mode (DEFAULT for USD), and a crafted request can send anything.
const RATE_FIELDS: [string, Values][] = [
  ["rateMode DEFAULT", { rateMode: "DEFAULT" }],
  ["rateMode MANUAL 26,000", { rateMode: "MANUAL", rate: 26000 }],
  ["rateMode BANK 28,600,000", { rateMode: "BANK", vndAmount: 28600000 }],
];
const revalue = (id: string, values: Values) => L.revalueEntry(id, fd(values));

test("owner's acceptance test: US$1,100 × 26,400 stays 29,040,000 VND after the default becomes 26,000 and only the note is edited; only an explicit revaluation makes it 28,600,000", async () => {
  await setDefault(26400);
  const e = await create("Acceptance US$1,100", { rateMode: "DEFAULT" });
  assert.deepEqual([e.amount, e.currency, e.exchangeRate, e.rateSource, e.vndAmount], [1100, "USD", 26400, "DEFAULT", null]);
  assert.equal(vndOf(e), 29040000);

  await setDefault(26000);
  for (const [label, rate] of RATE_FIELDS) {
    const after = await edit(e.id, "Acceptance US$1,100", { reviewNote: `note edited with ${label}`, ...rate });
    assert.equal(after.reviewNote, `note edited with ${label}`, "the note edit was saved");
    assert.deepEqual([after.amount, after.currency, after.exchangeRate, after.rateSource, after.vndAmount], [1100, "USD", 26400, "DEFAULT", null], label);
    assert.equal(vndOf(after), 29040000, label);
  }
  assert.deepEqual(await moneyEdits(e.id), [], "no edit touched the money");

  // Only the explicit revaluation changes it.
  as.staff();
  await assert.rejects(() => revalue(e.id, { rateMode: "DEFAULT", reason: "new default" }), /Unauthorized/);
  as.nobody();
  await assert.rejects(() => revalue(e.id, { rateMode: "DEFAULT", reason: "new default" }), /Unauthorized/);
  as.admin();
  const noReason = await revalue(e.id, { rateMode: "DEFAULT", reason: "   " });
  assert.equal(noReason.success, false);
  assert.match(noReason.message ?? "", /reason/i);
  assert.equal(vndOf(await get(e.id)), 29040000);

  const res = await revalue(e.id, { rateMode: "DEFAULT", reason: "Revalued at the October default" });
  assert.equal(res.success, true, res.message);
  const revalued = await get(e.id);
  assert.deepEqual([revalued.amount, revalued.exchangeRate, revalued.rateSource, revalued.vndAmount], [1100, 26000, "DEFAULT", null]);
  assert.equal(vndOf(revalued), 28600000);

  const rows = (await history(e.id)).filter((h) => h.reason === "Revalued at the October default");
  assert.deepEqual(rows.map((h) => [h.action, h.field, h.oldValue, h.newValue, h.user]), [
    ["UPDATE", "exchangeRate", "26400", "26000", "owner"],
    ["REVALUE", "vndValue", "29040000", "28600000", "owner"],
  ]);

  // The same value again is not a revaluation.
  const again = await revalue(e.id, { rateMode: "DEFAULT", reason: "again" });
  assert.equal(again.success, false);
  assert.match(again.message ?? "", /same VND value/);
  assert.equal((await history(e.id)).filter((h) => h.action === "REVALUE").length, 1);
});

test("an entry booked at a MANUAL 26,400 keeps its rate through note/description edits, whatever rate fields arrive", async () => {
  await setDefault(26400);
  const e = await create("Manual-booked", { rateMode: "MANUAL", rate: 26400 });
  assert.deepEqual([e.exchangeRate, e.rateSource, e.vndAmount], [26400, "MANUAL", null]);
  await setDefault(26000);
  for (const [label, rate] of RATE_FIELDS) {
    const after = await edit(e.id, "Manual-booked", { reviewNote: label, ...rate });
    assert.deepEqual([after.amount, after.exchangeRate, after.rateSource, after.vndAmount], [1100, 26400, "MANUAL", null], label);
    assert.equal(vndOf(after), 29040000, label);
  }
  // Description too.
  const renamed = await edit(e.id, "Manual-booked (renamed)", { rateMode: "MANUAL", rate: 26000 });
  assert.deepEqual([renamed.description, renamed.exchangeRate, vndOf(renamed)], ["Manual-booked (renamed)", 26400, 29040000]);
  assert.deepEqual(await moneyEdits(e.id), []);
});

test("an entry booked at the bank's VND figure (29,040,000) keeps that exact VND value through edits", async () => {
  await setDefault(26400);
  const e = await create("Bank-booked", { rateMode: "BANK", vndAmount: 29040000 });
  assert.deepEqual([e.exchangeRate, e.rateSource, e.vndAmount], [26400, "BANK", 29040000]);
  await setDefault(26000);
  for (const [label, rate] of RATE_FIELDS) {
    const after = await edit(e.id, "Bank-booked", { reviewNote: label, ...rate });
    assert.deepEqual([after.amount, after.exchangeRate, after.rateSource, after.vndAmount], [1100, 26400, "BANK", 29040000], label);
  }
  assert.deepEqual(await moneyEdits(e.id), []);
});

test("a staff member's note edit keeps the booked value too, and the entry stays reviewed", async () => {
  await setDefault(26400);
  const e = await create("Staff-edited");
  await setDefault(26000);
  as.staff();
  const after = await edit(e.id, "Staff-edited", { reviewNote: "Invoice missing. Bank payment verified.", rateMode: "MANUAL", rate: 26000 });
  // A note is not a change to the books: the entry stays reviewed (and in the balances).
  assert.deepEqual([after.exchangeRate, after.rateSource, vndOf(after), after.status], [26400, "DEFAULT", 29040000, "REVIEWED"]);
  assert.deepEqual(await moneyEdits(e.id), []);
});

test("changing only the category, project or attachments keeps the booked value", async () => {
  const otherCat = await S.prisma.category.create({ data: { name: "Equipment", type: "EXPENSE" } });
  const project = await S.prisma.project.create({ data: { name: "Rate test project" } });
  await setDefault(26400);
  const e = await create("Reclassified");
  await setDefault(26000);

  const recat = await edit(e.id, "Reclassified", { categoryId: otherCat.id });
  assert.deepEqual([recat.categoryId, recat.exchangeRate, vndOf(recat)], [otherCat.id, 26400, 29040000]);
  const moved = await edit(e.id, "Reclassified", { categoryId: otherCat.id, projectId: project.id });
  assert.deepEqual([moved.projectId, moved.exchangeRate, vndOf(moved)], [project.id, 26400, 29040000]);
  const filed = await edit(e.id, "Reclassified", {
    categoryId: otherCat.id, projectId: project.id, files: new File([new Uint8Array([1, 2, 3])], "invoice-final.pdf", { type: "application/pdf" }),
  });
  assert.deepEqual([filed.exchangeRate, filed.rateSource, vndOf(filed)], [26400, "DEFAULT", 29040000]);
  assert.deepEqual((await S.prisma.attachment.findMany({ where: { transactionId: e.id } })).map((a) => a.fileName), ["invoice-final.pdf"]);
  assert.deepEqual(await moneyEdits(e.id), []);
});

test("a changed amount is valued at the booked rate, never today's default", async () => {
  await setDefault(26400);
  const d = await create("Amount change (default-booked)");
  const b = await create("Amount change (bank-booked)", { rateMode: "BANK", vndAmount: 29040000 });
  await setDefault(26000);

  const d2 = await edit(d.id, "Amount change (default-booked)", { amount: 1200 });
  assert.deepEqual([d2.amount, d2.exchangeRate, d2.rateSource, vndOf(d2)], [1200, 26400, "DEFAULT", 31680000]); // 1,200 × 26,400

  const b2 = await edit(b.id, "Amount change (bank-booked)", { amount: 1000, rateMode: "BANK", vndAmount: 99 });
  assert.deepEqual([b2.amount, b2.exchangeRate, b2.rateSource, b2.vndAmount], [1000, 26400, "BANK", 26400000]); // 1,000 × 26,400
  const b3 = await edit(b.id, "Amount change (bank-booked)", { amount: 1100 });
  assert.equal(vndOf(b3), 29040000);
});

test("a new entry uses the current default (26,000): US$1,100 → 28,600,000", async () => {
  await setDefault(26400);
  await create("Old entry at 26,400");
  await setDefault(26000);
  const n = await create("New entry at 26,000");
  assert.deepEqual([n.exchangeRate, n.rateSource, n.vndAmount, vndOf(n)], [26000, "DEFAULT", null, 28600000]);
  as.staff();
  const s = await create("New staff entry at 26,000");
  assert.deepEqual([s.exchangeRate, vndOf(s)], [26000, 28600000]);
  as.admin();
  assert.equal((await A.recordMovement(fd({ type: "OTHER_IN", amount: 1100, date: "2026-09-16", accountId: S.usd.id, description: "New movement at 26,000" }))).success, true);
  const m = await find("New movement at 26,000");
  assert.deepEqual([m.exchangeRate, m.rateSource, vndOf(m)], [26000, "DEFAULT", 28600000]);
});

test("an Accounts-page movement (capital / other money in) in the USD account keeps its booked rate when edited", async () => {
  await setDefault(26400);
  as.admin();
  for (const [type, description] of [["CAPITAL_IN", "Capital US$1,100"], ["OTHER_IN", "Other in US$1,100"]]) {
    assert.equal((await A.recordMovement(fd({ type, amount: 1100, date: "2026-09-10", accountId: S.usd.id, description }))).success, true);
  }
  const cap = await find("Capital US$1,100");
  const other = await find("Other in US$1,100");
  for (const m of [cap, other]) assert.deepEqual([m.exchangeRate, m.rateSource, vndOf(m)], [26400, "DEFAULT", 29040000]);

  await setDefault(26000);
  // The movement form sends type, account, amount, date, loan and description.
  const move = (id: string, type: string, extra: Values) =>
    A.updateMovement(id, fd({ type, amount: 1100, date: "2026-09-10", accountId: S.usd.id, loanId: "", ...extra }));
  assert.equal((await move(cap.id, "CAPITAL_IN", { description: "Capital US$1,100 (owner top-up)" })).success, true);
  const cap2 = await get(cap.id);
  assert.deepEqual([cap2.description, cap2.exchangeRate, cap2.rateSource, vndOf(cap2)], ["Capital US$1,100 (owner top-up)", 26400, "DEFAULT", 29040000]);

  as.staff();
  assert.equal((await move(other.id, "OTHER_IN", { description: "Other in — refund from vendor" })).success, true);
  const other2 = await get(other.id);
  assert.deepEqual([other2.exchangeRate, vndOf(other2), other2.status], [26400, 29040000, "DRAFT"]);
  assert.deepEqual(await moneyEdits(cap.id), []);
  assert.deepEqual(await moneyEdits(other.id), []);

  // A changed amount is valued at the booked rate.
  as.admin();
  assert.equal((await move(cap.id, "CAPITAL_IN", { amount: 1200, description: "Capital US$1,200" })).success, true);
  const cap3 = await get(cap.id);
  assert.deepEqual([cap3.amount, cap3.exchangeRate, vndOf(cap3)], [1200, 26400, 31680000]);
});

test("a USD → USD transfer keeps its booked rate when only its description is edited", async () => {
  const wise = await S.prisma.account.create({ data: { name: "Wise USD", type: "BANK", currency: "USD", openingDate: new Date("2026-05-01") } });
  await setDefault(26400);
  as.admin();
  const form = (description: string) => fd({ fromAccountId: S.usd.id, toAccountId: wise.id, amountOut: 1100, date: "2026-09-12", description });
  assert.equal((await A.createTransfer(form("USD to Wise"))).success, true);
  const legs = await S.prisma.transaction.findMany({ where: { description: "USD to Wise" } });
  assert.equal(legs.length, 2);
  for (const l of legs) assert.deepEqual([l.exchangeRate, vndOf(l)], [26400, 29040000]);

  await setDefault(26000);
  assert.equal((await A.updateTransfer(legs[0].transferId!, form("USD to Wise (top-up for card)"))).success, true);
  for (const l of await S.prisma.transaction.findMany({ where: { transferId: legs[0].transferId } })) {
    assert.equal(l.description, "USD to Wise (top-up for card)");
    assert.deepEqual([l.exchangeRate, vndOf(l)], [26400, 29040000], `${l.type} was re-priced at today's default`);
  }
});

test("revaluation is refused for a VND entry, a posted entry and a transfer leg", async () => {
  await setDefault(26400);
  as.admin();
  // VND entry
  assert.equal((await L.createTransaction(entryForm("VND hosting", { currency: "VND", amount: 2500000, accountId: S.vnd.id }))).success, true);
  const vndEntry = await find("VND hosting");
  const v = await revalue(vndEntry.id, { rateMode: "MANUAL", rate: 26000, reason: "try" });
  assert.equal(v.success, false);
  assert.match(v.message ?? "", /VND entry/);

  // Posted entry
  const p = await create("Posted US$1,100");
  assert.equal((await L.postEntries([p.id])).count, 1);
  await setDefault(26000);
  const pr = await revalue(p.id, { rateMode: "DEFAULT", reason: "try" });
  assert.equal(pr.success, false);
  assert.match(pr.message ?? "", /posted/);
  assert.deepEqual([(await get(p.id)).exchangeRate, vndOf(await get(p.id))], [26400, 29040000]);

  // Transfer leg (a USD → VND conversion keeps the rate its two sides imply)
  assert.equal((await A.createTransfer(fd({ fromAccountId: S.usd.id, toAccountId: S.vnd.id, amountOut: 1100, amountIn: 29040000, date: "2026-09-20", description: "conversion" }))).success, true);
  const out = await S.prisma.transaction.findFirstOrThrow({ where: { description: "conversion", type: "TRANSFER_OUT" } });
  const tr = await revalue(out.id, { rateMode: "DEFAULT", reason: "try" });
  assert.equal(tr.success, false);
  assert.match(tr.message ?? "", /transfer/);
  const out2 = await get(out.id);
  assert.deepEqual([out2.exchangeRate, out2.vndAmount], [26400, 29040000]);

  for (const id of [vndEntry.id, p.id, out.id]) assert.equal((await history(id)).filter((h) => h.action === "REVALUE").length, 0);
});

test("a receipt with a withheld bank fee: edits keep both values; the fee can't be revalued alone; the receipt is revalued together with its fee", async () => {
  const bankFees = await S.prisma.category.create({ data: { name: "Bank & FX Fees", type: "EXPENSE" } });
  await setDefault(26400);
  as.admin();
  assert.equal((await I.createInvoice(fd({ direction: "RECEIVABLE", number: "E041-R", issueDate: "2026-09-01", dueDate: "2026-09-30", currency: "USD", amount: 1998.75, categoryId: S.income.id }))).success, true);
  const inv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "E041-R" } });
  const paid = await I.recordPayment(inv.id, fd({
    amount: 1998.75, feeDeducted: 26, feeCategoryId: bankFees.id, paidDate: "2026-09-20", accountId: S.usd.id, rateMode: "DEFAULT", requestId: "rate-test-1",
  }));
  assert.equal(paid.success, true, paid.message);
  const receipt = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "E041-R", type: "INCOME" } });
  const fee = await S.prisma.transaction.findFirstOrThrow({ where: { deductedFromId: receipt.id } });
  assert.deepEqual([receipt.amount, receipt.exchangeRate, vndOf(receipt)], [1998.75, 26400, 52767000]);
  assert.deepEqual([fee.amount, fee.exchangeRate, vndOf(fee)], [26, 26400, 686400]);

  await setDefault(26000);
  // A note on the receipt keeps both values.
  const noted = await edit(receipt.id, receipt.description!, {
    type: "INCOME", amount: 1998.75, categoryId: S.income.id, rateMode: "MANUAL", rate: 26000, reviewNote: "Bank advice on file; US$26 withheld",
  });
  assert.deepEqual([noted.reviewNote, noted.exchangeRate, vndOf(noted)], ["Bank advice on file; US$26 withheld", 26400, 52767000]);
  assert.deepEqual([(await get(fee.id)).exchangeRate, vndOf(await get(fee.id))], [26400, 686400]);

  // The fee follows its receipt.
  const alone = await revalue(fee.id, { rateMode: "DEFAULT", reason: "try" });
  assert.equal(alone.success, false);
  assert.match(alone.message ?? "", /receipt this fee/);
  assert.equal((await get(fee.id)).exchangeRate, 26400);

  // Revalued at today's default: both move.
  assert.equal((await revalue(receipt.id, { rateMode: "DEFAULT", reason: "October default" })).success, true);
  const r1 = await get(receipt.id), f1 = await get(fee.id);
  assert.deepEqual([r1.exchangeRate, r1.rateSource, vndOf(r1)], [26000, "DEFAULT", 51967500]); // 1,998.75 × 26,000
  assert.deepEqual([f1.exchangeRate, f1.rateSource, vndOf(f1)], [26000, "DEFAULT", 676000]); // 26 × 26,000
  assert.deepEqual((await history(receipt.id)).filter((h) => h.action === "REVALUE").map((h) => [h.oldValue, h.newValue, h.reason]), [["52767000", "51967500", "October default"]]);
  assert.deepEqual((await history(fee.id)).filter((h) => h.action === "REVALUE").map((h) => [h.oldValue, h.newValue, h.reason]), [["686400", "676000", "October default"]]);

  // Revalued to the bank's figure: the VND it credited is the net (1,972.75 × 26,100).
  assert.equal((await revalue(receipt.id, { rateMode: "BANK", vndAmount: 51488775, reason: "MB credit advice" })).success, true);
  const r2 = await get(receipt.id), f2 = await get(fee.id);
  assert.equal(r2.rateSource, "BANK");
  assert.equal(f2.rateSource, "BANK");
  assert.ok(Math.abs(r2.exchangeRate - 26100) < 1e-6 && Math.abs(f2.exchangeRate - 26100) < 1e-6, `rates ${r2.exchangeRate} / ${f2.exchangeRate}`);
  assert.deepEqual([r2.vndAmount, f2.vndAmount], [52167375, 678600]);
  assert.equal(r2.vndAmount! - f2.vndAmount!, 51488775, "the account moves by what the bank credited");

  // The invoice is still settled in full; revaluing never touches the USD amounts.
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PAID");
  assert.deepEqual([r2.amount, f2.amount], [1998.75, 26]);
});
