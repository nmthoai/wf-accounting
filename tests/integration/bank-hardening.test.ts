// Statement import guards (size, account type, balances the file shows, the
// previous statement's closing) and who may match posted entries.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";

let B: typeof import("@/app/actions/bank");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  B = await import("@/app/actions/bank");
  S = await seed();
});

// A synthetic statement. `opening`/`closing` null: the file states none.
function statement(o: { from?: string; to?: string; opening?: number | null; closing?: number | null; lines: [string, string, number][]; currency?: string | null }) {
  const head: unknown[][] = [];
  if (o.from && o.to) head.push([`Từ ngày/From: ${o.from} Đến ngày/To: ${o.to}`]);
  if (o.currency !== null) head.push([`Loại tiền/Currency: ${o.currency ?? "VND"}`]);
  if (o.opening != null) head.push([`Số dư đầu kỳ/ Opening Balance: ${o.opening}`]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([
    ...head,
    ["Ngày giao dịch", "Số bút toán", "Phát sinh nợ", "Phát sinh có", "Nội dung"],
    ...o.lines.map(([d, ref, amt]) => [d, ref, amt < 0 ? -amt : "", amt > 0 ? amt : "", "synthetic"]),
    ...(o.closing != null ? [[`Số dư cuối kỳ/ Closing Balance: ${o.closing}`]] : []),
  ]), "S");
  return new File([new Uint8Array(xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer)], "st.xlsx");
}
const bank = (name: string) => S.prisma.account.create({ data: { name, type: "BANK", currency: "VND" } });

test("a statement file over 2 MB is refused before it is read", async () => {
  as.staff();
  const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv");
  const res = await B.previewStatement(fd({ file: big, accountId: S.vnd.id }));
  assert.equal(res.success, false);
  assert.match(res.success ? "" : res.message ?? "", /This file is 2\.0 MB; the limit is 2 MB/);
  assert.match((await B.importStatement(fd({ file: big, accountId: S.vnd.id, opening: 0, closing: 0 }))).message!, /limit is 2 MB/);
});

test("statements go into bank accounts only, even when the file names no currency", async () => {
  as.staff();
  const file = () => statement({ currency: null, opening: 0, closing: 5, lines: [["01/06/2026", "N1", 5]] });
  for (const acc of [S.cash, S.owner]) {
    const res = await B.previewStatement(fd({ file: file(), accountId: acc.id }));
    assert.match(res.success ? "" : res.message ?? "", new RegExp(`${acc.name} isn't a bank account`));
    assert.match((await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 0, closing: 5 }))).message!, /isn't a bank account/);
  }
  assert.equal(await S.prisma.bankLine.count({ where: { accountId: { in: [S.cash.id, S.owner.id] } } }), 0);
});

test("typed balances must be the ones the file shows", async () => {
  as.staff();
  const acc = await bank("MB typed");
  const file = () => statement({ opening: 1000, closing: 1500, lines: [["02/06/2026", "T1", 700], ["03/06/2026", "T2", -200]] });
  // Adds up (1,200 + 500 = 1,700) but isn't what the statement says.
  let res = await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 1200, closing: 1700 }));
  assert.match(res.message!, /The file's opening balance is 1\.000 ₫, not 1\.200 ₫/);
  res = await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 1000, closing: 1700 }));
  assert.match(res.message!, /The file's closing balance is 1\.500 ₫, not 1\.700 ₫/);
  assert.equal(await S.prisma.bankLine.count({ where: { accountId: acc.id } }), 0);
  res = await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 1000, closing: 1500 }));
  assert.deepEqual([res.success, res.added], [true, 2]);
  // Not a plain number: refused as missing.
  assert.match((await B.importStatement(fd({ file: file(), accountId: acc.id, opening: "1000abc", closing: 1500 }))).message!, /Enter the statement's opening and closing balance/);
});

test("a file showing no balances takes the typed ones, as long as they add up", async () => {
  as.staff();
  const acc = await bank("MB no balances");
  const file = () => statement({ opening: null, closing: null, lines: [["02/06/2026", "U1", 300]] });
  assert.match((await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 50, closing: 400 }))).message!, /doesn't add up/);
  assert.equal((await B.importStatement(fd({ file: file(), accountId: acc.id, opening: 50, closing: 350 }))).success, true);
});

