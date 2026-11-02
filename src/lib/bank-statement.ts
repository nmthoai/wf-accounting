import * as xlsx from "xlsx";
import { inflateRawSync } from "node:zlib";
import { translator, type Translate } from "@/i18n/server";

// Reads a bank statement export (XLSX/CSV). The transaction table is found by
// its column headers (Vietnamese or English), so the column order doesn't
// matter. Nothing is guessed about money: the caller only saves a file whose
// opening + inflows − outflows equals its closing balance.

export type Field = "txnDate" | "postingDate" | "reference" | "debit" | "credit" | "amount" | "balance" | "counterparty" | "description";

export type StatementLine = {
  row: number; // spreadsheet row (1-based)
  txnDate: Date;
  postingDate: Date | null;
  reference: string | null;
  amount: number; // + money in, − money out
  balance: number | null;
  counterparty: string | null;
  description: string | null;
};

export type ParsedStatement = {
  sheet: string;
  columns: Partial<Record<Field, string>>; // field → header as written in the file
  lines: StatementLine[]; // oldest first
  opening: number | null; // as stated, else derived from the running balance
  closing: number | null;
  periodFrom: Date | null; // the statement period as printed, when it holds every line
  periodTo: Date | null;
  currency: string | null; // when the file names exactly one currency
  // Every figure the file shows for each balance — stated and from the running
  // balance (they differ when the file disagrees with itself).
  shown: { opening: number[]; closing: number[] };
  warnings: string[];
};

// Lower-case, no accents, single spaces.
const norm = (v: unknown) =>
  String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Checked in this order; a column belongs to the first field that names it.
// "=x" must be the whole header; other keys may appear inside it.
const HEADERS: [Field, string[]][] = [
  ["postingDate", ["ngay hach toan", "posting date", "ngay hieu luc", "value date", "effective date", "booking date"]],
  ["txnDate", ["ngay giao dich", "transaction date", "ngay gd", "trans date", "ngay thuc hien", "thoi gian giao dich", "=ngay", "=date"]],
  ["debit", ["ghi no", "phat sinh no", "so tien no", "tien ra", "rut ra", "debit", "withdrawal", "=no", "=chi"]],
  ["credit", ["ghi co", "phat sinh co", "so tien co", "tien vao", "gui vao", "credit", "=co", "=thu"]],
  ["balance", ["so du", "balance"]],
  ["reference", ["so tham chieu", "ma giao dich", "so but toan", "ma gd", "so gd", "so chung tu", "so ct", "reference", "ref", "transaction no", "trace"]],
  ["counterparty", ["doi ung", "doi tac", "ben nhan", "ben chuyen", "nguoi chuyen", "nguoi nhan", "counterparty", "beneficiary", "remitter"]],
  ["description", ["noi dung", "dien giai", "mo ta", "description", "details", "remark", "narrative"]],
  ["amount", ["so tien", "amount"]],
];
// These may span several columns (e.g. account name + account number).
const JOINED: Field[] = ["counterparty", "description"];

const names = (h: string, key: string) => (key.startsWith("=") ? h === key.slice(1) : ` ${h} `.includes(` ${key} `));

function assign(labels: string[]) {
  const cols: Partial<Record<Field, number[]>> = {};
  labels.forEach((h, c) => {
    if (!h) return;
    const hit = HEADERS.find(([, keys]) => keys.some((k) => names(h, k)));
    if (!hit) return;
    const [field] = hit;
    if (!cols[field]) cols[field] = [c];
    else if (JOINED.includes(field)) cols[field]!.push(c);
  });
  return cols;
}

