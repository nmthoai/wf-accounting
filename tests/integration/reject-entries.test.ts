// Admin review can reject an entry with a reason. Workflow: DRAFT → REVIEWED →
// POSTED, or DRAFT → REJECTED (back to its creator with the reason) → DRAFT
// again when the creator saves a correction. A rejected entry is out of the
// books: balances, totals, invoice settlement, reports, exports, handover.
import { as, fd, seed, uploadDir } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as xlsx from "xlsx";

let L: typeof import("@/app/actions/ledger");
let I: typeof import("@/app/actions/invoices");
let A: typeof import("@/app/actions/accounts");
let H: typeof import("@/lib/handover");
let EX: typeof import("@/app/api/reports/export/route");
let IS: typeof import("@/lib/invoice-status");
let $: typeof import("@/lib/money");
let S: Awaited<ReturnType<typeof seed>>;
let fees: { id: string };
before(async () => {
  L = await import("@/app/actions/ledger");
  I = await import("@/app/actions/invoices");
  A = await import("@/app/actions/accounts");
  H = await import("@/lib/handover");
  EX = await import("@/app/api/reports/export/route");
  IS = await import("@/lib/invoice-status");
  $ = await import("@/lib/money");
  S = await seed();
  fees = await S.prisma.category.create({ data: { name: "Bank & FX Fees", type: "EXPENSE" } });
});

const REASON_REQUIRED = "Give the reason for rejecting it.";
const ONLY_DRAFTS = "Only drafts waiting for review can be rejected.";

// A VND bank account of its own per test, so its balance only shows that test's entries.
const account = (name: string, openingBalance = 0) =>
  S.prisma.account.create({ data: { name, type: "BANK", currency: "VND", openingBalance, openingDate: new Date("2026-05-01T00:00:00.000Z") } });

const entry = (description: string, extra: Record<string, string | number | File> = {}) =>
  fd({ type: "EXPENSE", amount: 250000, currency: "VND", date: "2026-07-10", accountId: S.vnd.id, categoryId: S.expense.id, description, ...extra });
const find = (description: string) => S.prisma.transaction.findFirstOrThrow({ where: { description } });
const statusOf = async (id: string) => (await S.prisma.transaction.findUniqueOrThrow({ where: { id } })).status;
const history = (id: string) => S.prisma.changeLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });
const rows = async (id: string, action: string) => (await history(id)).filter((h) => h.action === action);
const byField = <T extends { field: string | null }>(xs: T[]) => [...xs].sort((a, b) => String(a.field).localeCompare(String(b.field)));

// An entry as the current user creates it (the owner's start reviewed, staff's as drafts).
async function make(description: string, extra: Record<string, string | number | File> = {}) {
  const res = await L.createTransaction(entry(description, extra));
  assert.equal(res.success, true, res.message);
  return find(description);
}
async function staffDraft(description: string, extra: Record<string, string | number | File> = {}) {
  as.staff();
  const t = await make(description, extra);
  assert.equal(t.status, "DRAFT", "a staff entry starts as a draft");
  return t;
}
async function rejectAsAdmin(ids: string[], reason: string, expectedCount = ids.length) {
  as.admin();
  const res = await L.rejectEntries(ids, reason);
  assert.deepEqual(res, { success: true, count: expectedCount });
}

// The account's balance as the Accounts page computes it (booked entries only).
async function balanceOf(accountId: string) {
  const acct = await S.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
  const txns = await S.prisma.transaction.findMany({ where: { accountId } });
  return $.computeBalances([acct], txns.filter($.isBooked)).get(accountId)!;
}

// Profit & loss as the Reports page selects it: booked INCOME/EXPENSE, valued in VND.
async function pnl(where: object) {
  const txns = await S.prisma.transaction.findMany({ where: { type: { in: ["INCOME", "EXPENSE"] }, ...$.BOOKED, ...where } });
  const sum = (type: string) => txns.filter((t) => t.type === type).reduce((s, t) => s + $.toVnd(t), 0);
  return { income: sum("INCOME"), expense: sum("EXPENSE"), ids: txns.map((t) => t.id) };
}

