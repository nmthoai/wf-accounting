import { test } from "node:test";
import assert from "node:assert/strict";
import { reviewProblem } from "@/lib/review";

const base = { type: "EXPENSE", amount: 1000, docStatus: "PENDING", purposeStatus: "PENDING", citStatus: "PENDING", vatStatus: "PENDING", vatAmount: null as number | null, reviewNote: null as string | null };
const check = (patch: Partial<typeof base>) => reviewProblem({ ...base, ...patch });

test("a new expense and a bank-paid expense with a missing invoice can stay pending", () => {
  assert.equal(check({}), null);
  assert.equal(check({ docStatus: "MISSING" }), null);
});

test("deductible or claimable needs business use confirmed first", () => {
  assert.match(check({ citStatus: "DEDUCTIBLE" })!, /Confirm business use/);
  assert.match(check({ docStatus: "INVOICE", vatStatus: "CLAIMABLE", vatAmount: 100 })!, /Confirm business use/);
  assert.match(check({ purposeStatus: "PERSONAL", citStatus: "DEDUCTIBLE", docStatus: "INVOICE" })!, /Confirm business use/);
  assert.equal(check({ purposeStatus: "PERSONAL", citStatus: "NON_DEDUCTIBLE" }), null);
});

test("deducting without an invoice or receipt needs the accountant's basis", () => {
  assert.match(check({ purposeStatus: "CONFIRMED", citStatus: "DEDUCTIBLE", docStatus: "MISSING" })!, /basis/);
  assert.equal(check({ purposeStatus: "CONFIRMED", citStatus: "DEDUCTIBLE", docStatus: "MISSING", reviewNote: "list 01/TNDN" }), null);
  assert.equal(check({ purposeStatus: "CONFIRMED", citStatus: "DEDUCTIBLE", docStatus: "RECEIPT" }), null);
});

test("claimable VAT needs the invoice on file and the printed VAT amount", () => {
  assert.match(check({ purposeStatus: "CONFIRMED", docStatus: "RECEIPT", vatStatus: "CLAIMABLE", vatAmount: 100 })!, /invoice on file/);
  assert.match(check({ purposeStatus: "CONFIRMED", docStatus: "INVOICE", vatStatus: "CLAIMABLE" })!, /VAT amount/);
  assert.equal(check({ purposeStatus: "CONFIRMED", docStatus: "INVOICE", vatStatus: "CLAIMABLE", vatAmount: 100 }), null);
});

test("VAT can't reach the entry amount; unknown statuses are refused; income ignores expense decisions", () => {
  assert.match(check({ vatAmount: 1000 })!, /less than/);
  assert.match(check({ docStatus: "FOO" })!, /Unknown/);
  assert.match(check({ citStatus: "MAYBE" })!, /Unknown/);
  assert.equal(reviewProblem({ ...base, type: "INCOME", citStatus: "DEDUCTIBLE" }), null);
});
