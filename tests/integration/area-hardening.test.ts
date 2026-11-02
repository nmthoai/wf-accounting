// Review findings (2 Nov 2026) for invoices, costs, settings, projects and
// contacts: staff can't link a posted entry; an invoice can't drop below what is
// settled; a payment linked between a check and a void/delete keeps its link;
// currencies, category types and amounts are checked; categories and unit rates
// can't be duplicated; and an id that isn't a string never reaches a query.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let I: typeof import("@/app/actions/invoices");
let C: typeof import("@/app/actions/costs");
let St: typeof import("@/app/actions/settings");
let P: typeof import("@/app/actions/projects");
let Cl: typeof import("@/app/actions/clients");
let V: typeof import("@/app/actions/vendors");
let T: typeof import("@/app/actions/tax");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  I = await import("@/app/actions/invoices");
  C = await import("@/app/actions/costs");
  St = await import("@/app/actions/settings");
  P = await import("@/app/actions/projects");
  Cl = await import("@/app/actions/clients");
  V = await import("@/app/actions/vendors");
  T = await import("@/app/actions/tax");
  S = await seed();
});

// Run `meanwhile` right after the action's next call to `delegate.method`, as a
// concurrent save would (same helper as atomic-bank-invoices-tax.test.ts).
function after<D extends object>(delegate: D, method: keyof D & string, meanwhile: () => Promise<unknown>) {
  const d = delegate as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const original = d[method];
  d[method] = async (...args: unknown[]) => {
    d[method] = original;
    const r = await original.apply(delegate, args);
    await meanwhile();
    return r;
  };
  return () => { d[method] = original; };
}

let n = 0;
async function invoice(amount = 100000) {
  as.admin();
  const number = `AH-${++n}`;
  const res = await I.createInvoice(fd({ number, direction: "RECEIVABLE", clientId: S.client.id, currency: "VND", amount, issueDate: "2026-09-01", dueDate: "2026-09-30" }));
  assert.equal(res.success, true, res.message);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
}
const entry = (status: string, amount = 100000) =>
  S.prisma.transaction.create({ data: { type: "INCOME", date: new Date("2026-09-10"), amount, currency: "VND", accountId: S.vnd.id, status, description: "receipt" } });
// A crafted request can send an object where an id belongs.
const crafted = { not: null } as unknown as string;

test("staff can't link a posted entry (only the owner can unlink one); the owner can", async () => {
  const inv = await invoice();
  const posted = await entry("POSTED");
  as.staff();
  const res = await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: posted.id, amount: 100000 }));
  assert.equal(res.success, false);
  assert.match(res.message!, /posted — only the owner can link it/);
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);

  // Posted between the checks and the write: still refused.
  const draft = await entry("REVIEWED");
  const restore = after(S.prisma.transaction, "findUnique", () => S.prisma.transaction.update({ where: { id: draft.id }, data: { status: "POSTED" } }));
  try {
    const late = await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: draft.id, amount: 100000 }));
    assert.equal(late.success, false);
    assert.match(late.message!, /posted/);
  } finally { restore(); }
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);

  as.admin();
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: posted.id, amount: 100000 }))).success, true);
});

test("a link can't use an entry's free amount taken by another link made after the checks", async () => {
  const [a, b] = [await invoice(), await invoice()];
  const e = await entry("REVIEWED", 100000);
  as.admin();
  // The other link lands right after the open-amount check, before this one is written.
  const restore = after(S.prisma.paymentAllocation, "findMany", () =>
    S.prisma.paymentAllocation.create({ data: { invoiceId: b.id, transactionId: e.id, kind: "PAYMENT", amount: 60000 } }));
  try {
    const res = await I.linkToInvoice(a.id, fd({ kind: "PAYMENT", transactionId: e.id, amount: 50000 }));
    assert.equal(res.success, false);
    assert.match(res.message!, /only has 40\.000 ₫ left to allocate/);
  } finally { restore(); }
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: a.id } }), 0);
});

test("a link can't overpay an invoice settled by another payment after the checks", async () => {
  const inv = await invoice(100000);
  const [e1, e2] = [await entry("REVIEWED"), await entry("REVIEWED")];
  as.admin();
  const restore = after(S.prisma.paymentAllocation, "findMany", () =>
    S.prisma.paymentAllocation.create({ data: { invoiceId: inv.id, transactionId: e2.id, kind: "PAYMENT", amount: 100000 } }));
  try {
    const res = await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: e1.id, amount: 100000 }));
    assert.equal(res.success, false);
    assert.match(res.message!, /Nothing left to settle/);
  } finally { restore(); }
  assert.equal(await S.prisma.paymentAllocation.count({ where: { transactionId: e1.id } }), 0);
});