async function receivable(number: string, amount: number) {
  as.admin();
  const res = await I.createInvoice(fd({ direction: "RECEIVABLE", number, clientId: S.client.id, issueDate: "2026-07-01", dueDate: "2026-07-31", currency: "VND", amount, categoryId: S.income.id }));
  assert.equal(res.success, true, res.message);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
}
const invoiceStatus = async (id: string) => (await S.prisma.invoice.findUniqueOrThrow({ where: { id } })).status;
// What's still open on an invoice, counting booked payments only (as the app does).
async function outstanding(id: string) {
  const inv = await S.prisma.invoice.findUniqueOrThrow({ where: { id }, include: { allocations: $.BOOKED_ALLOCATIONS } });
  return $.settlement(inv.amount, inv.allocations).difference;
}
// The receipt recorded for an invoice and the fee withheld from it (if any).
async function pairOf(number: string) {
  const receipt = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: number, type: "INCOME" } });
  const fee = await S.prisma.transaction.findUnique({ where: { deductedFromId: receipt.id } });
  return { receipt, fee };
}

test("admin rejects a staff draft with a reason: REJECTED, with the reason and the admin in the history", async () => {
  const t = await staffDraft("RJ1 hosting");
  await rejectAsAdmin([t.id], "  wrong account — this was paid from MB USD  ");
  assert.equal(await statusOf(t.id), "REJECTED");
  const rejected = await rows(t.id, "REJECT");
  assert.deepEqual(rejected.map((h) => [h.entity, h.field, h.oldValue, h.newValue, h.reason, h.user]), [
    ["Transaction", "status", "DRAFT", "REJECTED", "wrong account — this was paid from MB USD", "owner"],
  ]);
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE", "REJECT"]);
});

test("a rejection without a reason is refused and changes nothing", async () => {
  const t = await staffDraft("RJ2 no reason");
  as.admin();
  for (const reason of ["", "   ", undefined as unknown as string]) {
    const res = await L.rejectEntries([t.id], reason);
    assert.deepEqual(res, { success: false, message: REASON_REQUIRED, count: 0 }, `reason ${JSON.stringify(reason)}`);
  }
  assert.equal(await statusOf(t.id), "DRAFT");
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE"], "nothing recorded");
});

test("staff can't reject — not even their own draft — and nor can someone signed out", async () => {
  const t = await staffDraft("RJ3 staff reject");
  as.staff();
  await assert.rejects(() => L.rejectEntries([t.id], "I changed my mind"), /Unauthorized/);
  as.nobody();
  await assert.rejects(() => L.rejectEntries([t.id], "anonymous"), /Unauthorized/);
  assert.equal(await statusOf(t.id), "DRAFT");
  assert.equal((await rows(t.id, "REJECT")).length, 0);
});

test("only drafts can be rejected: reviewed, posted and already rejected entries are refused with a message", async () => {
  as.admin();
  const reviewed = await make("RJ4 reviewed");
  const posted = await make("RJ4 posted");
  assert.equal((await L.postEntries([posted.id])).count, 1);
  const rejected = await staffDraft("RJ4 rejected");
  await rejectAsAdmin([rejected.id], "first rejection");

  as.admin();
  for (const [t, status] of [[reviewed, "REVIEWED"], [posted, "POSTED"], [rejected, "REJECTED"]] as const) {
    const res = await L.rejectEntries([t.id], "not allowed");
    assert.deepEqual(res, { success: false, message: ONLY_DRAFTS, count: 0 }, `a ${status} entry`);
    assert.equal(await statusOf(t.id), status, `the ${status} entry is unchanged`);
  }
  assert.equal((await rows(reviewed.id, "REJECT")).length, 0);
  assert.equal((await rows(posted.id, "REJECT")).length, 0);
  assert.equal((await rows(rejected.id, "REJECT")).length, 1, "rejected once only");

  // A mixed selection rejects the draft only.
  const draft = await staffDraft("RJ4 draft in a mixed selection");
  as.admin();
  assert.deepEqual(await L.rejectEntries([draft.id, reviewed.id], "mixed"), { success: true, count: 1 });
  assert.deepEqual([await statusOf(draft.id), await statusOf(reviewed.id)], ["REJECTED", "REVIEWED"]);
});

