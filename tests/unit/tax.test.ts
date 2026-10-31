import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addQuarters, quarterOf, quarterRange, quartersBetween, parseFigure, parseLines, mathChecks, taxFlags, latestReturns,
  isSocialInsurance, isContribution, noteIsStale, FLAG_KEY, type IncomeRow, type ReturnRow,
} from "@/lib/tax";

// Invented declarations that follow the form's arithmetic: Q1 with purchases only (a VAT
// credit carried forward), Q2 with sales at 10% using up that credit.
const Q1_VAT = { "23": 12345000, "24": 370000, "25": 370000, "36": -370000, "41": 370000, "43": 370000 };
const Q2_VAT = {
  "22": 370000, "23": 7650000, "24": 230000, "25": 230000, "27": 48000000, "28": 4800000, "32": 48000000, "33": 4800000,
  "34": 48000000, "35": 4800000, "36": 4570000, "40a": 4200000, "40": 4200000,
};
const ZERO_PIT = {};
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const ret = (form: string, period: string, lines: Record<string, number>, supplement = 0, dates: Partial<Pick<ReturnRow, "filedDate" | "dueDate">> = {}): ReturnRow =>
  ({ id: `${form}${period}${supplement}`, form, period, supplement, lines, ...dates });
const income = (o: Partial<Omit<IncomeRow, "date">> & { date: string; amount: number }): IncomeRow => ({
  id: Math.random().toString(36).slice(2), type: "INCOME", status: "REVIEWED", currency: "EUR", exchangeRate: 30000, vndAmount: null,
  rateSource: "DEFAULT", accountType: "BANK", cancelled: false, ...o, date: day(o.date),
});
const today = day("2030-07-20");
const KINDS = ["notDeclared", "declaredMore", "missingReturn", "creditChain", "math", "bhxhNoStaff", "bhxhMonthMissing", "filedLate", "notFiled"];

test("quarters: of a date, their bounds, across a year end", () => {
  assert.equal(quarterOf(day("2030-06-30")), "2030-Q2");
  assert.equal(quarterOf(day("2030-07-01")), "2030-Q3");
  assert.deepEqual(quarterRange("2030-Q3"), { start: day("2030-07-01"), end: day("2030-10-01") });
  assert.equal(addQuarters("2030-Q4", 1), "2031-Q1");
  assert.equal(addQuarters("2030-Q1", -1), "2029-Q4");
  assert.deepEqual(quartersBetween("2030-Q3", "2031-Q1"), ["2030-Q3", "2030-Q4", "2031-Q1"]);
  assert.deepEqual(quartersBetween("2030-Q3", "2030-Q2"), []);
});

test("figures typed the Vietnamese way, the English way, or in brackets; decimals and anything else are refused", () => {
  assert.equal(parseFigure("48.000.000"), 48000000);
  assert.equal(parseFigure("48,000,000"), 48000000);
  assert.equal(parseFigure("48 000 000 ₫"), 48000000);
  assert.equal(parseFigure("(370.000)"), -370000);
  assert.equal(parseFigure("-370000"), -370000);
  assert.equal(parseFigure(""), 0);
  // A decimal must never be read as a figure ten or a hundred times larger.
  for (const bad of ["48000000.0", "1.5", "1.000.000,00", "12.5abc", "1e9", "1.00.000"]) assert.equal(parseFigure(bad), null, bad);
  assert.deepEqual(parseLines('{"34": 5, "x": "7"}'), { "34": 5 });
  assert.deepEqual(parseLines("not json"), {});
});

test("declarations that follow the form's arithmetic pass it", () => {
  assert.deepEqual(mathChecks("01/GTGT", Q1_VAT), []);
  assert.deepEqual(mathChecks("01/GTGT", Q2_VAT), []);
  assert.deepEqual(mathChecks("05/KK-TNCN", ZERO_PIT), []);
});

test("a mistyped figure shows as the line that doesn't add up", () => {
  assert.deepEqual(mathChecks("01/GTGT", { ...Q2_VAT, "40": 4200900 }), [{ code: "40", expected: 4200000, actual: 4200900 }]);
  assert.deepEqual(mathChecks("05/KK-TNCN", { "19": 1, "18": 0 }), [{ code: "18", expected: 1, actual: 0 }]);
});

