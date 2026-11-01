import { toVnd, isBooked } from "@/lib/money";
import { isProvisional } from "@/lib/pnl";

// Tax declarations as the company's accountant filed them: independent information,
// kept apart from the books and only compared with them, quarter by quarter (gap
// analysis). Figures are typed from the filed declaration; nothing here prepares a
// declaration or decides a tax treatment (rules WF-DEV-08, WF-DEV-10, §3.3). Flags are
// questions for the owner, never conclusions.

export const FORMS = ["01/GTGT", "05/KK-TNCN"] as const;
export type Form = (typeof FORMS)[number];
export const isForm = (v: string): v is Form => (FORMS as readonly string[]).includes(v);
// The form version the line codes follow (WF-DEV-11). Circular 89/2026 forms
// get their own entry here once the accountant files on them.
export const TEMPLATES = ["TT80/2021"] as const;

type Line = { code: string; unit: "vnd" | "people"; signed?: boolean };
// Line codes as printed on the TT80/2021 forms, in printed reading order.
export const LINES: Record<Form, Line[]> = {
  "01/GTGT": [
    "22", "23", "24", "23a", "24a", "25", "26", "27", "28", "29", "30", "31", "32", "33", "32a",
    "34", "35", "36", "37", "38", "39a", "40a", "40b", "40", "41", "42", "43",
  ].map((code) => ({ code, unit: "vnd" as const, signed: code === "36" })),
  "05/KK-TNCN": [
    ...["16", "17", "18", "19", "20"].map((code) => ({ code, unit: "people" as const })),
    ...["21", "22", "23", "24", "25", "25.1", "26", "27", "28", "29", "30", "31", "32"].map((code) => ({ code, unit: "vnd" as const })),
  ],
};
// The VAT return's table as printed: a value column and a VAT column, row by row.
export const VAT_ROWS: [string | null, string | null][] = [
  [null, "22"], ["23", "24"], ["23a", "24a"], [null, "25"], ["26", null], ["27", "28"], ["29", null], ["30", "31"], ["32", "33"],
  ["32a", null], ["34", "35"], [null, "36"], [null, "37"], [null, "38"], [null, "39a"], [null, "40a"], [null, "40b"], [null, "40"],
  [null, "41"], [null, "42"], [null, "43"],
];
// The message key for a form and line ("25.1" can't be a key segment).
export const formKey = (f: Form) => (f === "01/GTGT" ? "gtgt" : "tncn");
export const lineKey = (code: string) => code.replace(".", "_");