test("a rejected entry is out of the books: the account balance and report totals are as if it was never entered", async () => {
  const acct = await account("RJ5 bank", 5_000_000);
  assert.equal(await balanceOf(acct.id), 5_000_000);
  as.admin();
  const kept = await make("RJ5 reviewed rent", { accountId: acct.id, amount: 1_000_000, date: "2026-07-12" });
  const before = { balance: await balanceOf(acct.id), pnl: await pnl({ accountId: acct.id }) };
  assert.equal(before.balance, 4_000_000);

  const out = await staffDraft("RJ5 staff hosting", { accountId: acct.id, amount: 250_000 });
  const inn = await staffDraft("RJ5 staff receipt", { accountId: acct.id, amount: 3_000_000, type: "INCOME", categoryId: S.income.id });
  await rejectAsAdmin([out.id, inn.id], "duplicates of entries already booked");
  assert.deepEqual([await statusOf(out.id), await statusOf(inn.id)], ["REJECTED", "REJECTED"]);

  assert.equal(await balanceOf(acct.id), before.balance, "balance unchanged versus before the drafts");
  const after = await pnl({ accountId: acct.id });
  assert.deepEqual(after, before.pnl, "report totals unchanged");
  assert.deepEqual(after.ids, [kept.id]);
  assert.deepEqual([after.income, after.expense], [0, 1_000_000]);
  assert.equal($.isBooked({ status: "REJECTED" }), false);
  assert.equal(await S.prisma.transaction.count({ where: { id: { in: [out.id, inn.id] }, ...$.BOOKED } }), 0);
});

test("a rejected payment is released from its invoice; corrected, re-linked and approved, it settles it", async () => {
  const acct = await account("RJ6 bank");
  const inv = await receivable("RJ-PAY", 3_000_000);
  as.staff();
  const res = await I.recordPayment(inv.id, fd({ amount: 3_000_000, paidDate: "2026-07-15", accountId: acct.id }));
  assert.equal(res.success, true, res.message);
  const { receipt: pay } = await pairOf("RJ-PAY");
  assert.equal(pay.status, "DRAFT");
  assert.equal(await invoiceStatus(inv.id), "OPEN", "a draft payment settles nothing yet");

  await rejectAsAdmin([pay.id], "the bank shows this on the 16th");
  assert.equal(await statusOf(pay.id), "REJECTED");
  await IS.refreshInvoiceStatus([inv.id]);
  assert.equal(await invoiceStatus(inv.id), "OPEN", "a rejected payment settles nothing");
  // Out of the books, it no longer holds the invoice: the link is released, with the reason.
  assert.equal(await S.prisma.paymentAllocation.count({ where: { transactionId: pay.id } }), 0);
  assert.equal((await rows(pay.id, "UNLINK"))[0]?.reason, "the bank shows this on the 16th");
  // …and it can't be linked again until corrected.
  as.admin();
  assert.match((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: pay.id, amount: 3_000_000 }))).message!, /rejected/);
  assert.equal(await outstanding(inv.id), 3_000_000);
  assert.equal(await balanceOf(acct.id), 0);

  // The creator corrects it: a draft again, still not settling the invoice.
  as.staff();
  const edit = await L.editTransaction(pay.id, fd({
    type: "INCOME", amount: 3_000_000, currency: "VND", date: "2026-07-16", accountId: acct.id, categoryId: S.income.id,
    description: pay.description!, invoiceNumber: "RJ-PAY", reason: "date per bank statement",
  }));
  assert.equal(edit.success, true, edit.message);
  assert.equal(await statusOf(pay.id), "DRAFT");
  assert.equal(await invoiceStatus(inv.id), "OPEN");
  // Corrected, it is linked to the invoice again.
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: pay.id, amount: 3_000_000 }))).success, true);

  as.admin();
  assert.equal((await L.reviewEntries([pay.id])).count, 1);
  assert.equal(await statusOf(pay.id), "REVIEWED");
  assert.equal(await invoiceStatus(inv.id), "PAID");
  assert.equal(await outstanding(inv.id), 0);
  assert.equal(await balanceOf(acct.id), 3_000_000);
});

