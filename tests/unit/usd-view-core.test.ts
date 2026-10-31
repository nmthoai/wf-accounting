// The per-user summary currency: VND as recorded, or USD where entries made in
// USD keep their real USD and everything else converts at the Settings rate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valueIn, vndIn, VND_VIEW, type View } from "@/lib/money";
import { buildPnl, type PnlEntry } from "@/lib/pnl";

const USD: View = { currency: "USD", rate: 25000 };
const m = (currency: string, amount: number, exchangeRate = 1, vndAmount: number | null = null) => ({ currency, amount, exchangeRate, vndAmount });

test("the VND view is the VND value, exactly as before", () => {
  assert.equal(valueIn(VND_VIEW, m("VND", 5000000)), 5000000);
  assert.equal(valueIn(VND_VIEW, m("USD", 100, 25795)), 2579500);
  assert.equal(valueIn(VND_VIEW, m("USD", 100, 25795, 2580000)), 2580000);
  assert.equal(vndIn(VND_VIEW, 123456), 123456);
});

test("the USD view keeps an entry's real USD, whatever rate it was booked at", () => {
  assert.equal(valueIn(USD, m("USD", 100, 25795)), 100);
  assert.equal(valueIn(USD, m("USD", 100, 25795, 2580000)), 100);
  assert.equal(valueIn(USD, m("USD", -40, 26000)), -40); // a reversal stays negative
});

test("the USD view converts VND (and other currencies' VND value) at the view rate", () => {
  assert.equal(valueIn(USD, m("VND", 5000000)), 200);
  assert.equal(valueIn(USD, m("EUR", 10, 27500)), 11);
  assert.equal(vndIn(USD, 2500000), 100);
});

test("the P&L can be built in the view's currency", () => {
  const e = (id: string, type: string, currency: string, amount: number, exchangeRate = 1): PnlEntry => ({
    id, date: new Date("2026-09-10T00:00:00Z"), type, amount, currency, exchangeRate, vndAmount: null, rateSource: currency === "VND" ? null : "MANUAL",
    description: id, status: "POSTED", category: { name: "C" }, project: null,
  });
  const entries = [e("a", "INCOME", "USD", 1000, 26000), e("b", "EXPENSE", "VND", 2500000)];
  const vnd = buildPnl(entries, ["2026-09"], "-");
  assert.equal(vnd.netTotal, 26000000 - 2500000);
  const usd = buildPnl(entries, ["2026-09"], "-", (t) => valueIn(USD, t));
  assert.equal(usd.revenue.total, 1000);
  assert.equal(usd.cost.total, 100);
  assert.equal(usd.netTotal, 900);
  assert.equal(usd.revenue.categories[0].items[0].value, 1000);
  assert.equal(usd.revenue.categories[0].items[0].amount, 1000); // the original amount is kept alongside
});