// ---- Quarters ("2026-Q3"), on calendar dates stored as UTC midnight
export const PERIOD = /^(\d{4})-Q([1-4])$/;
export const quarterOf = (d: Date) => `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
export function quarterRange(p: string) {
  const [, y, q] = PERIOD.exec(p) ?? [];
  if (!y) throw new Error(`not a quarter: ${p}`);
  return { start: new Date(Date.UTC(+y, (+q - 1) * 3, 1)), end: new Date(Date.UTC(+y, +q * 3, 1)) };
}
export function addQuarters(p: string, n: number) {
  const { start } = quarterRange(p);
  return quarterOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3 * n, 1)));
}
// Every quarter from a to b, both included (none if a > b; at most 40).
export function quartersBetween(a: string, b: string) {
  const out: string[] = [];
  for (let p = a; quarterRange(p).start <= quarterRange(b).start && out.length < 40; p = addQuarters(p, 1)) out.push(p);
  return out;
}
// "Quý 3/2026" in Vietnamese, "Q3 2026" in English.
export function periodLabel(p: string, locale: string) {
  const [, y, q] = PERIOD.exec(p) ?? [];
  if (!y) return p;
  return locale === "vi" ? `Quý ${q}/${y}` : `Q${q} ${y}`;
}

// The figures of a stored return, as whole numbers by line code.
export function parseLines(json: string | null | undefined): Record<string, number> {
  try {
    const o = JSON.parse(json || "{}");
    if (!o || typeof o !== "object" || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "number" && Number.isFinite(v)) as [string, number][]);
  } catch {
    return {};
  }
}
// A typed figure, whole đồng (or people): "120.000.000", "120,000,000", "120 000 000",
// "(200.000)" or "-200000". Decimals are refused, so "120000000.0" can't turn into ten times the figure.
export function parseFigure(raw: string): number | null {
  let s = raw.replace(/[₫đ]/gi, "").trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (/^[-−]/.test(s)) { neg = true; s = s.slice(1).trim(); }
  if (!/^(\d+|\d{1,3}([.,\s]\d{3})+)$/.test(s)) return null;
  const digits = s.replace(/[.,\s]/g, "");
  if (digits.length > 15) return null;
  return neg ? -Number(digits) : Number(digits);
}

// ---- Typing checks: the form's own arithmetic (TT80/2021), so a mistyped figure shows.
export type MathCheck = { code: string; expected: number; actual: number };
export function mathChecks(form: Form, l: Record<string, number>): MathCheck[] {
  const v = (c: string) => l[c] ?? 0;
  const rules: [string, number][] = form === "01/GTGT"
    ? (() => {
        const x = v("36") - v("22") + v("37") - v("38") - v("39a");
        return [
          ["27", v("29") + v("30") + v("32") + v("32a")],
          ["28", v("31") + v("33")],
          ["34", v("26") + v("27")],
          ["35", v("28")],
          ["36", v("35") - v("25")],
          ["40a", Math.max(x, 0)],
          ["41", Math.max(-x, 0)],
          ["40", v("40a") - v("40b")],
          ["43", v("41") - v("42")],
        ] as [string, number][];
      })()
    : [["18", v("19") + v("20")], ["21", v("22") + v("23")], ["26", v("27") + v("28")], ["29", v("30") + v("31")]];
  return rules.filter(([c, e]) => v(c) !== e).map(([code, expected]) => ({ code, expected, actual: v(code) }));
}

// ---- Flags
export type ReturnRow = {
  id: string; form: string; period: string; supplement: number; lines: Record<string, number>;
  filedDate?: Date | null; dueDate?: Date | null;
};
export type IncomeRow = {
  id: string; date: Date; type: string; status: string; amount: number; currency: string; exchangeRate: number;
  vndAmount: number | null; rateSource: string | null; accountType: string | null; cancelled: boolean;
  // Booked under the bank-interest category: financial income, not a sale.
  interest: boolean;
};
export type BankOut = { date: Date; amount: number; description: string | null; counterparty: string | null };
export type Severity = "high" | "medium" | "info";
export type Flag = {
  key: string; severity: Severity;
  kind: "notDeclared" | "declaredMore" | "missingReturn" | "creditChain" | "math" | "bhxhNoStaff" | "bhxhMonthMissing" | "filedLate" | "notFiled";
  period?: string; form?: string; amount?: number; date?: string; days?: number; month?: string;
  code?: string; expected?: number; actual?: number; provisionalVnd?: number; returnId?: string;
  // The figure a note on this flag refers to: if it later moves, the flag comes back.
  figure?: number;
};
export type Comparison = { period: string; books: number; declared: number; difference: number; outside: number; provisional: number; interest: number };

// The latest filing per form and quarter: a supplement replaces the original.
export function latestReturns(rows: ReturnRow[]) {
  const by = new Map<string, ReturnRow>();
  for (const r of rows) {
    const k = `${r.form}|${r.period}`;
    const cur = by.get(k);
    if (!cur || r.supplement > cur.supplement) by.set(k, r);
  }
  return by;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
// The social-insurance office as the bank names the payee.
export const isSocialInsurance = (text: string) => /\bbhxh\b|bao hiem xa hoi/.test(plain(text));
// A contribution as the bank describes it ("BHXH 103 00 …"), or a payment to the office —
// not every payment that mentions BHXH (e.g. a fee for the paperwork).
export const isContribution = (b: { description: string | null; counterparty: string | null }) =>
  isSocialInsurance(b.counterparty ?? "") || /^\s*bhxh\s+\d/.test(plain(b.description ?? ""));

const DAY = 86400000;
// Differences below this are rounding or exchange-rate noise, not a question.
export const tolerance = (a: number, b: number) => Math.max(500000, 0.02 * Math.max(Math.abs(a), Math.abs(b)));

export function taxFlags({ returns, income, bankOut, today }: { returns: ReturnRow[]; income: IncomeRow[]; bankOut: BankOut[]; today: Date }) {
  const flags: Flag[] = [];
  const latest = latestReturns(returns);
  const booked = income.filter((t) => t.type === "INCOME" && isBooked(t));
  const sales = booked.filter((t) => !t.interest);
  const vnd = (rows: IncomeRow[]) => rows.reduce((s, t) => s + toVnd(t), 0);
  const inQuarter = (p: string, d: Date) => { const { start, end } = quarterRange(p); return d >= start && d < end; };
  const outside = (t: IncomeRow) => t.accountType === "OWNER" || t.accountType === "CASH";

  // Per quarter with a VAT declaration: sales in the books against declared sales [34]. The
  // breakdown (received outside the company bank, still at a provisional rate) explains a gap;
  // it is shown in totals only, never as a flag on an entry. Bank interest is not a sale: it
  // is left out of the books figure and shown beside it, so nothing is hidden.
  const comparison: Comparison[] = [];
  for (const [k, r] of latest) {
    if (r.form !== "01/GTGT") continue;
    const p = k.split("|")[1];
    const q = sales.filter((t) => inQuarter(p, t.date));
    const books = vnd(q), declared = r.lines["34"] ?? 0, difference = books - declared;
    const lq = q.filter((t) => !t.cancelled);
    const row = {
      period: p, books, declared, difference,
      outside: vnd(lq.filter(outside)), provisional: vnd(lq.filter(isProvisional)),
      interest: vnd(booked.filter((t) => t.interest && inQuarter(p, t.date))),
    };
    comparison.push(row);
    if (difference > tolerance(books, declared)) flags.push({ key: `sales-gap:${p}`, severity: "high", kind: "notDeclared", period: p, amount: difference, figure: difference, provisionalVnd: row.provisional });
    else if (-difference > tolerance(books, declared)) flags.push({ key: `sales-over:${p}`, severity: "info", kind: "declaredMore", period: p, amount: -difference, figure: -difference, provisionalVnd: row.provisional });
  }
  comparison.sort((a, b) => b.period.localeCompare(a.period));

  // From the first quarter with a recorded return to the last quarter that has ended.
  const periods = [...new Set(returns.map((r) => r.period))].sort((a, b) => quarterRange(a).start.getTime() - quarterRange(b).start.getTime());
  if (periods.length) {
    const lastEnded = addQuarters(quarterOf(today), -1);
    for (const p of quartersBetween(periods[0], lastEnded)) {
      for (const f of FORMS) {
        if (latest.has(`${f}|${p}`)) continue;
        // A PIT return after a quarter with no employees and no income is a question, not a gap.
        const prev = latest.get(`${f}|${addQuarters(p, -1)}`);
        const quiet = f === "05/KK-TNCN" && !!prev && !(prev.lines["16"] ?? 0) && !(prev.lines["21"] ?? 0);
        flags.push({ key: `missing:${f}:${p}`, severity: quiet ? "info" : "medium", kind: "missingReturn", form: f, period: p });
      }
    }
  }

  for (const [k, r] of latest) {
    const [form, p] = k.split("|");
    if (!isForm(form)) continue;
    // [22] opens with the credit the previous quarter carried forward in [43] — any recorded filing of
    // it, since a supplement filed later may carry its difference in [37]/[38] instead.
    if (form === "01/GTGT") {
      const prevPeriod = addQuarters(p, -1);
      const prevs = returns.filter((x) => x.form === "01/GTGT" && x.period === prevPeriod);
      const opening = r.lines["22"] ?? 0;
      if (prevs.length && !prevs.some((x) => (x.lines["43"] ?? 0) === opening)) {
        const expected = latest.get(`01/GTGT|${prevPeriod}`)!.lines["43"] ?? 0;
        flags.push({ key: `chain:${p}`, severity: "high", kind: "creditChain", period: p, expected, actual: opening, figure: opening });
      }
    }
    for (const m of mathChecks(form, r.lines)) flags.push({ key: `math:${form}:${p}:${m.code}`, severity: "medium", kind: "math", form, period: p, figure: m.actual, ...m });
    // Social-insurance contributions while the PIT return shows no employees (WF-TTT-05).
    if (form === "05/KK-TNCN" && (r.lines["16"] ?? 0) === 0) {
      const paid = bankOut.filter((b) => inQuarter(p, b.date) && isContribution(b)).reduce((s, b) => s + Math.abs(b.amount), 0);
      if (paid > 0) flags.push({ key: `bhxh:${p}`, severity: "medium", kind: "bhxhNoStaff", period: p, amount: paid, figure: paid });
    }
  }

  // Social insurance is paid to the government every month: from the first contribution in the
  // imported bank statements, each month that has ended should have one (WF-TTT-05).
  const month = (d: Date) => d.toISOString().slice(0, 7);
  const paid = new Set(bankOut.filter(isContribution).map((b) => month(b.date)));
  if (paid.size) {
    const lastEnded = month(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)));
    let d = new Date(`${[...paid].sort()[0]}-01T00:00:00.000Z`);
    for (let i = 0; i < 120 && month(d) <= lastEnded; i++, d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      if (!paid.has(month(d))) flags.push({ key: `bhxh-month:${month(d)}`, severity: "medium", kind: "bhxhMonthMissing", period: quarterOf(d), month: month(d) });
    }
  }

  // Filing dates against the due date the owner typed in (never computed here).
  for (const r of returns) {
    if (!r.dueDate || !isForm(r.form)) continue;
    const base = { form: r.form, period: r.period, date: r.dueDate.toISOString().slice(0, 10), returnId: r.id };
    if (r.filedDate && r.filedDate > r.dueDate) {
      flags.push({ key: `late:${r.form}:${r.period}:${r.supplement}`, severity: "info", kind: "filedLate", ...base, days: Math.round((+r.filedDate - +r.dueDate) / DAY) });
    } else if (!r.filedDate && r.dueDate < today) {
      flags.push({ key: `due:${r.form}:${r.period}:${r.supplement}`, severity: "medium", kind: "notFiled", ...base, days: Math.floor((+today - +r.dueDate) / DAY) });
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  flags.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.period ?? "").localeCompare(a.period ?? "") || (a.date ?? "").localeCompare(b.date ?? ""));
  return { flags, comparison };
}

// A note no longer fits its flag when the figure it refers to has moved. Figures typed from a
// declaration (arithmetic, credit chain) are exact; book totals allow for exchange-rate noise.
export const noteIsStale = (noted: number | null | undefined, now: number | undefined, exact = false) =>
  noted != null && now != null && Math.abs(now - noted) > (exact || Math.abs(noted) < 1000 ? 0 : tolerance(noted, now) / 4);

export const FLAG_KEY = /^[a-z-]+:[\w:/.-]{1,200}$/;