test("staff correcting a rejected entry resubmits it as a draft, with history rows; the owner then approves it and it counts", async () => {
  const acct = await account("RJ7 bank");
  const t = await staffDraft("RJ7 software", { accountId: acct.id, amount: 300_000 });
  await rejectAsAdmin([t.id], "the invoice says 350,000");

  as.staff();
  const res = await L.editTransaction(t.id, entry("RJ7 software", { accountId: acct.id, amount: 350_000, reason: "fixed the amount" }));
  assert.equal(res.success, true, res.message);
  assert.equal(await statusOf(t.id), "DRAFT", "resubmitted for review");
  const updates = byField(await rows(t.id, "UPDATE"));
  assert.deepEqual(updates.map((h) => [h.field, h.oldValue, h.newValue, h.reason, h.user]), [
    ["amount", "300000", "350000", "fixed the amount", "dot"],
    ["status", "REJECTED", "DRAFT", "fixed the amount", "dot"],
  ]);
  assert.equal(await balanceOf(acct.id), 0, "a resubmitted draft is still out of the books");

  as.admin();
  assert.deepEqual(await L.reviewEntries([t.id]), { success: true, count: 1 });
  assert.equal(await statusOf(t.id), "REVIEWED");
  assert.deepEqual((await rows(t.id, "REVIEW")).map((h) => [h.field, h.oldValue, h.newValue, h.user]), [["status", "DRAFT", "REVIEWED", "owner"]]);
  assert.equal(await balanceOf(acct.id), -350_000, "counted once approved");
  assert.deepEqual((await pnl({ id: t.id })).expense, 350_000);
  assert.deepEqual((await history(t.id)).map((h) => h.action).filter((a) => a !== "UPDATE"), ["CREATE", "REJECT", "REVIEW"]);
});

test("a staff save that only fixes a note also resubmits a rejected entry", async () => {
  const t = await staffDraft("RJ7b note only");
  await rejectAsAdmin([t.id], "say what this is for");
  as.staff();
  const res = await L.editTransaction(t.id, entry("RJ7b note only", { reviewNote: "monthly hosting for the client site" }));
  assert.equal(res.success, true, res.message);
  assert.equal(await statusOf(t.id), "DRAFT");
  const status = (await rows(t.id, "UPDATE")).filter((h) => h.field === "status");
  assert.deepEqual(status.map((h) => [h.oldValue, h.newValue]), [["REJECTED", "DRAFT"]]);
});

test("the owner may approve a rejected entry directly (accepted after all)", async () => {
  const acct = await account("RJ8 bank");
  const t = await staffDraft("RJ8 accepted after all", { accountId: acct.id, amount: 120_000 });
  await rejectAsAdmin([t.id], "is this a business cost?");
  assert.equal(await balanceOf(acct.id), 0);
  as.admin();
  assert.deepEqual(await L.reviewEntries([t.id]), { success: true, count: 1 });
  assert.equal(await statusOf(t.id), "REVIEWED");
  assert.deepEqual((await rows(t.id, "REVIEW")).map((h) => [h.oldValue, h.newValue, h.user]), [["REJECTED", "REVIEWED", "owner"]]);
  assert.equal(await balanceOf(acct.id), -120_000);
});

test("a transfer is rejected as both legs, and staff correcting it resubmits both", async () => {
  const from = await account("RJ9 from", 10_000_000);
  const to = await account("RJ9 to");
  as.staff();
  const res = await A.createTransfer(fd({ fromAccountId: from.id, toAccountId: to.id, amountOut: 2_000_000, date: "2026-07-20", description: "RJ9 top-up" }));
  assert.equal(res.success, true, res.message);
  const legs = await S.prisma.transaction.findMany({ where: { description: "RJ9 top-up" } });
  const out = legs.find((l) => l.type === "TRANSFER_OUT")!;
  const inn = legs.find((l) => l.type === "TRANSFER_IN")!;
  assert.ok(out && inn && out.transferId && out.transferId === inn.transferId);
  assert.deepEqual([out.status, inn.status], ["DRAFT", "DRAFT"]);

  // Rejecting one leg rejects the other with it.
  await rejectAsAdmin([out.id], "wrong destination account", 2);
  assert.deepEqual([await statusOf(out.id), await statusOf(inn.id)], ["REJECTED", "REJECTED"]);
  for (const leg of [out, inn]) {
    assert.deepEqual((await rows(leg.id, "REJECT")).map((h) => [h.oldValue, h.newValue, h.reason]), [["DRAFT", "REJECTED", "wrong destination account"]]);
  }
  assert.deepEqual([await balanceOf(from.id), await balanceOf(to.id)], [10_000_000, 0]);

  as.staff();
  const upd = await A.updateTransfer(out.transferId!, fd({ fromAccountId: from.id, toAccountId: to.id, amountOut: 1_500_000, date: "2026-07-20", description: "RJ9 top-up", reason: "corrected amount" }));
  assert.equal(upd.success, true, upd.message);
  assert.deepEqual([await statusOf(out.id), await statusOf(inn.id)], ["DRAFT", "DRAFT"]);
  for (const leg of [out, inn]) {
    const status = (await rows(leg.id, "UPDATE")).filter((h) => h.field === "status");
    assert.deepEqual(status.map((h) => [h.oldValue, h.newValue, h.reason]), [["REJECTED", "DRAFT", "corrected amount"]]);
  }
  assert.deepEqual([await balanceOf(from.id), await balanceOf(to.id)], [10_000_000, 0]);

  as.admin();
  assert.deepEqual(await L.reviewEntries([inn.id]), { success: true, count: 2 });
  assert.deepEqual([await statusOf(out.id), await statusOf(inn.id)], ["REVIEWED", "REVIEWED"]);
  assert.deepEqual([await balanceOf(from.id), await balanceOf(to.id)], [8_500_000, 1_500_000]);
});

