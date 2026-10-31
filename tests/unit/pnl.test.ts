import { test } from "node:test";
import assert from "node:assert/strict";
import { addMonths, monthsBetween, buildPnl, isProvisional, chartTicks, MONTH, MAX_MONTHS, type PnlEntry } from "@/lib/pnl";

const e = (o: Partial<Omit<PnlEntry, "date">> & { date: string; type: string; amount: number }): PnlEntry => ({
  id: Math.random().toString(36).slice(2), currency: "VND", exchangeRate: 1, vndAmount: null, rateSource: null, description: null,
  status: "REVIEWED", category: null, project: null, ...o, date: new Date(`${o.date}T00:00:00.000Z`),
});

test("months: across a year end, both ends included, and only real months", () => {
  assert.equal(addMonths("2026-11", 3), "2027-02");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.deepEqual(monthsBetween("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthsBetween("2026-05", "2026-04"), []);
  assert.ok(MONTH.test("2026-10") && !MONTH.test("2026-13") && !MONTH.test("2026-1"));
  assert.equal(addMonths("0002-10", 1), "0002-11"); // years under 100 are not turned into 19xx
});

test("a range longer than the cap keeps its latest months", () => {
  const m = monthsBetween("2000-01", "2026-10");
  assert.equal(m.length, MAX_MONTHS);
  assert.equal(m[m.length - 1], "2026-10");
  assert.equal(m[0], addMonths("2026-10", -(MAX_MONTHS - 1)));
});

test("chart axis always reaches past the tallest value and below the lowest, through 0", () => {
  for (const [lo, hi] of [[-2946321, 54913821], [0, 133412500], [-4105000, 0], [0, 0], [-1, 1], [1500, 1998.75]]) {
    const t = chartTicks(lo, hi);
    assert.ok(t[0] <= Math.min(lo, 0) && t[t.length - 1] >= Math.max(hi, 0), `${lo}..${hi} → ${t}`);
    assert.ok(t.includes(0) && t.length >= 2 && t.length <= 8, `${lo}..${hi} → ${t}`);
  }
});

test("revenue and costs by category and month, in VND, with profit per month and in total", () => {
  const months = ["2026-08", "2026-09", "2026-10"];
  const p = buildPnl([
    e({ date: "2026-08-07", type: "INCOME", amount: 1998.75, currency: "USD", exchangeRate: 26000, rateSource: "DEFAULT", category: { name: "Client Effort" } }),
    e({ date: "2026-09-03", type: "INCOME", amount: 1500, currency: "USD", exchangeRate: 26000, rateSource: "DEFAULT", category: { name: "Client Project" } }),
    e({ date: "2026-09-03", type: "EXPENSE", amount: 88, currency: "USD", exchangeRate: 26133, vndAmount: 2299704, rateSource: "BANK", category: { name: "Software & AI APIs" } }),
    e({ date: "2026-10-30", type: "EXPENSE", amount: 4104000, category: { name: "Office & Admin" } }),
    e({ date: "2026-10-30", type: "EXPENSE", amount: 1000 }), // no category
    e({ date: "2026-11-01", type: "EXPENSE", amount: 999 }),  // outside the period
  ], months, "Uncategorized");
  assert.deepEqual(p.revenue.perMonth, [1998.75 * 26000, 1500 * 26000, 0]);
  assert.deepEqual(p.cost.perMonth, [0, 2299704, 4105000]);           // the VND actually settled wins over amount × rate
  assert.deepEqual(p.net, [51967500, 39000000 - 2299704, -4105000]);
  assert.equal(p.netTotal, p.revenue.total - p.cost.total);
  assert.deepEqual(p.cost.categories.map((c) => c.name), ["Office & Admin", "Software & AI APIs", "Uncategorized"]); // largest first
  assert.equal(p.cost.categories[0].items[0].month, "2026-10");
  assert.equal(p.provisional, 2);                                       // the two USD receipts at the default rate
});

test("a reversal cancels its entry in the month and the total; drafts and rejected entries never reach the report", () => {
  const p = buildPnl([
    e({ date: "2026-10-01", type: "EXPENSE", amount: 500000, category: { name: "Office & Admin" } }),
    e({ date: "2026-10-05", type: "EXPENSE", amount: -500000, category: { name: "Office & Admin" }, status: "POSTED" }),
    e({ date: "2026-10-06", type: "EXPENSE", amount: 7000000, status: "DRAFT" }),
    e({ date: "2026-10-07", type: "INCOME", amount: 9000000, status: "REJECTED", currency: "USD", rateSource: "DEFAULT" }),
  ], ["2026-10"], "Uncategorized");
  assert.equal(p.cost.total, 0);
  assert.equal(p.revenue.total, 0);
  assert.equal(p.cost.categories.length, 1);
  assert.equal(p.cost.categories[0].items.length, 2); // the pair stays visible as items
  assert.equal(p.provisional, 0);                     // the rejected USD receipt isn't counted either
});

test("provisional: a foreign amount without the VND settled; VND and bank-settled amounts are exact", () => {
  assert.equal(isProvisional({ currency: "USD", vndAmount: null, rateSource: "DEFAULT" }), true);
  assert.equal(isProvisional({ currency: "EUR", vndAmount: null, rateSource: "MANUAL" }), true);
  assert.equal(isProvisional({ currency: "USD", vndAmount: 2299704, rateSource: "BANK" }), false);
  assert.equal(isProvisional({ currency: "VND", vndAmount: null, rateSource: null }), false);
});