export function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim().replace(/\s|VND|USD|EUR|đ|₫/gi, "");
  if (!/^[-+(]?[\d.,]+\)?$/.test(s) || !/\d/.test(s)) return null;
  const neg = s.startsWith("-") || s.startsWith("(");
  s = s.replace(/[-+()]/g, "");
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  let dec = "";
  if (comma >= 0 && dot >= 0) dec = comma > dot ? "," : ".";
  else if (comma >= 0 || dot >= 0) {
    const sep = comma >= 0 ? "," : ".";
    const parts = s.split(sep);
    // A single separator followed by exactly three digits groups thousands.
    if (parts.length === 2 && parts[1].length !== 3) dec = sep;
  }
  s = dec ? s.split(dec === "," ? "." : ",").join("").replace(dec, ".") : s.replace(/[.,]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

function utc(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null; // rejects 31/02
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const year = (y: string) => (y.length === 2 ? 2000 + +y : +y); // "26" is 2026

// date1904: the workbook counts serial days from 1904 (old Mac Excel).
export function toDate(v: unknown, date1904 = false): Date | null {
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return null; // Excel serial day, 1954–2119
    const d = xlsx.SSF.parse_date_code(v, { date1904 });
    return d ? utc(d.y, d.m, d.d) : null;
  }
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/); // dd/mm/yyyy or dd/mm/yy — day first, as Vietnamese banks write it
  if (m) return utc(year(m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (m) return utc(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\s/.-]+([a-z]{3,9})\.?[\s/.,-]+(\d{4}|\d{2})(?!\d)/i); // 02-Aug-2026, 2 Aug 26
  const month = m ? MONTHS.findIndex((name) => name.startsWith(m![2].toLowerCase())) : -1;
  if (m && month >= 0) return utc(year(m[3]), month + 1, +m[1]);
  return null;
}

// The header row (or a two-row header, e.g. "Phát sinh" over "Nợ" | "Có").
function findHeader(rows: unknown[][]) {
  let best: { start: number; shown: string[]; cols: Partial<Record<Field, number[]>>; score: number } | null = null;
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    for (const span of [1, 2]) {
      if (r + span > rows.length) continue;
      const width = Math.max(rows[r].length, span === 2 ? rows[r + 1].length : 0);
      let carry = "";
      const shown: string[] = []; // as written in the file
      for (let c = 0; c < width; c++) {
        const top = String(rows[r][c] ?? "").trim();
        if (top) carry = top; // a merged group header covers the empty cells to its right
        const sub = span === 2 ? String(rows[r + 1][c] ?? "").trim() : "";
        shown.push(span === 2 ? [top || (sub ? carry : ""), sub].filter(Boolean).join(" ") : top);
      }
      const cols = assign(shown.map(norm));
      const usable = (cols.txnDate || cols.postingDate) && (cols.amount || (cols.debit && cols.credit));
      const score = Object.keys(cols).length;
      if (usable && (!best || score > best.score)) best = { start: r + span, shown, cols, score };
    }
  }
  return best;
}

// "Số dư cuối kỳ/ Closing Balance: 53,636,145 VND (Bằng chữ: …)" — the first
// amount after the colon — or "Số dư đầu kỳ 0", or the label with the amount to its right.
function labelled(rows: unknown[][], keys: string[]) {
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (!keys.some((k) => norm(row[c]).includes(k))) continue;
      const cell = String(row[c]);
      const own = cell.split(":").slice(1).join(":").match(/-?\(?\d[\d.,]*\)?/)
        ?? cell.match(/\s(-?\(?[\d.,]*\d\)?)\s*(VND|USD|EUR|đ|₫)?\s*$/i)?.slice(1);
      if (own) { const n = toNum(own[0]); if (n !== null) return n; }
      for (let k = c + 1; k < row.length; k++) { const n = toNum(row[k]); if (n !== null) return n; }
    }
  }
  return null;
}

// "Từ ngày/From: 01/05/2026 Đến ngày/To: 04/10/2026" above the table.
function statedPeriod(rows: unknown[][]) {
  for (const row of rows) for (const v of row) {
    const s = String(v);
    if (!/\b(tu ngay|from)\b/.test(norm(s))) continue;
    const [from, to] = [...s.matchAll(/\d{1,2}\/\d{1,2}\/\d{4}/g)].map((m) => toDate(m[0]));
    if (from && to && from <= to) return { from, to };
  }
  return null;
}

const OPENING = ["so du dau ky", "so du dau", "opening balance", "beginning balance", "balance brought forward"];
const CLOSING = ["so du cuoi ky", "so du cuoi", "closing balance", "ending balance"];
const EPS = 0.005;