test("a receipt with a withheld bank fee is rejected and resubmitted as a pair — from either side", async () => {
  const acct = await account("RJ10 bank");
  const inv = await receivable("RJ-FEE", 10_000_000);
  as.staff();
  const res = await I.recordPayment(inv.id, fd({ amount: 10_000_000, paidDate: "2026-07-22", accountId: acct.id, feeDeducted: 50_000, feeCategoryId: fees.id }));
  assert.equal(res.success, true, res.message);
  const { receipt, fee } = await pairOf("RJ-FEE");
  assert.ok(fee, "the withheld fee was recorded");
  assert.deepEqual([receipt.status, fee.status], ["DRAFT", "DRAFT"]);

  // Rejecting the fee rejects the receipt it was withheld from.
  await rejectAsAdmin([fee.id], "attach the bank advice", 2);
  assert.deepEqual([await statusOf(receipt.id), await statusOf(fee.id)], ["REJECTED", "REJECTED"]);
  for (const e of [receipt, fee]) assert.equal((await rows(e.id, "REJECT"))[0]?.reason, "attach the bank advice");
  assert.equal(await invoiceStatus(inv.id), "OPEN");
  assert.equal(await balanceOf(acct.id), 0);

  // The creator saves the receipt with the advice attached: both are drafts again.
  as.staff();
  const receiptForm = (extra: Record<string, string | number | File> = {}) => fd({
    type: "INCOME", amount: 10_000_000, currency: "VND", date: "2026-07-22", accountId: acct.id, categoryId: S.income.id,
    description: receipt.description!, invoiceNumber: "RJ-FEE", ...extra,
  });
  const edit = await L.editTransaction(receipt.id, receiptForm({ files: new File([new Uint8Array([1, 2, 3])], "bank-advice.pdf", { type: "application/pdf" }), reason: "advice attached" }));
  assert.equal(edit.success, true, edit.message);
  assert.deepEqual([await statusOf(receipt.id), await statusOf(fee.id)], ["DRAFT", "DRAFT"]);
  for (const e of [receipt, fee]) {
    const status = (await rows(e.id, "UPDATE")).filter((h) => h.field === "status");
    assert.deepEqual(status.map((h) => [h.oldValue, h.newValue, h.reason, h.user]), [["REJECTED", "DRAFT", "advice attached", "dot"]], e === fee ? "the fee" : "the receipt");
  }

  // Rejected again (from the receipt), and this time corrected from the fee's side.
  await rejectAsAdmin([receipt.id], "the fee was 55,000", 2);
  as.staff();
  const feeEdit = await L.editTransaction(fee.id, fd({
    type: "EXPENSE", amount: 55_000, currency: "VND", date: "2026-07-22", accountId: acct.id, categoryId: fees.id,
    description: fee.description!, invoiceNumber: "RJ-FEE", reason: "fee per advice",
  }));
  assert.equal(feeEdit.success, true, feeEdit.message);
  assert.deepEqual([await statusOf(receipt.id), await statusOf(fee.id)], ["DRAFT", "DRAFT"]);
  assert.equal(await invoiceStatus(inv.id), "OPEN");
  // The rejection released the receipt's invoice link; once corrected it is linked again.
  assert.equal(await S.prisma.paymentAllocation.count({ where: { transactionId: receipt.id } }), 0);
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: receipt.id, amount: 10_000_000 }))).success, true);

  as.admin();
  assert.deepEqual(await L.reviewEntries([receipt.id]), { success: true, count: 2 });
  assert.deepEqual([await statusOf(receipt.id), await statusOf(fee.id)], ["REVIEWED", "REVIEWED"]);
  assert.equal(await invoiceStatus(inv.id), "PAID");
  assert.equal(await balanceOf(acct.id), 10_000_000 - 55_000);
});

