import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toVnd, accountDelta, computeBalances, cashPosition, settlement, isMoneyIn, isInflow, isPnl, isBooked, totalsList, fmtMoney,
} from "@/lib/money";

const t = (type: string, amount: number, extra: Partial<{ exchangeRate: number; vndAmount: number | null; accountId: string; date: Date }> = {}) =>
  ({ type, amount, exchangeRate: 1, vndAmount: null, accountId: "a", date: new Date("2026-06-01T00:00:00Z"), ...extra });

test("toVnd prefers the VND actually settled over amount × rate", () => {
  assert.equal(toVnd(t("EXPENSE", 20, { exchangeRate: 26400 })), 528000);
  assert.equal(toVnd(t("EXPENSE", 20, { exchangeRate: 26400, vndAmount: 527400 })), 527400);
});

test("only income and expense are profit & loss", () => {
  for (const type of ["INCOME", "EXPENSE"]) assert.ok(isPnl(type));
  for (const type of ["TRANSFER_IN", "TRANSFER_OUT", "CAPITAL_IN", "LOAN_IN", "LOAN_REPAY", "OTHER_IN", "OTHER_OUT"]) assert.ok(!isPnl(type));
  assert.ok(isInflow("CAPITAL_IN") && isInflow("LOAN_IN") && !isInflow("LOAN_REPAY"));
});

test("accountDelta moves a VND account by the VND value and a USD account by the USD amount", () => {
  const usdIncome = t("INCOME", 100, { exchangeRate: 25795, vndAmount: 2579500 });
  assert.equal(accountDelta(usdIncome, "VND"), 2579500);
  assert.equal(accountDelta(usdIncome, "USD"), 100);
  assert.equal(accountDelta(t("EXPENSE", 50), "VND"), -50);
});

test("a reversal (negative amount) cancels the original exactly", () => {
  const orig = t("EXPENSE", 8221200);
  const rev = t("EXPENSE", -8221200);
  assert.equal(accountDelta(orig, "VND") + accountDelta(rev, "VND"), 0);
  assert.equal(isMoneyIn(orig), false);
  assert.equal(isMoneyIn(rev), true); // a reversed expense brings money back
});

test("balances: opening + movements dated on/after the opening date, per account currency", () => {
  const accounts = [
    { id: "vnd", currency: "VND", openingBalance: 1000, openingDate: new Date("2026-05-01T00:00:00Z") },
    { id: "usd", currency: "USD", openingBalance: 0, openingDate: null },
  ];
  const bal = computeBalances(accounts, [
    t("INCOME", 500, { accountId: "vnd" }),
    t("EXPENSE", 200, { accountId: "vnd" }),
    t("INCOME", 999, { accountId: "vnd", date: new Date("2026-04-30T00:00:00Z") }), // before opening: already in the opening balance
    t("TRANSFER_OUT", 3000, { accountId: "usd", exchangeRate: 25795, vndAmount: 77385000 }),
  ]);
  assert.equal(bal.get("vnd"), 1300);
  assert.equal(bal.get("usd"), -3000);
});

test("cash position keeps currencies apart and separates owner accounts and deposits", () => {
  const accounts = [
    { id: "b", type: "BANK", currency: "VND", openingBalance: 0, openingDate: null },
    { id: "u", type: "BANK", currency: "USD", openingBalance: 0, openingDate: null },
    { id: "o", type: "OWNER", currency: "USD", openingBalance: 0, openingDate: null },
    { id: "d", type: "TERM_DEPOSIT", currency: "VND", openingBalance: 0, openingDate: null },
  ];
  const pos = cashPosition(accounts, new Map([["b", 100], ["u", 5], ["o", 4200], ["d", 1000]]));
  assert.deepEqual(pos.liquid, { VND: 100, USD: 5 });
  assert.deepEqual(pos.owner, { USD: 4200 });
  assert.deepEqual(pos.deposits, { VND: 1000 });
});

test("settlement: gross − payments − evidenced fees = unmatched difference", () => {
  const s = settlement(1998.75, [{ kind: "PAYMENT", amount: 1972.75 }]);
  assert.equal(s.received, 1972.75);
  assert.equal(s.fees, 0);
  assert.ok(Math.abs(s.difference - 26) < 1e-9);
  assert.ok(Math.abs(settlement(1998.75, [{ kind: "PAYMENT", amount: 1972.75 }, { kind: "FEE", amount: 26 }]).difference) < 1e-9);
});

test("drafts are not booked; reviewed and posted are", () => {
  assert.equal(isBooked({ status: "DRAFT" }), false);
  assert.equal(isBooked({ status: "REVIEWED" }), true);
  assert.equal(isBooked({ status: "POSTED" }), true);
});

test("totals list drops zeros and orders VND, USD, EUR", () => {
  assert.deepEqual(totalsList({ EUR: 1, USD: 2, VND: 3, X: 0 }).map(([c]) => c), ["VND", "USD", "EUR"]);
  assert.match(fmtMoney(1234567, "VND"), /1\.234\.567/);
});
