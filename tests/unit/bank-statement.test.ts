import { test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";
import { parseStatement, dedupeKeys, toNum, toDate } from "@/lib/bank-statement";
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

// Synthetic statements only — never real bank data in tests.
const book = (rows: unknown[][], sheet = "Sheet1") => {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), sheet);
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const lines = [
  // date, posting, ref, debit, credit
  ["17/06/2026 10:19:59", "17/06/2026", "FT001", 0, 100000000],
  ["17/06/2026 10:40:02", "17/06/2026", "FT002", 100000000, 0],
  ["21/06/2026 08:00:00", "22/06/2026", "FT003", 0, 50000000],
  ["02/08/2026 09:00:00", "02/08/2026", "FT004", 1197000, 0],
] as const;
const ok = (p: ReturnType<typeof parseStatement>) => {
  if ("error" in p) throw new Error(p.error);
  return p;
};

test("MB BIZ layout: bilingual headers, opening/closing in label cells, period, currency", () => {
  const p = ok(parseStatement(book([
    ["", "", "SỔ PHỤ CHI TIẾT KIÊM BÁO NỢ/BÁO CÓ"],
    ["", "", "Từ ngày/From: 01/05/2026 Đến ngày/To: 04/10/2026"],
    ["Tài khoản/Account No: 123456789"], ["Loại tiền/Currency: VND"],
    ["Số dư đầu kỳ/ Opening Balance: 0 VND"],
    ["Ngày giao\ndịch\nTransaction Date", "Ngày hạch\ntoán\nAccounting Date", "Số bút toán\nTransaction No", "Phát sinh nợ\nDebit", "Phát sinh có\nCredit", "Nội dung\nDetails", "Đơn vị thụ hưởng/Đơn vị chuyển\nBeneficiary/Applicant", "Tài khoản\nAccount", "Ngân hàng đối tác\nRemitter Bank"],
    ...lines.map(([d, p, r, dr, cr]) => [d, p, r, dr || "", cr || "", "transfer", "Someone", "999", "Bank"]),
    ["Tổng phát sinh trong kỳ/Total", "", "", 101197000, 150000000],
    ["Số dư cuối kỳ/ Closing Balance: 48,803,000 VND (Bằng chữ: Bốn mươi tám triệu...)"],
  ], "Thông tin giao dịch")));
  assert.equal(p.lines.length, 4);
  assert.equal(p.opening, 0);
  assert.equal(p.closing, 48803000);
  assert.equal(p.currency, "VND");
  assert.equal(p.periodFrom?.toISOString().slice(0, 10), "2026-05-01");
  assert.equal(p.periodTo?.toISOString().slice(0, 10), "2026-10-04");
  assert.equal(p.lines[0].txnDate.toISOString().slice(0, 10), "2026-06-17"); // day first, as the bank prints it
  assert.equal(p.lines[2].postingDate?.toISOString().slice(0, 10), "2026-06-22");
  assert.equal(p.lines[3].amount, -1197000);
  assert.equal(p.lines[0].counterparty, "Someone · Bank"); // account numbers are not taken in
  const inflow = p.lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const outflow = -p.lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  assert.equal(p.opening! + inflow - outflow, p.closing);
});

test("newest-first, two-row header with a merged group, text amounts, no stated balances", () => {
  let bal = 0;
  const rows = lines.map(([d, , r, dr, cr]) => { bal += cr - dr; return [d.slice(0, 10), r, "x", dr ? dr.toLocaleString("vi-VN") : "", cr ? cr.toLocaleString("vi-VN") : "", bal.toLocaleString("vi-VN")]; });
  const p = ok(parseStatement(book([["Ngày GD", "Số CT", "Diễn giải", "Phát sinh", "", "Số dư"], ["", "", "", "Nợ", "Có", ""], ...rows.reverse()])));
  assert.equal(p.lines.length, 4);
  assert.equal(p.lines[0].reference, "FT001"); // put back in date order
  assert.equal(p.opening, 0);
  assert.equal(p.closing, 48803000);
  assert.deepEqual(p.warnings, []);
});

test("English layout with one signed amount column", () => {
  const p = ok(parseStatement(book([
    ["Opening balance: 10.50"], ["Transaction date", "Reference", "Amount", "Description"],
    ["2026-08-06", "R1", -5.5, "fee"], ["2026-08-06", "R2", 1972.75, "receipt"], [], ["Closing balance", 1977.75],
  ])));
  assert.equal(p.lines.length, 2);
  assert.equal(p.opening, 10.5);
  assert.equal(p.closing, 1977.75);
});

