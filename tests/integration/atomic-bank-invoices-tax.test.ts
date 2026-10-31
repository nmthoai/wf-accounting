// A change and its history are saved together: if the history can't be written,
// nothing is. And an entry posted, rejected or matched elsewhere between an
// action's checks and its write is left as it is.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let B: typeof import("@/app/actions/bank");
let I: typeof import("@/app/actions/invoices");
let T: typeof import("@/app/actions/tax");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  B = await import("@/app/actions/bank");
  I = await import("@/app/actions/invoices");
  T = await import("@/app/actions/tax");
  S = await seed();
});

// Every history write fails while `fn` runs; the action must fail with it.
async function historyDown(fn: () => Promise<unknown>) {
  await S.prisma.$executeRawUnsafe(`CREATE TRIGGER history_down BEFORE INSERT ON "ChangeLog" BEGIN SELECT RAISE(ABORT, 'history down'); END`);
  try {
    await assert.rejects(fn(), /changeLog\.createMany/);
  } finally {
    await S.prisma.$executeRawUnsafe(`DROP TRIGGER history_down`);
  }
}

// Run `meanwhile` right after the action's next call to `delegate.method` — i.e.
// between its read and its write, as a concurrent save would. (Prisma's model
// methods are created lazily, so they're swapped by hand rather than mocked.)
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
async function line(amount: number) {
  const st = await S.prisma.bankStatement.create({
    data: { accountId: S.vnd.id, fileName: "mb.xlsx", periodFrom: new Date("2026-09-01"), periodTo: new Date("2026-09-30"), openingBalance: 0, closingBalance: amount, inflows: amount, outflows: 0, lineCount: 1 },
  });
  n++;
  return S.prisma.bankLine.create({ data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-09-10"), amount, locator: `row ${n}`, dedupeKey: `k${n}` } });
}
const entry = (description: string, status: string, type = "INCOME") =>
  S.prisma.transaction.create({ data: { type, date: new Date("2026-09-10"), amount: 100000, currency: "VND", accountId: S.vnd.id, status, description } });
const get = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });
const history = (entityId: string) => S.prisma.changeLog.count({ where: { entityId } });
const invoice = async (number: string) => {
  as.admin();
  assert.equal((await I.createInvoice(fd({ number, direction: "RECEIVABLE", clientId: S.client.id, currency: "VND", amount: 100000, issueDate: "2026-09-01", dueDate: "2026-09-30" }))).success, true);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
};

// ---- bank.ts

test("bank: a match or unmatch whose history can't be written leaves the entry as it was", async () => {
  as.admin();
  const l = await line(100000);
  const e = await entry("receipt A", "REVIEWED");
  await historyDown(() => B.matchLine(l.id, [e.id]));
  assert.equal((await get(e.id)).bankLineId, null);

  assert.equal((await B.matchLine(l.id, [e.id])).success, true);
  assert.equal((await get(e.id)).bankLineId, l.id);
  await historyDown(() => B.unmatchEntry(e.id));
  assert.equal((await get(e.id)).bankLineId, l.id);
});

test("bank: an entry rejected after the checks isn't matched", async () => {
  as.admin();
  const l = await line(100000);
  const e = await entry("receipt B", "DRAFT");
  const restore = after(S.prisma.bankLine, "findUnique", () => S.prisma.transaction.update({ where: { id: e.id }, data: { status: "REJECTED" } }));
  try {
    const res = await B.matchLine(l.id, [e.id]);
    assert.equal(res.success, false);
    assert.match(res.message!, /rejected/);
  } finally { restore(); }
  assert.equal((await get(e.id)).bankLineId, null);
  assert.equal(await history(e.id), 0);
});

test("bank: an entry matched to another line after the checks keeps that match", async () => {
  as.admin();
  const [l1, l2] = [await line(100000), await line(100000)];
  const e = await entry("receipt C", "REVIEWED");
  const restore = after(S.prisma.bankLine, "findUnique", () => S.prisma.transaction.update({ where: { id: e.id }, data: { bankLineId: l2.id } }));
  try {
    const res = await B.matchLine(l1.id, [e.id]);
    assert.equal(res.success, false);
    assert.match(res.message!, /already matched/);
  } finally { restore(); }
  assert.equal((await get(e.id)).bankLineId, l2.id);
});

test("bank: staff can't unmatch an entry posted after the check", async () => {
  as.admin();
  const l = await line(100000);
  const e = await entry("receipt D", "REVIEWED");
  assert.equal((await B.matchLine(l.id, [e.id])).success, true);
  as.staff();
  const restore = after(S.prisma.transaction, "findUnique", () => S.prisma.transaction.update({ where: { id: e.id }, data: { status: "POSTED" } }));
  try {
    const res = await B.unmatchEntry(e.id);
    assert.equal(res.success, false);
    assert.match(res.message!, /posted/);
  } finally { restore(); }
  assert.equal((await get(e.id)).bankLineId, l.id);
});

// ---- invoices.ts