test("staff may remove evidence from a rejected entry (as from a draft), not from a reviewed one", async () => {
  const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
  const t = await staffDraft("RJ11 wrong receipt", { files: file("wrong-receipt.pdf") });
  const att = await S.prisma.attachment.findFirstOrThrow({ where: { transactionId: t.id } });
  assert.ok(existsSync(join(uploadDir!, att.filePath)));
  await rejectAsAdmin([t.id], "this receipt is for another purchase");

  as.staff();
  assert.deepEqual(await L.deleteAttachment(att.id), { success: true });
  assert.equal(await S.prisma.attachment.count({ where: { id: att.id } }), 0);
  assert.equal(existsSync(join(uploadDir!, att.filePath)), false, "the file is removed from disk");
  assert.deepEqual((await rows(t.id, "UNLINK")).map((h) => [h.field, h.oldValue, h.user]), [["attachment", "wrong-receipt.pdf", "dot"]]);
  assert.equal(await statusOf(t.id), "REJECTED", "removing evidence alone doesn't resubmit it");

  // For contrast: once approved, the evidence is the owner's call.
  const ok = await staffDraft("RJ11 approved", { files: file("good-receipt.pdf") });
  as.admin();
  await L.reviewEntries([ok.id]);
  const kept = await S.prisma.attachment.findFirstOrThrow({ where: { transactionId: ok.id } });
  as.staff();
  assert.equal((await L.deleteAttachment(kept.id)).success, false);
  assert.equal(await S.prisma.attachment.count({ where: { id: kept.id } }), 1);
});

test("posting never takes a rejected entry — chosen or by post-through", async () => {
  as.admin();
  const reviewed = await make("RJ12 June reviewed", { date: "2026-06-10" });
  const t = await staffDraft("RJ12 June rejected", { date: "2026-06-15" });
  await rejectAsAdmin([t.id], "not ours");

  as.admin();
  assert.deepEqual(await L.postEntries([t.id]), { success: true, count: 0 });
  assert.equal(await statusOf(t.id), "REJECTED");
  const res = await L.postEntries(null, "2026-06-30");
  assert.equal(res.success, true);
  assert.deepEqual([await statusOf(reviewed.id), await statusOf(t.id)], ["POSTED", "REJECTED"]);
  assert.equal((await rows(t.id, "POST")).length, 0);
});

test("the handover lists a rejected entry as an open question and leaves it out of the figures", async () => {
  as.admin();
  const kept = await make("RJ13 October reviewed", { date: "2026-10-06", amount: 100_000 });
  const t = await staffDraft("RJ13 October rejected", { date: "2026-10-05", amount: 400_000 });
  await rejectAsAdmin([t.id], "no receipt — please attach it");

  const d = await H.collect("2026-10");
  assert.ok(d.entries.some((e) => e.id === t.id), "listed among the month's entries");
  assert.deepEqual(d.booked.map((e) => e.id), [kept.id], "not among the booked entries");

  const mine = H.questions(d).filter((q) => q.ref === t.id);
  assert.deepEqual(mine, [{
    area: "Not reviewed",
    item: "2026-10-05 · RJ13 October rejected",
    detail: "Rejected and sent back for correction — excluded from this package's figures until it is corrected and reviewed.",
    amount: "400000 VND",
    ref: t.id,
    key: t.id,
  }]);
  const vi = H.questions(d, "vi").find((q) => q.ref === t.id);
  assert.ok(vi && vi.detail !== mine[0].detail && !vi.detail.includes("questions.rejected"), `Vietnamese text: ${vi?.detail}`);

  const s = H.summarize(d);
  assert.deepEqual([s.expense, s.income, s.reviewed, s.posted], [100_000, 0, 1, 0]);
});

