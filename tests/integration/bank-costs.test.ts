import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as xlsx from "xlsx";

let B: typeof import("@/app/actions/bank");
let C: typeof import("@/app/actions/costs");
let L: typeof import("@/app/actions/ledger");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  B = await import("@/app/actions/bank");
  C = await import("@/app/actions/costs");
  L = await import("@/app/actions/ledger");
  S = await seed();
});

// A small synthetic VND statement: +100,000,000 capital, −8,221,200 vendor, −725 fee.
const statement = (currency = "VND") => {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
    [`Loại tiền/Currency: ${currency}`], ["Số dư đầu kỳ/ Opening Balance: 0"],
    ["Ngày giao dịch", "Ngày hạch toán", "Số bút toán", "Phát sinh nợ", "Phát sinh có", "Nội dung"],
    ["17/06/2026", "17/06/2026", "FT1", "", 100000000, "capital"],
    ["21/06/2026", "22/06/2026", "FT2", 8221200, "", "ODP"],
    ["21/06/2026", "22/06/2026", "FT2", 725, "", "fee"],
    ["Số dư cuối kỳ/ Closing Balance: 91,778,075"],
  ]), "Thông tin giao dịch");
  return new File([new Uint8Array(xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer)], "mb.xlsx");
};
const upload = (accountId: string, closing: number | string, currency = "VND") =>
  B.importStatement(fd({ file: statement(currency), accountId, opening: 0, closing }));

test("a statement that doesn't add up is refused and nothing is saved", async () => {
  as.staff();
  const res = await upload(S.vnd.id, 91778000);
  assert.equal(res.success, false);
  assert.match(res.message!, /doesn't add up/);
  assert.equal(await S.prisma.bankLine.count(), 0);
});

test("a statement in another currency is refused for the account", async () => {
  as.staff();
  assert.match((await upload(S.usd.id, 91778075)).message!, /This statement is in VND/);
});

test("import adds the lines once; importing the same statement again adds nothing", async () => {
  as.staff();
  const first = await upload(S.vnd.id, 91778075);
  assert.deepEqual([first.success, first.added, first.skipped], [true, 3, 0]);
  const again = await upload(S.vnd.id, 91778075);
  assert.deepEqual([again.success, again.added, again.skipped], [true, 0, 3]);
  const st = await S.prisma.bankStatement.findFirstOrThrow();
  assert.equal(st.periodFrom.toISOString().slice(0, 10), "2026-06-17");
});

test("matching: same account and direction, never more than the line; unmatch frees it", async () => {
  as.admin();
  const line = await S.prisma.bankLine.findFirstOrThrow({ where: { amount: -8221200 } });
  await L.createTransaction(fd({ type: "EXPENSE", amount: 8221200, currency: "VND", date: "2026-06-21", accountId: S.vnd.id, description: "Bill 12" }));
  await L.createTransaction(fd({ type: "EXPENSE", amount: 9000000, currency: "VND", date: "2026-06-21", accountId: S.vnd.id, description: "too big" }));
  await L.createTransaction(fd({ type: "EXPENSE", amount: 8221200, currency: "VND", date: "2026-06-21", accountId: S.cash.id, description: "other account" }));
  await L.createTransaction(fd({ type: "INCOME", amount: 8221200, currency: "VND", date: "2026-06-21", accountId: S.vnd.id, description: "wrong way" }));
  const id = async (d: string) => (await S.prisma.transaction.findFirstOrThrow({ where: { description: d } })).id;
  assert.match((await B.matchLine(line.id, [await id("too big")])).message!, /more than the bank line/);
  assert.match((await B.matchLine(line.id, [await id("other account")])).message!, /must be too/);
  assert.match((await B.matchLine(line.id, [await id("wrong way")])).message!, /money out/);
  assert.equal((await B.matchLine(line.id, [await id("Bill 12")])).success, true);
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: await id("Bill 12") } })).bankLineId, line.id);
  // An import with matched lines can't be undone; staff can't undo imports at all.
  const st = await S.prisma.bankStatement.findFirstOrThrow();
  as.staff();
  await assert.rejects(() => B.deleteStatement(st.id), /Unauthorized/);
  as.admin();
  assert.match((await B.deleteStatement(st.id)).message!, /unmatch them first/);
  await B.unmatchEntry(await id("Bill 12"));
  assert.equal((await S.prisma.transaction.findUniqueOrThrow({ where: { id: await id("Bill 12") } })).bankLineId, null);
});