test("an invoice's amount can't drop below what is already settled", async () => {
  const inv = await invoice(100000);
  as.admin();
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 70000, paidDate: "2026-09-10", accountId: S.vnd.id }))).success, true);
  const edit = (amount: number) => I.updateInvoice(inv.id, fd({ number: inv.number, clientId: S.client.id, issueDate: "2026-09-01", dueDate: "2026-09-30", amount }));
  const res = await edit(60000);
  assert.equal(res.success, false);
  assert.match(res.message!, /70\.000 ₫ is already settled — enter 70\.000 ₫ or more/);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).amount, 100000);
  // Down to exactly the settled amount is fine.
  assert.equal((await edit(70000)).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PAID");
});

test("an invoice with a payment can't be deleted or voided, even one linked after the check", async () => {
  const inv = await invoice();
  as.admin();
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 50000, paidDate: "2026-09-10", accountId: S.vnd.id }))).success, true);
  for (const act of [I.deleteInvoice, I.voidInvoice]) {
    const res = await act(inv.id);
    assert.equal(res.success, false);
    assert.match(res.message!, /payments linked — unlink them first/);
  }
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PARTIAL");

  // Linked between the check and the write: the link stays, nothing is deleted or voided.
  for (const act of [I.deleteInvoice, I.voidInvoice]) {
    const fresh = await invoice();
    const e = await entry("REVIEWED");
    const restore = after(S.prisma.invoice, "findUnique", () =>
      S.prisma.paymentAllocation.create({ data: { invoiceId: fresh.id, transactionId: e.id, kind: "PAYMENT", amount: 100000 } }));
    try {
      const res = await act(fresh.id);
      assert.equal(res.success, false);
      assert.match(res.message!, /payments linked/);
    } finally { restore(); }
    const kept = await S.prisma.invoice.findUniqueOrThrow({ where: { id: fresh.id } });
    assert.notEqual(kept.status, "VOID");
    assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: fresh.id } }), 1);
  }

  // Nothing linked: both still work.
  assert.equal((await I.voidInvoice((await invoice()).id)).success, true);
  const gone = await invoice();
  assert.equal((await I.deleteInvoice(gone.id)).success, true);
  assert.equal(await S.prisma.invoice.count({ where: { id: gone.id } }), 0);
});

test("an unknown currency or category type is refused", async () => {
  as.admin();
  const before = await S.prisma.invoice.count();
  const res = await I.createInvoice(fd({ number: "CUR-1", direction: "RECEIVABLE", clientId: S.client.id, currency: "BTC", amount: 1, issueDate: "2026-09-01", dueDate: "2026-09-30" }));
  assert.equal(res.success, false);
  assert.match(res.message!, /Unsupported currency — choose VND, USD, EUR/);
  assert.equal(await S.prisma.invoice.count(), before);
  const inv = await invoice();
  const edit = await I.updateInvoice(inv.id, fd({ number: inv.number, clientId: S.client.id, issueDate: "2026-09-01", dueDate: "2026-09-30", amount: 100000, currency: "constructor" }));
  assert.equal(edit.success, false);
  assert.match(edit.message!, /Unsupported currency/);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).currency, "VND");

  const cats = await S.prisma.category.count();
  assert.equal((await St.createCategory(fd({ name: "Odd", type: "COST" }))).success, false);
  assert.equal(await S.prisma.category.count(), cats);
  assert.equal((await St.updateCategory(S.expense.id, fd({ name: S.expense.name, type: "LOAN" }))).success, false);
  assert.equal((await S.prisma.category.findUniqueOrThrow({ where: { id: S.expense.id } })).type, "EXPENSE");
});

test("a category or unit rate can't be added twice (trimmed, any case)", async () => {
  as.admin();
  const res = await St.createCategory(fd({ name: "  cloud &  SOFTWARE ", type: "EXPENSE" }));
  assert.equal(res.success, false);
  assert.match(res.message!, /An expense category called “Cloud & software” already exists/);
  // The same name as an income category is a different category.
  assert.equal((await St.createCategory(fd({ name: "Cloud & software", type: "INCOME" }))).success, true);
  // Renaming another one onto it is refused too; its own case change is not.
  const other = await S.prisma.category.create({ data: { name: "Hosting", type: "EXPENSE" } });
  assert.equal((await St.updateCategory(other.id, fd({ name: "CLOUD & software", type: "EXPENSE" }))).success, false);
  assert.equal((await St.updateCategory(other.id, fd({ name: "hosting", type: "EXPENSE" }))).success, true);

  assert.equal((await St.createUnitRate(fd({ description: "Senior developer", rate: 50, unit: "hours" }))).success, true);
  const dup = await St.createUnitRate(fd({ description: " senior  DEVELOPER", rate: 60, unit: "hours" }));
  assert.equal(dup.success, false);
  assert.match(dup.message!, /A rate for “Senior developer” per hour already exists/);
  assert.equal(await S.prisma.unitRate.count({ where: { unit: "hours" } }), 1);
  // Per man-day it is another rate.
  assert.equal((await St.createUnitRate(fd({ description: "Senior developer", rate: 400, unit: "manday" }))).success, true);
});