test("gap analysis by quarter: sales the declaration doesn't show, explained in totals; a small difference is no flag; no entry is ever flagged", () => {
  const { flags, comparison } = taxFlags({
    returns: [ret("01/GTGT", "2030-Q1", Q1_VAT), ret("05/KK-TNCN", "2030-Q1", ZERO_PIT), ret("01/GTGT", "2030-Q2", Q2_VAT), ret("05/KK-TNCN", "2030-Q2", ZERO_PIT)],
    income: [
      income({ date: "2030-02-11", amount: 700, accountType: "OWNER" }),
      income({ date: "2030-03-05", amount: 450, accountType: "CASH" }),
      income({ date: "2030-04-16", amount: 30000000, currency: "VND", exchangeRate: 1 }),
      income({ date: "2030-05-27", amount: 625 }),
      income({ date: "2030-07-08", amount: 999 }), // a quarter with no declaration yet
    ],
    bankOut: [
      { date: day("2030-06-28"), amount: -512000, description: "BHXH 101 00 0000000000 nop BHXH thang 6", counterparty: "Bao hiem xa hoi" },
      // A fee for the paperwork mentions BHXH but is not a contribution.
      { date: day("2030-06-12"), amount: -2200000, description: "Phi dich vu ho so BHXH", counterparty: "Cong ty dich vu ke toan" },
    ],
    today,
  });
  assert.deepEqual(flags.map((f) => [f.key, f.severity, f.amount]), [
    ["sales-gap:2030-Q1", "high", 34500000],
    ["bhxh:2030-Q2", "medium", 512000],
  ]);
  assert.equal(flags[0].provisionalVnd, 34500000);
  for (const f of flags) {
    assert.ok(KINDS.includes(f.kind), f.kind);
    assert.match(f.key, FLAG_KEY);
  }
  const q1 = comparison.find((c) => c.period === "2030-Q1")!;
  assert.deepEqual([q1.books, q1.declared, q1.difference, q1.outside, q1.provisional], [34500000, 0, 34500000, 34500000, 34500000]);
  const q2 = comparison.find((c) => c.period === "2030-Q2")!;
  assert.deepEqual([q2.books, q2.declared, q2.difference, q2.outside, q2.provisional], [48750000, 48000000, 750000, 0, 18750000]); // 750,000 is under 2%
  assert.equal(comparison.length, 2);
});

test("cancelled pairs, drafts and rejected entries don't count as sales", () => {
  const { flags, comparison } = taxFlags({
    returns: [ret("01/GTGT", "2030-Q1", Q1_VAT)],
    income: [
      income({ date: "2030-02-01", amount: 500, cancelled: true }),
      income({ date: "2030-02-02", amount: -500, cancelled: true }),
      income({ date: "2030-02-03", amount: 300, status: "DRAFT" }),
      income({ date: "2030-02-04", amount: 200, accountType: "OWNER", status: "REJECTED" }),
    ],
    bankOut: [], today: day("2030-04-10"),
  });
  assert.deepEqual(comparison.map((c) => [c.period, c.books, c.outside]), [["2030-Q1", 0, 0]]);
  assert.deepEqual(flags.filter((f) => f.kind === "notDeclared" || f.kind === "declaredMore"), []);
});

test("a quarter without its declarations, a broken VAT-credit chain, and a supplement that replaces the original", () => {
  const fixed = taxFlags({
    returns: [
      ret("01/GTGT", "2030-Q1", Q1_VAT),
      ret("01/GTGT", "2030-Q2", { ...Q2_VAT, "22": 0, "36": 4570000, "40a": 4570000, "40": 4570000 }),
      ret("01/GTGT", "2030-Q2", Q2_VAT, 1),
    ],
    income: [], bankOut: [], today: day("2030-10-15"),
  });
  const keys = fixed.flags.map((f) => f.key);
  assert.ok(!keys.includes("chain:2030-Q2"));            // the supplement opens with the 370,000 carried forward
  assert.deepEqual(keys.filter((k) => k.startsWith("missing:")).sort(),
    ["missing:01/GTGT:2030-Q3", "missing:05/KK-TNCN:2030-Q1", "missing:05/KK-TNCN:2030-Q2", "missing:05/KK-TNCN:2030-Q3"]);
  assert.equal(latestReturns([ret("01/GTGT", "2030-Q2", Q2_VAT), ret("01/GTGT", "2030-Q2", Q1_VAT, 2)]).get("01/GTGT|2030-Q2")!.supplement, 2);

  const broken = taxFlags({ returns: [ret("01/GTGT", "2030-Q1", Q1_VAT), ret("01/GTGT", "2030-Q2", { ...Q2_VAT, "22": 0, "40a": 4570000, "40": 4570000 })], income: [], bankOut: [], today });
  assert.deepEqual(broken.flags.filter((f) => f.kind === "creditChain").map((f) => [f.severity, f.expected, f.actual]), [["high", 370000, 0]]);
});

test("the credit chain accepts the opening credit of any filing of the previous quarter", () => {
  // Q1 was later supplemented down to 250,000; Q2 opened with the original's 370,000 and
  // the difference goes through [37]/[38] — not a break.
  const q1supp = { ...Q1_VAT, "24": 250000, "25": 250000, "36": -250000, "41": 250000, "43": 250000 };
  const run = (opening: number) => taxFlags({
    returns: [ret("01/GTGT", "2030-Q1", Q1_VAT), ret("01/GTGT", "2030-Q1", q1supp, 1), ret("01/GTGT", "2030-Q2", { ...Q2_VAT, "22": opening })],
    income: [], bankOut: [], today,
  }).flags.filter((f) => f.kind === "creditChain");
  assert.deepEqual(run(370000), []);
  assert.deepEqual(run(250000), []);
  assert.deepEqual(run(0).map((f) => [f.expected, f.actual]), [[250000, 0]]); // the latest filing's [43]
});