test("CSV is read as UTF-8 text, dates day-first", () => {
  const csv = "Ngày giao dịch,Số bút toán,Ghi nợ,Ghi có\n02/08/2026,A1,,4674\n06/08/2026,A2,5.50,\n";
  const p = ok(parseStatement(Buffer.from(csv, "utf8")));
  assert.equal(p.lines.length, 2);
  assert.equal(p.lines[0].txnDate.toISOString().slice(0, 10), "2026-08-02");
  assert.equal(p.lines[1].amount, -5.5);
});

test("a file with no transaction table is refused with a clear message", () => {
  const p = parseStatement(book([["hello"], ["world"]]));
  assert.ok("error" in p && /No transaction table/.test(p.error));
  const junk = parseStatement(Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])); // looks like a zip, isn't
  assert.ok("error" in junk);
});

test("dedupe keys: same reference/date/amount repeated in one file get numbered", () => {
  const d = new Date("2026-06-24T00:00:00Z");
  const keys = dedupeKeys([
    { row: 1, txnDate: d, postingDate: null, reference: "MB", amount: -1197000, balance: null, counterparty: null, description: null },
    { row: 2, txnDate: d, postingDate: null, reference: "MB", amount: -1197000, balance: null, counterparty: null, description: null },
    { row: 3, txnDate: d, postingDate: null, reference: "MB", amount: -249480, balance: null, counterparty: null, description: null },
  ]);
  assert.equal(new Set(keys).size, 3);
  assert.equal(keys[1], `${keys[0]}#2`);
});

test("numbers: thousands and decimal separators, signs, rejects dates and words", () => {
  const cases: [unknown, number | null][] = [
    ["1,972.75", 1972.75], ["1.972,75", 1972.75], ["100.000.000", 100000000], ["4,674", 4674], ["5,5", 5.5],
    ["(1,000)", -1000], ["-5.5", -5.5], ["+3,000.00", 3000], ["53.636.145 VND", 53636145], [435.75, 435.75],
    ["01/05/2026", null], ["", null], ["abc", null],
  ];
  for (const [v, want] of cases) assert.equal(toNum(v), want, `toNum(${JSON.stringify(v)})`);
});

test("dates: day-first text, ISO, Excel serials; impossible dates refused", () => {
  const d = (v: unknown) => toDate(v)?.toISOString().slice(0, 10) ?? null;
  assert.equal(d("16/06/2026"), "2026-06-16");
  assert.equal(d("2/8/2026 10:31:05"), "2026-08-02");
  assert.equal(d("2026-09-29"), "2026-09-29");
  assert.equal(d(46189), "2026-06-16");
  assert.equal(d("31/02/2026"), null);
  assert.equal(d("Tổng cộng"), null);
  assert.equal(d(3), null);
});

test("hostile files: a declared giant sheet and a huge cell are read quickly, markup is refused", () => {
  // A small real workbook whose sheet XML then claims 17 billion cells — as an attacker would craft it.
  const zip = unzipSync(new Uint8Array(book([["Ngày giao dịch", "Ghi nợ", "Ghi có"], ["17/06/2026", "", 5]], "S")));
  const sheet = strFromU8(zip["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<dimension ref="A1:C2"\/>/);
  zip["xl/worksheets/sheet1.xml"] = strToU8(sheet.replace(/<dimension ref="A1:C2"\/>/, '<dimension ref="A1:XFD1048576"/>'));
  let t = Date.now();
  const p = parseStatement(Buffer.from(zipSync(zip)));
  assert.ok(Date.now() - t < 3000, `giant sheet took ${Date.now() - t} ms`);
  assert.ok(!("error" in p) && p.lines.length === 1);

  const csv = `So du dau ky 1${" ".repeat(40000)}x\nNgày giao dịch,Ghi nợ,Ghi có\n17/06/2026,,5\n`;
  t = Date.now();
  parseStatement(Buffer.from(csv, "utf8"));
  assert.ok(Date.now() - t < 1000, `long cell took ${Date.now() - t} ms`);

  for (const markup of ["<html><table><tr><td>x</td></tr></table></html>", "ID;PWXL\nC;X1;Y1;K1\n"]) {
    assert.ok("error" in parseStatement(Buffer.from(markup)));
  }
});