function readSheet(name: string, rows: unknown[][], t: Translate, date1904: boolean): ParsedStatement | null {
  const head = findHeader(rows);
  if (!head) return null;
  const { cols } = head;
  const first = (f: Field) => (cols[f] ? cols[f]![0] : undefined);
  const text = (row: unknown[], f: Field) => {
    const v = (cols[f] ?? []).map((c) => String(row[c] ?? "").trim()).filter(Boolean).join(" · ");
    return v || null;
  };

  let lines: StatementLine[] = [];
  for (let i = head.start; i < rows.length; i++) {
    const row = rows[i];
    const txnDate = toDate(row[first("txnDate") ?? first("postingDate")!], date1904);
    if (!txnDate) continue; // totals, notes and blank rows have no date
    const amount = cols.amount
      ? toNum(row[first("amount")!]) ?? 0
      : Math.abs(toNum(row[first("credit")!]) ?? 0) - Math.abs(toNum(row[first("debit")!]) ?? 0);
    if (Math.abs(amount) < EPS) continue;
    lines.push({
      row: i + 1,
      txnDate,
      postingDate: cols.postingDate && cols.txnDate ? toDate(row[first("postingDate")!], date1904) : null,
      reference: text(row, "reference"),
      amount: Math.round(amount * 100) / 100,
      balance: cols.balance ? toNum(row[first("balance")!]) : null,
      counterparty: text(row, "counterparty"),
      description: text(row, "description"),
    });
  }
  if (lines.length === 0) return null;

  const warnings: string[] = [];
  // Oldest first. With one day only, the running balance tells the order.
  const flows = (ls: StatementLine[]) => ls.every((l, i) => i === 0 || l.balance === null || ls[i - 1].balance === null || Math.abs(ls[i - 1].balance! + l.amount - l.balance!) < EPS);
  const last = lines[lines.length - 1];
  if (lines[0].txnDate > last.txnDate || (+lines[0].txnDate === +last.txnDate && !flows(lines) && flows([...lines].reverse()))) lines = lines.reverse();
  const ordered = flows(lines);
  if (!ordered) warnings.push(t("statement.warnings.order"));

  const derivedOpening = lines[0].balance !== null ? Math.round((lines[0].balance - lines[0].amount) * 100) / 100 : null;
  const derivedClosing = lines[lines.length - 1].balance;
  const statedOpening = labelled(rows, OPENING);
  const statedClosing = labelled(rows, CLOSING);
  if (statedOpening !== null && derivedOpening !== null && Math.abs(statedOpening - derivedOpening) > EPS) warnings.push(t("statement.warnings.opening"));
  if (statedClosing !== null && derivedClosing !== null && Math.abs(statedClosing - derivedClosing) > EPS) warnings.push(t("statement.warnings.closing"));

  const stated = statedPeriod(rows.slice(0, head.start));
  const inPeriod = stated && lines.every((l) => l.txnDate >= stated.from && l.txnDate <= stated.to);

  const found = new Set<string>();
  for (const row of rows.slice(0, head.start)) for (const v of row) for (const c of ["VND", "USD", "EUR"]) if (new RegExp(`\\b${c}\\b`).test(String(v))) found.add(c);

  const columns: Partial<Record<Field, string>> = {};
  for (const [f, cs] of Object.entries(cols) as [Field, number[]][]) columns[f] = cs.map((c) => head.shown[c].replace(/\s+/g, " ")).join(" + ");

  return {
    sheet: name,
    columns,
    lines,
    opening: statedOpening ?? derivedOpening,
    closing: statedClosing ?? derivedClosing,
    periodFrom: inPeriod ? stated.from : null,
    periodTo: inPeriod ? stated.to : null,
    currency: found.size === 1 ? [...found][0] : null,
    shown: {
      // The running balance counts only when it flows; out of order it proves nothing.
      opening: [statedOpening, ordered ? derivedOpening : null].filter((n): n is number => n !== null),
      closing: [statedClosing, ordered ? derivedClosing : null].filter((n): n is number => n !== null),
    },
    warnings,
  };
}

// Uploads are untrusted: a file may declare an enormous sheet or carry huge
// cells. Read at most this much — far beyond any real statement.
const MAX_ROWS = 5000, MAX_COLS = 40, MAX_SHEETS = 5, MAX_CELL = 300;

// An .xlsx is a zip, and a small zip can unpack to gigabytes — SheetJS unpacks
// every part before sheetRows applies. Real statements unpack to a few MB.
const MAX_PART = 20 * 1024 * 1024, MAX_UNPACKED = 50 * 1024 * 1024;

// A ZIP64 extended-information field (header id 0x0001) in an extra field.
function hasZip64(extra: Buffer) {
  for (let i = 0; i + 4 <= extra.length; i += 4 + extra.readUInt16LE(i + 2)) if (extra.readUInt16LE(i) === 1) return true;
  return false;
}

