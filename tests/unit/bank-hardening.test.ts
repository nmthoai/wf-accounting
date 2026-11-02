import { test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { parseStatement, toDate } from "@/lib/bank-statement";

// Synthetic statements only — never real bank data in tests.
const book = (rows: unknown[][], date1904 = false) => {
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(rows), "S");
  if (date1904) wb.Workbook = { ...wb.Workbook, WBProps: { date1904: true } };
  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
};
const ok = (p: ReturnType<typeof parseStatement>) => {
  if ("error" in p) throw new Error(p.error);
  return p;
};
const day = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? null;

// A real workbook (so SheetJS would happily read it) plus padding parts that
// deflate to almost nothing and unpack to `mb` MB each.
function bomb(parts: number, mb: number) {
  const files = unzipSync(new Uint8Array(book([["Ngày giao dịch", "Ghi nợ", "Ghi có"], ["17/06/2026", "", 5]])));
  for (let i = 0; i < parts; i++) files[`xl/media/pad${i}.xml`] = new Uint8Array(mb * 1024 * 1024).fill(0x20);
  return Buffer.from(zipSync(files, { level: 9 }));
}

// Time and memory spent reading `buf`; a guard must stop long before SheetJS
// unpacks everything (the unguarded read of such a file reached 2.7 GB).
function measure(buf: Buffer) {
  globalThis.gc?.();
  const rss = process.memoryUsage().rss, t = Date.now();
  const res = parseStatement(buf);
  return { res, ms: Date.now() - t, grewMB: (process.memoryUsage().rss - rss) / 1048576 };
}

test("zip bomb: one part unpacking past 20 MB is refused fast, without unpacking it", () => {
  const buf = bomb(1, 64);
  assert.ok(buf.length < 400_000, `bomb is ${buf.length} bytes`);
  const { res, ms, grewMB } = measure(buf);
  assert.ok("error" in res && /unpacks to far more data/.test(res.error), JSON.stringify(res));
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.ok(grewMB < 150, `memory grew ${grewMB.toFixed(0)} MB`);
});

test("zip bomb: parts each under the limit but past 50 MB together are refused", () => {
  const { res, ms } = measure(bomb(4, 15));
  assert.ok("error" in res && /unpacks to far more data/.test(res.error), JSON.stringify(res));
  assert.ok(ms < 2000, `took ${ms} ms`);
});

test("zip bomb: the central directory listing one deflated part many times counts every copy", () => {
  // SheetJS reads entries from the central directory, so several entries may
  // point at the same local data — a file-by-file walk would count it once.
  const buf = bomb(1, 15);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10), cdSize = buf.readUInt32LE(end + 12), cdStart = buf.readUInt32LE(end + 16);
  // Find the pad part's central-directory record and repeat it.
  let p = cdStart, rec: Buffer | null = null;
  for (let i = 0; i < count; i++) {
    const len = 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (buf.subarray(p + 46, p + 46 + buf.readUInt16LE(p + 28)).toString() === "xl/media/pad0.xml") rec = buf.subarray(p, p + len);
    p += len;
  }
  assert.ok(rec);
  const copies = 5;
  const eocd = Buffer.from(buf.subarray(end, end + 22));
  eocd.writeUInt16LE(count + copies, 8);
  eocd.writeUInt16LE(count + copies, 10);
  eocd.writeUInt32LE(cdSize + copies * rec.length, 12);
  const crafted = Buffer.concat([buf.subarray(0, cdStart + cdSize), ...Array(copies).fill(rec), eocd]);
  const { res } = measure(crafted);
  assert.ok("error" in res && /unpacks to far more data/.test(res.error), JSON.stringify(res));
});

test("an ordinary workbook with a few MB of parts still reads", () => {
  const files = unzipSync(new Uint8Array(book([["Ngày giao dịch", "Ghi nợ", "Ghi có"], ["17/06/2026", "", 5]])));
  files["docProps/custom.xml"] = strToU8("<x>" + " ".repeat(3 * 1024 * 1024) + "</x>");
  const p = ok(parseStatement(Buffer.from(zipSync(files))));
  assert.equal(p.lines.length, 1);
});

test("dates: two-digit years and month names", () => {
  const d = (v: unknown) => day(toDate(v));
  assert.equal(d("02/08/26"), "2026-08-02");
  assert.equal(d("2.8.26 10:31"), "2026-08-02");
  assert.equal(d("02-Aug-2026"), "2026-08-02");
  assert.equal(d("2 Aug 2026"), "2026-08-02");
  assert.equal(d("02-aug-26"), "2026-08-02");
  assert.equal(d("30 Sept 2026"), "2026-09-30");
  assert.equal(d("1 December, 2026"), "2026-12-01");
  assert.equal(d("31-Feb-2026"), null);
  assert.equal(d("02-Xyz-2026"), null);
  assert.equal(d("02/08/2026"), "2026-08-02"); // unchanged
});

test("a statement dated 02/08/26 or 02-Aug-2026 is read, not skipped", () => {
  const p = ok(parseStatement(book([
    ["Ngày giao dịch", "Số bút toán", "Ghi nợ", "Ghi có"],
    ["02/08/26", "A1", "", 4674], ["03-Aug-2026", "A2", 5.5, ""], ["4 Aug 2026", "A3", 1, ""],
  ])));
  assert.deepEqual(p.lines.map((l) => day(l.txnDate)), ["2026-08-02", "2026-08-03", "2026-08-04"]);
});

test("Excel serial dates follow the workbook's 1904 date system", () => {
  assert.equal(day(toDate(46189)), "2026-06-16");
  assert.equal(day(toDate(46189 - 1462, true)), "2026-06-16");
  const p = ok(parseStatement(book([["Ngày giao dịch", "Ghi nợ", "Ghi có"], [46189 - 1462, "", 5]], true)));
  assert.equal(day(p.lines[0].txnDate), "2026-06-16");
});

test("zip bomb: a part that only claims a huge size is refused (SheetJS would allocate the claim)", () => {
  const buf = Buffer.from(book([["Ngày giao dịch", "Ghi nợ", "Ghi có"], ["17/06/2026", "", 5]]));
  const name = Buffer.from("xl/worksheets/sheet1.xml");
  const claim = 300 * 1024 * 1024;
  let patched = 0;
  // Patch the size both headers declare, so SheetJS's own consistency check passes.
  for (let i = 0; i + 46 <= buf.length; i++) {
    const sig = buf.readUInt32LE(i);
    if (sig === 0x02014b50 && buf.subarray(i + 46, i + 46 + name.length).equals(name)) { buf.writeUInt32LE(claim, i + 24); patched++; }
    if (sig === 0x04034b50 && buf.subarray(i + 30, i + 30 + name.length).equals(name)) { buf.writeUInt32LE(claim, i + 22); patched++; }
  }
  assert.equal(patched, 2);
  const { res, grewMB } = measure(buf);
  assert.ok("error" in res && /unpacks/.test(res.error), JSON.stringify(res));
  assert.ok(grewMB < 150, `grew ${grewMB} MB`);
});