test("\"Infinity\" and other non-numbers are refused as amounts", async () => {
  as.admin();
  const before = await S.prisma.invoice.count();
  for (const amount of ["Infinity", "1e999", "12abc"]) {
    const res = await I.createInvoice(fd({ number: `INF-${amount}`, direction: "RECEIVABLE", clientId: S.client.id, currency: "VND", amount, issueDate: "2026-09-01", dueDate: "2026-09-30" }));
    assert.equal(res.success, false, amount);
  }
  assert.equal(await S.prisma.invoice.count(), before);

  const inv = await invoice();
  assert.equal((await I.recordPayment(inv.id, fd({ amount: "Infinity", paidDate: "2026-09-10", accountId: S.vnd.id }))).success, false);
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 50000, feeDeducted: "Infinity", paidDate: "2026-09-10", accountId: S.vnd.id }))).success, false);
  const e = await entry("REVIEWED");
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: e.id, amount: "Infinity" }))).success, false);
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);

  const cost = await C.saveCostItem(null, fd({ provider: "Infinite Cloud", receiptDate: "2026-09-01", amount: "Infinity", currency: "USD" }));
  assert.equal(cost.success, false);
  assert.equal(await S.prisma.costItem.count({ where: { provider: "Infinite Cloud" } }), 0);

  const rate = (await S.prisma.user.findUniqueOrThrow({ where: { id: "u-admin" } })).defaultUsdRate;
  assert.equal((await St.updateExchangeRate(fd({ rate: "Infinity" }))).success, false);
  assert.equal((await St.createUnitRate(fd({ description: "Infinite rate", rate: "Infinity", unit: "hours" }))).success, false);
  assert.equal((await S.prisma.user.findUniqueOrThrow({ where: { id: "u-admin" } })).defaultUsdRate, rate);
});

test("an id that isn't a string is refused before any query", async () => {
  as.admin();
  // Would otherwise reopen every dismissed item ({ id: { not: null } }).
  const dismissed = await S.prisma.costItem.create({ data: { provider: "Old SaaS", receiptDate: new Date("2026-08-01"), amount: 5, currency: "USD", status: "DISMISSED" } });
  const res = await C.reopenCostItem(crafted);
  assert.equal(res.success, false);
  assert.match((res as { message: string }).message, /Not found/);
  assert.equal((await S.prisma.costItem.findUniqueOrThrow({ where: { id: dismissed.id } })).status, "DISMISSED");

  const calls: [string, () => Promise<{ success: boolean }>][] = [
    ["updateInvoice", () => I.updateInvoice(crafted, fd({ amount: 1 }))],
    ["recordPayment", () => I.recordPayment(crafted, fd({ amount: 1 }))],
    ["linkToInvoice", () => I.linkToInvoice(crafted, fd({ amount: 1 }))],
    ["unlinkAllocation", () => I.unlinkAllocation(crafted)],
    ["voidInvoice", () => I.voidInvoice(crafted)],
    ["deleteInvoice", () => I.deleteInvoice(crafted)],
    ["saveCostItem", () => C.saveCostItem(crafted, fd({}))],
    ["dismissCostItem", () => C.dismissCostItem(crafted, "x")],
    ["deleteCostItem", () => C.deleteCostItem(crafted)],
    ["linkCostItem", () => C.linkCostItem(dismissed.id, crafted)],
    ["updateCategory", () => St.updateCategory(crafted, fd({ name: "x", type: "INCOME" }))],
    ["deleteCategory", () => St.deleteCategory(crafted)],
    ["updateUnitRate", () => St.updateUnitRate(crafted, fd({ description: "x", rate: 1, unit: "hours" }))],
    ["deleteUnitRate", () => St.deleteUnitRate(crafted)],
    ["updateProject", () => P.updateProject(crafted, fd({ name: "x" }))],
    ["setProjectStatus", () => P.setProjectStatus(crafted, "ARCHIVED")],
    ["addProjectDocument", () => P.addProjectDocument(crafted, fd({}))],
    ["deleteProject", () => P.deleteProject(crafted)],
    ["updateClient", () => Cl.updateClient(crafted, fd({ name: "x" }))],
    ["deleteClient", () => Cl.deleteClient(crafted)],
    ["updateVendor", () => V.updateVendor(crafted, fd({ name: "x" }))],
    ["deleteVendor", () => V.deleteVendor(crafted)],
    ["saveTaxReturn", () => T.saveTaxReturn(crafted, fd({}))],
    ["deleteTaxReturn", () => T.deleteTaxReturn(crafted)],
    ["deleteTaxReturnFile", () => T.deleteTaxReturnFile(crafted)],
    ["setTaxFlagNote", () => T.setTaxFlagNote(crafted, "note")],
    ["clearTaxFlagNote", () => T.clearTaxFlagNote(crafted)],
  ];
  for (const [name, call] of calls) {
    const r = await call();
    assert.equal(r.success, false, name);
  }
  // Nothing was touched.
  assert.ok((await S.prisma.client.count()) > 0);
  assert.ok((await S.prisma.vendor.count()) > 0);
  assert.ok((await S.prisma.category.count()) > 0);
});