// Unpacks the zip the way SheetJS will read it — every central-directory entry,
// from its local header — stopping as soon as one part or the total grows past
// the limit. A declared size counts too: SheetJS allocates it up front, so a
// tiny part claiming 900 MB is refused like a real one. ZIP64 never appears in
// a statement and is refused outright.
function zipProblem(buf: Buffer): "tooBig" | "unreadable" | null {
  let end = buf.length - 4;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || end + 20 > buf.length) return "unreadable";
  const count = buf.readUInt16LE(end + 8);
  let p = buf.readUInt32LE(end + 16);
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length) return "unreadable";
    const at = buf.readUInt32LE(p + 42);
    const cdSize = buf.readUInt32LE(p + 24);
    const cdNameLen = buf.readUInt16LE(p + 28), cdExtraLen = buf.readUInt16LE(p + 30);
    if (p + 46 + cdNameLen + cdExtraLen > buf.length) return "unreadable";
    if (hasZip64(buf.subarray(p + 46 + cdNameLen, p + 46 + cdNameLen + cdExtraLen))) return "tooBig";
    p += 46 + cdNameLen + cdExtraLen + buf.readUInt16LE(p + 32);
    if (at + 30 > buf.length) return "unreadable";
    const method = buf.readUInt16LE(at + 8);
    const nameLen = buf.readUInt16LE(at + 26), extraLen = buf.readUInt16LE(at + 28);
    const start = at + 30 + nameLen + extraLen;
    if (start > buf.length) return "unreadable";
    if (hasZip64(buf.subarray(at + 30 + nameLen, start))) return "tooBig";
    const declared = Math.max(cdSize, buf.readUInt32LE(at + 22));
    if (declared > MAX_PART) return "tooBig";
    if (method === 0) {
      total += Math.max(declared, Math.min(buf.readUInt32LE(at + 18), buf.length - start));
    } else if (method === 8) {
      try {
        total += Math.max(declared, inflateRawSync(buf.subarray(start), { maxOutputLength: Math.max(1, Math.min(MAX_PART, MAX_UNPACKED - total)) }).length);
      } catch (e) {
        return e instanceof RangeError ? "tooBig" : "unreadable";
      }
    } // SheetJS refuses any other method itself
    if (total > MAX_UNPACKED) return "tooBig";
  }
  return null;
}

// Messages (errors, warnings) come from `t`, the "bank" translator — English
// unless the caller passes the user's.
export function parseStatement(buf: Buffer, t: Translate = translator("en", "bank")): ParsedStatement | { error: string } {
  let wb: xlsx.WorkBook;
  const unreadable = { error: t("statement.unreadable") };
  try {
    // .xlsx is a zip ("PK"), .xls an OLE file; anything else is text (CSV), read as
    // UTF-8 so Vietnamese headers survive. raw keeps CSV cells as text, so
    // "02/08/2026" is read day-first below rather than as 8 February.
    const zip = buf.subarray(0, 2).toString("latin1") === "PK";
    const binary = zip || buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
    const bomb = zip ? zipProblem(buf) : null;
    if (bomb) return bomb === "tooBig" ? { error: t("statement.tooBig") } : unreadable;
    const text = binary ? "" : buf.toString("utf8").replace(/^\uFEFF/, "");
    if (!binary && /^\s*(<|ID;|\{\\rtf)/.test(text)) return unreadable; // HTML/XML/SYLK/RTF posing as a statement
    wb = binary
      ? xlsx.read(buf, { type: "buffer", raw: true, sheetRows: MAX_ROWS })
      : xlsx.read(text, { type: "string", raw: true, sheetRows: MAX_ROWS });
  } catch {
    return unreadable;
  }
  const date1904 = !!wb.Workbook?.WBProps?.date1904;
  // The sheet with the most transaction lines.
  let best: ParsedStatement | null = null;
  for (const name of wb.SheetNames.slice(0, MAX_SHEETS)) {
    const ws = wb.Sheets[name];
    if (!ws?.["!ref"]) continue;
    const range = xlsx.utils.decode_range(ws["!ref"]); // declared by the file — never trusted
    range.e.r = Math.min(range.e.r, range.s.r + MAX_ROWS);
    range.e.c = Math.min(range.e.c, range.s.c + MAX_COLS);
    const rows = xlsx.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", range })
      .map((r) => r.map((v) => (typeof v === "string" ? v.slice(0, MAX_CELL) : v)));
    const parsed = readSheet(name, rows, t, date1904);
    if (parsed && (!best || parsed.lines.length > best.lines.length)) best = parsed;
  }
  if (!best) {
    return { error: t("statement.noTable") };
  }
  return best;
}

// Account + reference + date + amount; a repeat of the same line within one
// file gets a number, so re-importing the same file adds nothing.
export function dedupeKeys(lines: StatementLine[]) {
  const seen = new Map<string, number>();
  return lines.map((l) => {
    const base = `${l.reference ?? ""}|${l.txnDate.toISOString().slice(0, 10)}|${l.amount.toFixed(2)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  });
}