test("the opening balance must equal the closing of the statement ending the day before", async () => {
  as.staff();
  const acc = await bank("MB continuity");
  const june = statement({ from: "01/06/2026", to: "30/06/2026", opening: 0, closing: 900, lines: [["10/06/2026", "J1", 900]] });
  assert.equal((await B.importStatement(fd({ file: june, accountId: acc.id, opening: 0, closing: 900 }))).success, true);

  const july = (opening: number) => statement({ from: "01/07/2026", to: "31/07/2026", opening, closing: opening + 100, lines: [["05/07/2026", "J2", 100]] });
  const preview = await B.previewStatement(fd({ file: july(800), accountId: acc.id }));
  assert.equal(preview.success, false);
  assert.match(preview.success ? "" : preview.message ?? "", /Opening balance 800 ₫ doesn't equal the previous statement's closing balance 900 ₫ on 2026-06-30/);
  assert.match((await B.importStatement(fd({ file: july(800), accountId: acc.id, opening: 800, closing: 900 }))).message!, /previous statement's closing balance 900 ₫/);
  assert.equal(await S.prisma.bankStatement.count({ where: { accountId: acc.id } }), 1);

  assert.equal((await B.previewStatement(fd({ file: july(900), accountId: acc.id }))).success, true);
  assert.equal((await B.importStatement(fd({ file: july(900), accountId: acc.id, opening: 900, closing: 1000 }))).success, true);
  // A gap (no August statement) or an overlap isn't checked: re-importing June adds nothing and is fine.
  const sept = statement({ from: "01/09/2026", to: "30/09/2026", opening: 4000, closing: 4100, lines: [["02/09/2026", "J3", 100]] });
  assert.equal((await B.importStatement(fd({ file: sept, accountId: acc.id, opening: 4000, closing: 4100 }))).success, true);
  const again = await B.importStatement(fd({ file: statement({ from: "01/06/2026", to: "30/06/2026", opening: 0, closing: 900, lines: [["10/06/2026", "J1", 900]] }), accountId: acc.id, opening: 0, closing: 900 }));
  assert.deepEqual([again.success, again.added], [true, 0]);
});

// ---- matching

function after<D extends object>(delegate: D, method: keyof D & string, meanwhile: () => Promise<unknown>) {
  const d = delegate as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const original = d[method];
  d[method] = async (...args: unknown[]) => {
    d[method] = original;
    const r = await original.apply(delegate, args);
    await meanwhile();
    return r;
  };
  return () => { d[method] = original; };
}
let n = 0;
async function line(amount: number) {
  const st = await S.prisma.bankStatement.create({
    data: { accountId: S.vnd.id, fileName: "m.xlsx", periodFrom: new Date("2026-10-01"), periodTo: new Date("2026-10-31"), openingBalance: 0, closingBalance: amount, inflows: amount, outflows: 0, lineCount: 1 },
  });
  return S.prisma.bankLine.create({ data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-10-10"), amount, locator: `row ${++n}`, dedupeKey: `h${n}` } });
}
const entry = (description: string, status: string, amount = 100000) =>
  S.prisma.transaction.create({ data: { type: "INCOME", date: new Date("2026-10-10"), amount, currency: "VND", accountId: S.vnd.id, status, description } });
const lineOf = async (id: string) => (await S.prisma.transaction.findUniqueOrThrow({ where: { id } })).bankLineId;

test("staff can't match a posted entry (only the owner can unmatch it); the owner can", async () => {
  const l = await line(100000);
  const e = await entry("posted receipt", "POSTED");
  as.staff();
  assert.match((await B.matchLine(l.id, [e.id])).message!, /That entry is posted — only the owner can match it/);
  assert.equal(await lineOf(e.id), null);
  as.admin();
  assert.equal((await B.matchLine(l.id, [e.id])).success, true);
  assert.equal(await lineOf(e.id), l.id);
});

test("an entry posted between staff's checks and the match isn't matched", async () => {
  const l = await line(100000);
  const e = await entry("reviewed receipt", "REVIEWED");
  as.staff();
  const restore = after(S.prisma.bankLine, "findUnique", () => S.prisma.transaction.update({ where: { id: e.id }, data: { status: "POSTED" } }));
  try {
    assert.match((await B.matchLine(l.id, [e.id])).message!, /only the owner can match it/);
  } finally { restore(); }
  assert.equal(await lineOf(e.id), null);
});

test("two matches at once can't explain more than the line", async () => {
  as.admin();
  const l = await line(100000);
  const [a, b] = [await entry("receipt a", "REVIEWED"), await entry("receipt b", "REVIEWED")];
  // b lands on the line after a's checks passed, as a concurrent match would.
  const restore = after(S.prisma.bankLine, "findUnique", () => S.prisma.transaction.update({ where: { id: b.id }, data: { bankLineId: l.id } }));
  try {
    const res = await B.matchLine(l.id, [a.id]);
    assert.equal(res.success, false);
    assert.match(res.message!, /more than the bank line/);
  } finally { restore(); }
  assert.equal(await lineOf(a.id), null);
  assert.equal(await S.prisma.changeLog.count({ where: { entityId: a.id, action: "MATCH" } }), 0);
});