test("a PIT declaration missing after a quarter with no employees and no income is for info only", () => {
  const { flags } = taxFlags({ returns: [ret("05/KK-TNCN", "2030-Q1", ZERO_PIT), ret("01/GTGT", "2030-Q1", Q1_VAT), ret("01/GTGT", "2030-Q2", Q2_VAT)], income: [], bankOut: [], today });
  assert.deepEqual(flags.filter((f) => f.kind === "missingReturn").map((f) => [f.key, f.severity]), [["missing:05/KK-TNCN:2030-Q2", "info"]]);
  const busy = taxFlags({ returns: [ret("05/KK-TNCN", "2030-Q1", { "16": 1, "21": 15000000, "22": 15000000 }), ret("01/GTGT", "2030-Q2", Q2_VAT)], income: [], bankOut: [], today });
  assert.equal(busy.flags.find((f) => f.key === "missing:05/KK-TNCN:2030-Q2")!.severity, "medium");
});

test("filing dates against the due date the owner recorded: late is for info, overdue with no filing date is to check", () => {
  const { flags } = taxFlags({
    returns: [
      ret("01/GTGT", "2030-Q2", Q2_VAT, 0, { dueDate: day("2030-07-10"), filedDate: day("2030-07-14") }),
      ret("05/KK-TNCN", "2030-Q2", ZERO_PIT, 0, { dueDate: day("2030-07-10") }),
      ret("01/GTGT", "2030-Q1", Q1_VAT, 0, { dueDate: day("2030-04-30"), filedDate: day("2030-04-18") }),
      ret("05/KK-TNCN", "2030-Q1", ZERO_PIT, 0, { dueDate: day("2030-08-31") }),
    ],
    income: [], bankOut: [], today,
  });
  const dates = flags.filter((f) => f.kind === "filedLate" || f.kind === "notFiled").map((f) => [f.key, f.severity, f.days, f.date]);
  assert.deepEqual(dates.sort(), [
    ["due:05/KK-TNCN:2030-Q2:0", "medium", 10, "2030-07-10"],
    ["late:01/GTGT:2030-Q2:0", "info", 4, "2030-07-10"],
  ]);
});

test("social-insurance contributions are told apart from fees that mention BHXH", () => {
  assert.ok(isSocialInsurance("Bảo hiểm xã hội quận 1"));
  assert.ok(isSocialInsurance("nop BHXH thang 6"));
  assert.ok(!isSocialInsurance("RetailVISADN-000000-200-EUR GPU CLOUD"));
  assert.ok(isContribution({ description: "BHXH 101 00 0000000000 nop BHXH thang 6", counterparty: null }));
  assert.ok(isContribution({ description: "chuyen tien", counterparty: "BAO HIEM XA HOI" }));
  assert.ok(!isContribution({ description: "Phi dich vu ho so BHXH", counterparty: "Cong ty dich vu ke toan" }));
});

test("social insurance is monthly: from the first contribution, every month that has ended needs one", () => {
  const paid = (d: string) => ({ date: day(d), amount: -512000, description: "BHXH 101 00 0000000000 nop BHXH", counterparty: "Bao hiem xa hoi" });
  const months = (bankOut: Parameters<typeof taxFlags>[0]["bankOut"], on = today) =>
    taxFlags({ returns: [], income: [], bankOut, today: on }).flags.filter((f) => f.kind === "bhxhMonthMissing").map((f) => [f.key, f.severity, f.month, f.period]);
  assert.deepEqual(months([paid("2030-03-28"), paid("2030-05-27")]), [
    ["bhxh-month:2030-04", "medium", "2030-04", "2030-Q2"],
    ["bhxh-month:2030-06", "medium", "2030-06", "2030-Q2"],
  ]);
  assert.deepEqual(months([paid("2030-06-28")]), []);                      // the current month isn't due yet
  assert.deepEqual(months([paid("2030-06-28")], day("2030-08-02")), [["bhxh-month:2030-07", "medium", "2030-07", "2030-Q3"]]);
  assert.deepEqual(months([]), []);                                        // no contribution yet: nothing to expect
  assert.deepEqual(months([{ date: day("2030-03-12"), amount: -2200000, description: "Phi dich vu ho so BHXH", counterparty: "Cong ty dich vu ke toan" }]), []);
});

test("a note stops settling its flag once the figure has moved", () => {
  assert.equal(noteIsStale(null, 5), false);            // a note made before figures were kept
  assert.equal(noteIsStale(34500000, 34500000), false);
  assert.equal(noteIsStale(34500000, 34560000), false); // rate noise
  assert.equal(noteIsStale(34500000, 37000000), true);
  assert.equal(noteIsStale(0, 0), false);
  assert.equal(noteIsStale(0, 1), true);
  assert.equal(noteIsStale(4200900, 4250000, true), true);  // a retyped figure on the declaration is exact
  assert.equal(noteIsStale(4200900, 4200900, true), false);
});