test("the ledger export labels a rejected entry \"Rejected\" and leaves it out of the totals", async () => {
  as.admin();
  await make("RJ14 reviewed expense", { date: "2026-09-12", amount: 200_000 });
  await make("RJ14 reviewed income", { date: "2026-09-13", amount: 1_000_000, type: "INCOME", categoryId: S.income.id });
  const out = await staffDraft("RJ14 rejected expense", { date: "2026-09-10", amount: 700_000 });
  const inn = await staffDraft("RJ14 rejected income", { date: "2026-09-11", amount: 5_000_000, type: "INCOME", categoryId: S.income.id });
  await rejectAsAdmin([out.id, inn.id], "not company money");

  const exportRows = async () => {
    as.admin();
    const res = await EX.GET(new Request("http://test/api/reports/export?type=entries&from=2026-09-01&to=2026-09-30"));
    assert.equal(res.status, 200);
    const wb = xlsx.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    return xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  };
  const sheet = await exportRows();
  const byDesc = (d: string) => sheet.find((r) => r.Description === d)!;
  assert.equal(byDesc("RJ14 rejected expense").Status, "Rejected");
  assert.equal(byDesc("RJ14 rejected income").Status, "Rejected");
  assert.equal(byDesc("RJ14 reviewed expense").Status, "Reviewed");
  const total = (label: string) => sheet.find((r) => r.Type === label)?.["Amount (VND)"];
  assert.deepEqual([total("TOTAL Income"), total("TOTAL Expense"), total("NET")], [1_000_000, 200_000, 800_000]);

  // In Vietnamese, the label follows the language.
  await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: "vi" } });
  try {
    const vi = await exportRows();
    const row = vi.find((r) => Object.values(r).includes(out.id))!;
    assert.ok(Object.values(row).includes("Bị từ chối"), JSON.stringify(row));
  } finally {
    await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: null } });
  }
});

test("a rejected entry leaves its bank line, can't be matched or take a register receipt until corrected", async () => {
  const B = await import("@/app/actions/bank");
  const C = await import("@/app/actions/costs");
  as.admin();
  const st = await S.prisma.bankStatement.create({
    data: { accountId: S.vnd.id, fileName: "rj.xlsx", periodFrom: new Date("2026-07-01"), periodTo: new Date("2026-07-31"), openingBalance: 0, closingBalance: -700_000, inflows: 0, outflows: 700_000, lineCount: 1 },
  });
  const line = await S.prisma.bankLine.create({
    data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-07-25"), reference: "FT-RJ", amount: -700_000, locator: "rj.xlsx · 1 · row 9", dedupeKey: "FT-RJ|2026-07-25|-700000" },
  });
  as.staff();
  assert.equal((await L.createTransaction(fd({ type: "EXPENSE", amount: 700_000, currency: "VND", date: "2026-07-25", accountId: S.vnd.id, categoryId: S.expense.id, description: "RJ bank match", bankLineId: line.id }))).success, true);
  const e = await S.prisma.transaction.findFirstOrThrow({ where: { description: "RJ bank match" } });
  assert.equal(e.bankLineId, line.id);

  await rejectAsAdmin([e.id], "wrong vendor — enter it again");
  const after = await S.prisma.transaction.findUniqueOrThrow({ where: { id: e.id } });
  assert.deepEqual([after.status, after.bankLineId], ["REJECTED", null], "released from the line it no longer explains");
  assert.equal((await rows(e.id, "UNMATCH"))[0]?.reason, "wrong vendor — enter it again");

  // Until corrected it can't be matched, nor can a pending register receipt be linked to it.
  as.staff();
  assert.match((await B.matchLine(line.id, [e.id])).message!, /rejected/i);
  assert.equal((await C.saveCostItem(null, fd({ provider: "RJ Vendor", receiptDate: "2026-07-25", amount: 700_000, currency: "VND" }))).success, true);
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "RJ Vendor" } });
  as.admin();
  assert.match((await C.linkCostItem(item.id, e.id)).message!, /rejected/i);

  // Corrected and resubmitted, it is matched again.
  as.staff();
  assert.equal((await L.editTransaction(e.id, fd({ type: "EXPENSE", amount: 700_000, currency: "VND", date: "2026-07-25", accountId: S.vnd.id, categoryId: S.expense.id, description: "RJ bank match (vendor fixed)" }))).success, true);
  assert.equal((await B.matchLine(line.id, [e.id])).success, true);
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: e.id } })).bankLineId, line.id);
});
