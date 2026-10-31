// Reports in the USD view: the P&L is valued per entry (USD kept, the rest
// converted), and the trend chart's axis still reads at USD's much smaller scale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { valueIn, VND_VIEW, type View } from "@/lib/money";
import { buildPnl, chartTicks, type PnlEntry } from "@/lib/pnl";

const USD: View = { currency: "USD", rate: 25000 };
const e = (id: string, date: string, type: string, currency: string, amount: number, exchangeRate = 1, vndAmount: number | null = null): PnlEntry => ({
  id, date: new Date(`${date}T00:00:00Z`), type, amount, currency, exchangeRate, vndAmount, rateSource: currency === "VND" ? null : "BANK",
  description: id, status: "POSTED", category: { name: "C" }, project: null,
});

test("the month-by-month P&L in USD: USD entries at their real amount, VND at the Settings rate", () => {
  const entries = [
    e("fee", "2026-09-03", "INCOME", "USD", 1200, 26000, 31100000), // settled VND is ignored in USD
    e("rent", "2026-09-05", "EXPENSE", "VND", 10000000),
    e("tool", "2026-10-02", "EXPENSE", "USD", 20, 26100),
  ];
  const months = ["2026-09", "2026-10"];
  const usd = buildPnl(entries, months, "-", (t) => valueIn(USD, t));
  assert.deepEqual(usd.revenue.perMonth, [1200, 0]);
  assert.deepEqual(usd.cost.perMonth, [400, 20]);
  assert.deepEqual(usd.net, [800, -20]);
  assert.equal(usd.netTotal, 780);
  // Each item keeps its own amount and currency beside its value in the view.
  const fee = usd.revenue.categories[0].items[0];
  assert.deepEqual([fee.currency, fee.amount, fee.value], ["USD", 1200, 1200]);
  const rent = usd.cost.categories[0].items.find((i) => i.id === "rent")!;
  assert.deepEqual([rent.currency, rent.amount, rent.value], ["VND", 10000000, 400]);

  // The VND view is the P&L exactly as before.
  const vnd = buildPnl(entries, months, "-", (t) => valueIn(VND_VIEW, t));
  assert.deepEqual(vnd, buildPnl(entries, months, "-"));
});

test("the trend axis at USD scale: round steps, and labels that never collapse to 0", () => {
  const fmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
  assert.deepEqual(chartTicks(-20, 1200), [-500, 0, 500, 1000, 1500]);
  assert.deepEqual(chartTicks(0, 37), [0, 10, 20, 30, 40]);
  // A quiet period of a few dollars still gets distinct, non-zero labels.
  const small = chartTicks(0, 0.8).map((v) => fmt.format(v));
  assert.equal(new Set(small).size, small.length);
  assert.ok(small.slice(1).every((s) => s !== "0"));
  assert.equal(fmt.format(chartTicks(0, 45000)[1]), "10K");
});