test("an entry created from a bank line must fit it", async () => {
  as.admin();
  const line = await S.prisma.bankLine.findFirstOrThrow({ where: { amount: -725 } });
  assert.match((await L.createTransaction(fd({ type: "EXPENSE", amount: 800, currency: "VND", date: "2026-06-21", accountId: S.vnd.id, bankLineId: line.id, description: "fee" }))).message!, /more than the bank line/);
  assert.equal((await L.createTransaction(fd({ type: "EXPENSE", amount: 725, currency: "VND", date: "2026-06-21", accountId: S.vnd.id, bankLineId: line.id, description: "fee" }))).success, true);
});

const receipt = (extra: Record<string, string | number | File> = {}) =>
  fd({ provider: "Google Workspace", receiptDate: "2026-09-01", amount: 88, currency: "USD", receiptNumber: "5668824704", payer: "COMPANY", ...extra });

test("cost register: a receipt is registered once", async () => {
  as.staff();
  assert.equal((await C.saveCostItem(null, receipt({ files: new File([new Uint8Array(10)], "invoice.pdf") }))).success, true);
  assert.match((await C.saveCostItem(null, receipt())).message!, /Already in the register/);
  assert.equal((await C.saveCostItem(null, fd({ provider: "Contabo", receiptDate: "2026-07-05", amount: 50, currency: "EUR" }))).success, true);
  assert.match((await C.saveCostItem(null, fd({ provider: "Contabo", receiptDate: "2026-07-05", amount: 50, currency: "EUR" }))).message!, /Already/);
});

test("cost register: converts to one expense, shares its receipt, and returns to pending if that expense is deleted", async () => {
  as.admin();
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Google Workspace" }, include: { attachments: true } });
  const expense = fd({ type: "EXPENSE", amount: 88, currency: "USD", date: "2026-09-01", accountId: S.vnd.id, rateMode: "BANK", vndAmount: 2299704, description: "Google Workspace", costItemId: item.id });
  assert.equal((await L.createTransaction(expense)).success, true);
  const t = await S.prisma.transaction.findFirstOrThrow({ where: { description: "Google Workspace" } });
  const after = await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id }, include: { attachments: true } });
  assert.deepEqual([after.status, after.transactionId, after.attachments[0].transactionId], ["CONVERTED", t.id, t.id]);
  assert.match((await L.createTransaction(fd({ type: "EXPENSE", amount: 88, currency: "USD", date: "2026-09-01", accountId: S.vnd.id, rateMode: "BANK", vndAmount: 1, description: "dup", costItemId: item.id }))).message!, /already in the ledger/);
  // The shared receipt can't be removed from the expense; the evidence stays as recorded once converted.
  assert.equal((await L.deleteAttachment(after.attachments[0].id)).success, false);
  await C.saveCostItem(item.id, receipt({ amount: 1, reviewNote: "business use confirmed" }));
  const edited = await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id } });
  assert.deepEqual([edited.amount, edited.reviewNote], [88, "business use confirmed"]);

  await L.deleteTransaction(t.id);
  const back = await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id }, include: { attachments: true } });
  assert.deepEqual([back.status, back.transactionId, back.attachments.length, back.attachments[0].transactionId], ["PENDING", null, 1, null]);
  assert.ok(existsSync(join(process.env.UPLOAD_DIR!, back.attachments[0].filePath)), "the receipt file is kept");
});

test("cost register: link an existing expense instead of duplicating; dismissing is the owner's call", async () => {
  as.admin();
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Contabo" } });
  await L.createTransaction(fd({ type: "EXPENSE", amount: 1500000, currency: "VND", date: "2026-07-05", accountId: S.owner.id, description: "Contabo VPS" }));
  const t = await S.prisma.transaction.findFirstOrThrow({ where: { description: "Contabo VPS" } });
  as.staff();
  await assert.rejects(() => C.dismissCostItem(item.id, "personal"), /Unauthorized/);
  assert.equal((await C.linkCostItem(item.id, t.id)).success, true);
  assert.equal((await S.prisma.costItem.findUniqueOrThrow({ where: { id: item.id } })).status, "CONVERTED");
  as.admin();
  await C.saveCostItem(null, fd({ provider: "xAI", receiptDate: "2026-08-26", amount: 0, currency: "USD" }));
  const x = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "xAI" } });
  assert.equal((await C.linkCostItem(x.id, t.id)).success, false); // that expense already comes from another item
  assert.equal((await C.dismissCostItem(x.id, " ")).success, false);
  assert.equal((await C.dismissCostItem(x.id, "zero-due statement")).success, true);
  assert.equal((await S.prisma.costItem.findUniqueOrThrow({ where: { id: x.id } })).status, "DISMISSED");
});