test("invoices: a link, void or edit whose history can't be written changes nothing", async () => {
  const inv = await invoice("AT-1");
  const e = await entry("receipt E", "REVIEWED");
  await historyDown(() => I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: e.id, amount: 100000 })));
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);

  await historyDown(() => I.voidInvoice(inv.id));
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "OPEN");

  as.staff();
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 100000, paidDate: "2026-09-10", accountId: S.vnd.id }))).success, true);
  const pay = await S.prisma.paymentAllocation.findFirstOrThrow({ where: { invoiceId: inv.id } });
  await historyDown(() => I.updateInvoice(inv.id, fd({ number: "AT-1b", clientId: S.client.id, issueDate: "2026-09-01", dueDate: "2026-09-30", amount: 100000 })));
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).number, "AT-1");
  assert.equal((await get(pay.transactionId)).invoiceNumber, "AT-1");
});

test("invoices: an edit doesn't overwrite a payment posted after the read", async () => {
  const inv = await invoice("AT-2");
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 100000, paidDate: "2026-09-10", accountId: S.vnd.id }))).success, true);
  const pay = await S.prisma.paymentAllocation.findFirstOrThrow({ where: { invoiceId: inv.id } });
  assert.equal((await get(pay.transactionId)).status, "REVIEWED");
  as.staff();
  const restore = after(S.prisma.invoice, "findUnique", () => S.prisma.transaction.update({ where: { id: pay.transactionId }, data: { status: "POSTED" } }));
  try {
    const res = await I.updateInvoice(inv.id, fd({ number: "AT-2b", clientId: S.client.id, projectId: "", issueDate: "2026-09-01", dueDate: "2026-09-30", amount: 100000 }));
    assert.equal(res.success, false);
  } finally { restore(); }
  const p = await get(pay.transactionId);
  assert.equal(p.status, "POSTED");
  assert.equal(p.invoiceNumber, "AT-2");
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).number, "AT-2");

  // Once posted, the next edit leaves the payment alone and goes through.
  assert.equal((await I.updateInvoice(inv.id, fd({ number: "AT-2b", clientId: S.client.id, issueDate: "2026-09-01", dueDate: "2026-09-30", amount: 100000 }))).success, true);
  assert.equal((await get(pay.transactionId)).invoiceNumber, "AT-2");
});

test("invoices: an entry rejected after the checks isn't linked; staff can't unlink a payment posted after the check", async () => {
  const inv = await invoice("AT-3");
  const e = await entry("receipt F", "DRAFT");
  as.staff();
  let restore = after(S.prisma.transaction, "findUnique", () => S.prisma.transaction.update({ where: { id: e.id }, data: { status: "REJECTED" } }));
  try {
    const res = await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: e.id, amount: 100000 }));
    assert.equal(res.success, false);
    assert.match(res.message!, /rejected/);
  } finally { restore(); }
  assert.equal(await S.prisma.paymentAllocation.count({ where: { invoiceId: inv.id } }), 0);
  assert.equal(await history(e.id), 0);

  const g = await entry("receipt G", "REVIEWED");
  assert.equal((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: g.id, amount: 100000 }))).success, true);
  const a = await S.prisma.paymentAllocation.findFirstOrThrow({ where: { transactionId: g.id } });
  restore = after(S.prisma.paymentAllocation, "findUnique", () => S.prisma.transaction.update({ where: { id: g.id }, data: { status: "POSTED" } }));
  try {
    const res = await I.unlinkAllocation(a.id);
    assert.equal(res.success, false);
    assert.match(res.message!, /posted/);
  } finally { restore(); }
  assert.equal(await S.prisma.paymentAllocation.count({ where: { id: a.id } }), 1);
});

// ---- tax.ts

test("tax: a declaration or note whose history can't be written isn't saved or deleted", async () => {
  as.admin();
  const q = () => fd({ form: "01/GTGT", period: "2031-Q1", supplement: 0, line_40: "1.000" });
  await historyDown(() => T.saveTaxReturn(null, q()));
  assert.equal(await S.prisma.taxReturn.count({ where: { period: "2031-Q1" } }), 0);

  assert.equal((await T.saveTaxReturn(null, q())).success, true);
  const r = await S.prisma.taxReturn.findFirstOrThrow({ where: { period: "2031-Q1" } });
  await historyDown(() => T.saveTaxReturn(r.id, fd({ form: "01/GTGT", period: "2031-Q1", supplement: 0, line_40: "2.000" })));
  assert.equal((await S.prisma.taxReturn.findUniqueOrThrow({ where: { id: r.id } })).lines, r.lines);
  await historyDown(() => T.deleteTaxReturn(r.id));
  assert.equal(await S.prisma.taxReturn.count({ where: { id: r.id } }), 1);

  await historyDown(() => T.setTaxFlagNote("sales-gap:2031-Q1", "known"));
  assert.equal(await S.prisma.taxFlagNote.count(), 0);
  assert.equal((await T.setTaxFlagNote("sales-gap:2031-Q1", "known")).success, true);
  await historyDown(() => T.clearTaxFlagNote("sales-gap:2031-Q1"));
  assert.equal(await S.prisma.taxFlagNote.count(), 1);
});
