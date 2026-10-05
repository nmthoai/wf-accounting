// Acceptance tests for item 3: unusual transactions are explained with the
// existing notes, attachments, review status and tax-review flags — and a note
// never moves money, settles an invoice, claims VAT or becomes income.
import { as, fd, seed, uploadDir } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as xlsx from "xlsx";
import { unzipSync } from "fflate";
import type { Invoice, Transaction } from "@prisma/client";

let L: typeof import("@/app/actions/ledger");
let I: typeof import("@/app/actions/invoices");
let P: typeof import("@/app/actions/projects");
let C: typeof import("@/app/actions/costs");
let B: typeof import("@/app/actions/bank");
let ST: typeof import("@/app/actions/settings");
let M: typeof import("@/lib/money");
let R: typeof import("@/lib/review");
let H: typeof import("@/lib/handover");
let EX: typeof import("@/app/api/reports/export/route");
let UP: typeof import("@/app/api/uploads/[name]/route");
let S: Awaited<ReturnType<typeof seed>>;
let fees: { id: string };
before(async () => {
  L = await import("@/app/actions/ledger");
  I = await import("@/app/actions/invoices");
  P = await import("@/app/actions/projects");
  C = await import("@/app/actions/costs");
  B = await import("@/app/actions/bank");
  ST = await import("@/app/actions/settings");
  M = await import("@/lib/money");
  R = await import("@/lib/review");
  H = await import("@/lib/handover");
  EX = await import("@/app/api/reports/export/route");
  UP = await import("@/app/api/uploads/[name]/route");
  S = await seed();
  fees = await S.prisma.category.create({ data: { name: "Bank & FX Fees", type: "EXPENSE" } });
});

// The owner's own wording for the three exceptions.
const GIFT_NOTE = "Invoice missing. Bank payment verified. ACV relationship gift; tax treatment pending review.";
const STARLINK_NOTE = "Personally paid US$99 Starlink deposit applied to this purchase; not reimbursed.";
const PROJECT_NOTE = "Agreed project value US$9,852; unpaid; collection expected in the last week of October 2026.";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const r2 = (n: number) => Math.round(n * 100) / 100;

// Everything a note could disturb, computed the way the dashboard, accounts and
// invoice pages do (lib/money): balances per account over reviewed + posted
// entries, P&L in VND, what is still open per currency, and every entry's money.
async function books() {
  const [accounts, txns, invoices, allocations] = await Promise.all([
    S.prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    S.prisma.transaction.findMany(),
    S.prisma.invoice.findMany({ orderBy: { createdAt: "asc" }, include: { allocations: M.BOOKED_ALLOCATIONS } }),
    S.prisma.paymentAllocation.findMany(),
  ]);
  const booked = txns.filter(M.isBooked);
  const bal = M.computeBalances(accounts, booked);
  const pnl = (type: string) => r2(booked.filter((t) => t.type === type).reduce((s, t) => s + M.toVnd(t), 0));
  const open = (direction: string) => {
    const out: Record<string, number> = {};
    for (const i of invoices) {
      if (i.direction !== direction || (i.status !== "OPEN" && i.status !== "PARTIAL")) continue;
      out[i.currency] = r2((out[i.currency] ?? 0) + M.settlement(i.amount, i.allocations).difference);
    }
    return out;
  };
  return {
    balances: Object.fromEntries(accounts.map((a) => [a.name, r2(bal.get(a.id) ?? 0)])),
    income: pnl("INCOME"),
    expense: pnl("EXPENSE"),
    openAr: open("RECEIVABLE"),
    openAp: open("PAYABLE"),
    invoices: invoices.map((i) => `${i.number} ${i.status} ${i.paidDate ? iso(i.paidDate) : "-"}`),
    allocations: allocations.map((a) => `${a.invoiceId} ${a.transactionId} ${a.kind} ${a.amount}`).sort(),
    entries: txns.map((t) => `${t.id} ${t.type} ${t.amount} ${t.currency} ${t.exchangeRate} ${t.vndAmount} ${t.status} ${t.accountId}`).sort(),
  };
}

// The Excel export (the real route): P&L totals and open AR/AP for 2026.
async function exported() {
  const read = async (type: string) => {
    const res = await EX.GET(new Request(`http://test/api/reports/export?type=${type}&from=2026-01-01&to=2026-12-31`));
    assert.equal(res.status, 200);
    const wb = xlsx.read(Buffer.from(await res.arrayBuffer()));
    return xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  };
  const entries = await read("entries");
  const invoices = await read("invoices");
  const total = (label: string) => entries.find((r) => r.Type === label)?.["Amount (VND)"];
  const open = (label: string) => Object.fromEntries(invoices.filter((r) => r.Direction === label && r.Currency).map((r) => [r.Currency, r["Unmatched difference"]]));
  return {
    income: total("TOTAL Income"), expense: total("TOTAL Expense"), net: total("NET"),
    openAr: open("Open AR (owed to you)"), openAp: open("Open AP (you owe)"),
    invoiceRows: invoices.filter((r) => r.Number).map((r) => [r.Number, r.Project, r.Status, r.Received, r["Unmatched difference"]]),
  };
}

// What the project page shows (src/app/(dashboard)/projects/[id]/page.tsx):
// income/expense from its reviewed entries, outstanding from its open invoices.
async function projectFigures(id: string) {
  const p = await S.prisma.project.findUniqueOrThrow({ where: { id }, include: { transactions: { where: M.BOOKED } } });
  const open = await S.prisma.invoice.findMany({ where: { projectId: id, status: { in: ["OPEN", "PARTIAL"] } }, include: { allocations: M.BOOKED_ALLOCATIONS } });
  const sum = (type: string) => p.transactions.filter((t) => t.type === type).reduce((s, t) => s + M.toVnd(t), 0);
  return { income: sum("INCOME"), expense: sum("EXPENSE"), open: open.map((i) => [i.number, i.currency, M.settlement(i.amount, i.allocations).difference]) };
}

// The entry form as the app sends it when an existing entry is edited: every
// field, review decisions included. A foreign entry's form shows today's
// default rate mode, as the owner saw.
const formOf = (t: Transaction, extra: Record<string, string | number | File | File[]> = {}) => fd({
  type: t.type, amount: t.amount, currency: t.currency, date: iso(t.date), accountId: t.accountId,
  rateMode: t.currency === "VND" ? undefined : "DEFAULT",
  description: t.description ?? "", invoiceNumber: t.invoiceNumber ?? "", categoryId: t.categoryId ?? "", projectId: t.projectId ?? "",
  vendorId: t.type === "EXPENSE" ? t.vendorId ?? "" : "",
  docStatus: t.docStatus, purposeStatus: t.purposeStatus, citStatus: t.citStatus, vatStatus: t.vatStatus,
  vatAmount: t.vatAmount ?? "", reviewNote: t.reviewNote ?? "", ...extra,
});
const invoiceForm = (i: Invoice, extra: Record<string, string | number | File> = {}) => fd({
  number: i.number, clientId: i.clientId, vendorId: i.vendorId, projectId: i.projectId, categoryId: i.categoryId,
  issueDate: iso(i.issueDate), dueDate: iso(i.dueDate), currency: i.currency, amount: i.amount, notes: i.notes, ...extra,
});
const entry = async (description: string, values: Record<string, string | number | File | File[]>) => {
  const res = await L.createTransaction(fd({ type: "EXPENSE", currency: "VND", accountId: S.vnd.id, categoryId: S.expense.id, description, ...values }));
  assert.equal(res.success, true, res.message);
  return S.prisma.transaction.findFirstOrThrow({ where: { description } });
};
const reload = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });
async function invoice(number: string, values: Record<string, string | number | File | File[]>) {
  const res = await I.createInvoice(fd({ direction: "RECEIVABLE", number, issueDate: "2026-08-01", dueDate: "2026-08-31", ...values }));
  assert.equal(res.success, true, res.message);
  return S.prisma.invoice.findFirstOrThrow({ where: { number } });
}
const updates = async (id: string) =>
  (await S.prisma.changeLog.findMany({ where: { entityId: id, action: "UPDATE" }, orderBy: { createdAt: "asc" } })).map((h) => h.field);

test("'Invoice missing' note on an expense: balances, document status and tax review stay exactly as they were", async () => {
  as.admin();
  const gift = await entry("ACV relationship gift", { amount: 3500000, date: "2026-09-12", docStatus: "MISSING" });
  const month = async () => { const d = await H.collect("2026-09"); return { d, s: H.summarize(d) }; };
  const [before, exBefore, hoBefore] = [await books(), await exported(), (await month()).s];

  const res = await L.editTransaction(gift.id, formOf(gift, { reviewNote: GIFT_NOTE }));
  assert.equal(res.success, true, res.message);

  assert.deepEqual(await books(), before);
  assert.deepEqual(await exported(), exBefore);
  const after = await reload(gift.id);
  // "Bank payment verified" is the user's words, not a document status; nothing is inferred from them.
  assert.deepEqual(
    [after.reviewNote, after.docStatus, after.purposeStatus, after.citStatus, after.vatStatus, after.vatAmount, after.amount, after.status],
    [GIFT_NOTE, "MISSING", "PENDING", "PENDING", "PENDING", null, 3500000, "REVIEWED"],
  );
  assert.deepEqual(await updates(gift.id), ["reviewNote"]); // the only change on record

  // The accountant still sees it as a missing document, with the note as the open question.
  const { d, s } = await month();
  assert.deepEqual([s.income, s.expense, s.missingDocs], [hoBefore.income, hoBefore.expense, hoBefore.missingDocs]);
  assert.ok(d.booked.some((t) => t.id === gift.id && R.DOC_OPEN.includes(t.docStatus)));
  assert.ok(H.questions(d).some((q) => q.ref === gift.id && q.detail === GIFT_NOTE));
});

test("a note can't make VAT claimable: without the invoice on file the claim is refused, whatever the note says", async () => {
  as.admin();
  const gift = await entry("ACV gift (VAT check)", { amount: 3300000, date: "2026-09-13", docStatus: "MISSING", reviewNote: GIFT_NOTE });
  const before = await books();
  for (const reviewNote of [GIFT_NOTE, "VAT invoice received by email; VAT claimable."]) {
    const res = await L.editTransaction(gift.id, formOf(gift, { reviewNote, purposeStatus: "CONFIRMED", vatStatus: "CLAIMABLE", vatAmount: 300000 }));
    assert.equal(res.success, false);
    assert.match(res.message ?? "", /invoice on file/);
  }
  const after = await reload(gift.id);
  assert.deepEqual([after.vatStatus, after.purposeStatus, after.vatAmount, after.reviewNote], ["PENDING", "PENDING", null, GIFT_NOTE]);
  assert.deepEqual(await books(), before);
  // The rule itself, independent of the form.
  assert.equal(R.reviewProblem({ type: "EXPENSE", amount: 3300000, docStatus: "MISSING", purposeStatus: "CONFIRMED", citStatus: "PENDING", vatStatus: "CLAIMABLE", vatAmount: 300000, reviewNote: GIFT_NOTE }), "vatNeedsInvoice");
});

test("Starlink deposit paid personally: the note keeps the owner-paid balance, the booked rate and adds no reimbursement", async () => {
  as.admin();
  const before = await books();
  const deposit = await entry("Starlink kit deposit", { amount: 99, currency: "USD", rateMode: "MANUAL", rate: 26400, date: "2026-09-20", accountId: S.owner.id, docStatus: "RECEIPT" });
  const booked = await books();
  assert.equal(r2(booked.balances["Owner-paid"] - before.balances["Owner-paid"]), -2613600); // the company owes the owner 99 × 26,400

  await ST.updateExchangeRate(fd({ rate: 26000 })); // the default moves on before the note is written
  try {
    const res = await L.editTransaction(deposit.id, formOf(deposit, { description: STARLINK_NOTE, reviewNote: STARLINK_NOTE }));
    assert.equal(res.success, true, res.message);
  } finally {
    await ST.updateExchangeRate(fd({ rate: 25400 }));
  }
  assert.deepEqual(await books(), booked); // no transfer, repayment or other entry; nothing re-priced
  const after = await reload(deposit.id);
  assert.deepEqual([after.amount, after.currency, after.exchangeRate, after.rateSource, M.toVnd(after), after.accountId], [99, "USD", 26400, "MANUAL", 2613600, S.owner.id]);
  assert.deepEqual(await updates(deposit.id), ["description", "reviewNote"]);

  // The same note on the cost register item stays a note: nothing reaches the ledger.
  const saved = await C.saveCostItem(null, fd({ provider: "Starlink", receiptDate: "2026-09-20", amount: 99, currency: "USD", payer: "OWNER", reimbursement: "UNRESOLVED", notes: STARLINK_NOTE, reviewNote: STARLINK_NOTE }));
  assert.equal(saved.success, true, saved.message);
  const item = await S.prisma.costItem.findFirstOrThrow({ where: { provider: "Starlink" } });
  assert.deepEqual([item.status, item.transactionId, item.notes], ["PENDING", null, STARLINK_NOTE]);
  assert.deepEqual(await books(), booked);
});

test("an OPEN invoice whose notes say 'paid' stays open; a part-paid one keeps exactly its settlement", async () => {
  as.admin();
  const open = await invoice("NOTE-OPEN", { currency: "VND", amount: 20000000, notes: "Issued 1 Aug." });
  const part = await invoice("NOTE-PART", { currency: "USD", amount: 1000 });
  assert.equal((await I.recordPayment(part.id, fd({ amount: 400, paidDate: "2026-08-20", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000 }))).success, true);
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "NOTE-PART" } });
  const before = await books();
  const exBefore = await exported();

  for (const [inv, notes] of [[open, "Paid in full on 1 Oct per client email."], [part, "Client says the balance is paid; bank shows US$400 so far."]] as const) {
    const res = await I.updateInvoice(inv.id, invoiceForm(inv, { notes }));
    assert.equal(res.success, true, res.message);
  }

  const [o, p] = await Promise.all([open, part].map((i) => S.prisma.invoice.findUniqueOrThrow({ where: { id: i.id }, include: { allocations: true } })));
  assert.deepEqual([o.status, o.paidDate, o.allocations.length], ["OPEN", null, 0]);
  assert.deepEqual([p.status, p.paidDate, M.settlement(p.amount, p.allocations).difference], ["PARTIAL", null, 600]);
  assert.deepEqual(await books(), before);
  assert.deepEqual(await exported(), { ...exBefore, invoiceRows: exBefore.invoiceRows });
  assert.deepEqual(await updates(pay.id), []); // the payment entry itself is untouched
});

test("a project-value note isn't income or a receivable, and doesn't duplicate the invoice once it's issued", async () => {
  as.admin();
  const client = await S.prisma.client.create({ data: { name: "ACV" } });
  const before = await books();
  const exBefore = await exported();
  const hoBefore = H.summarize(await H.collect("2026-10"));

  assert.equal((await P.createProject(fd({ name: "ACV portal", clientId: client.id, notes: PROJECT_NOTE }))).success, true);
  const project = await S.prisma.project.findFirstOrThrow({ where: { name: "ACV portal" } });
  assert.equal((await P.updateProject(project.id, fd({ name: "ACV portal", clientId: client.id, status: "ACTIVE", description: PROJECT_NOTE }))).success, true);

  // A value in a note is not money: no entry, no invoice, no income, nothing open.
  assert.deepEqual(await books(), before);
  assert.deepEqual(await exported(), exBefore);
  assert.deepEqual(await projectFigures(project.id), { income: 0, expense: 0, open: [] });

  // The issued invoice is what the client owes — counted once, and still not income (cash basis).
  await invoice("ACV-2026-10", { clientId: client.id, projectId: project.id, currency: "USD", amount: 9852, issueDate: "2026-10-01", dueDate: "2026-10-31", notes: PROJECT_NOTE });
  const after = await books();
  assert.deepEqual([after.balances, after.income, after.expense, after.entries], [before.balances, before.income, before.expense, before.entries]);
  assert.equal(r2((after.openAr.USD ?? 0) - (before.openAr.USD ?? 0)), 9852);
  assert.equal(after.invoices.length - before.invoices.length, 1);
  const ex = await exported();
  assert.deepEqual([ex.income, ex.expense, ex.net], [exBefore.income, exBefore.expense, exBefore.net]);
  assert.equal(r2(Number(ex.openAr.USD ?? 0) - Number(exBefore.openAr.USD ?? 0)), 9852);
  assert.deepEqual(ex.invoiceRows.filter((r) => r[1] === "ACV portal").map((r) => [r[0], r[4]]), [["ACV-2026-10", 9852]]);
  assert.deepEqual(await projectFigures(project.id), { income: 0, expense: 0, open: [["ACV-2026-10", "USD", 9852]] });
  const ho = H.summarize(await H.collect("2026-10"));
  assert.deepEqual([ho.income, ho.expense], [hoBefore.income, hoBefore.expense]);
});

test("a staff note on a posted entry changes the note only — status, money and balances stay", async () => {
  as.admin();
  const t = await entry("Posted gift", { amount: 2000000, date: "2026-09-14", docStatus: "MISSING" });
  await L.postEntries([t.id]);
  const posted = await reload(t.id);
  const before = await books();
  as.staff();
  const res = await L.editTransaction(t.id, formOf(posted, { reviewNote: GIFT_NOTE }));
  assert.equal(res.success, true, res.message);
  as.admin();
  const after = await reload(t.id);
  assert.deepEqual([after.status, after.reviewNote, after.docStatus, after.vatStatus], ["POSTED", GIFT_NOTE, "MISSING", "PENDING"]);
  assert.deepEqual(await books(), before);
});

test("a staff note on a reviewed entry doesn't take its money out of the balances", async () => {
  as.admin();
  const t = await entry("Reviewed gift", { amount: 1200000, date: "2026-09-15", docStatus: "MISSING" });
  const before = await books();
  as.staff();
  const res = await L.editTransaction(t.id, formOf(t, { reviewNote: GIFT_NOTE }));
  assert.equal(res.success, true, res.message);
  as.admin();
  assert.equal((await reload(t.id)).reviewNote, GIFT_NOTE);
  assert.deepEqual(await books(), before);
});

test("a staff note on a part-paid invoice leaves its payment, its status and the bank balance as they were", async () => {
  as.admin();
  const inv = await invoice("NOTE-STAFF", { currency: "USD", amount: 2000 });
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 800, paidDate: "2026-09-10", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000 }))).success, true);
  const before = await books();
  as.staff();
  const res = await I.updateInvoice(inv.id, invoiceForm(inv, { notes: "Client promised the rest by end of September." }));
  assert.equal(res.success, true, res.message);
  as.admin();
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "NOTE-STAFF" } });
  const after = await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
  const usd = (await books()).balances["MB USD"] - before.balances["MB USD"];
  assert.deepEqual({ payment: pay.status, invoice: after.status, mbUsdMoved: usd }, { payment: "REVIEWED", invoice: "PARTIAL", mbUsdMoved: 0 });
  assert.deepEqual(await books(), before);
});

test("Mark paid saved twice (retry) records one payment and one withheld fee, never two", async () => {
  as.admin();
  const inv = await invoice("E-RETRY", { currency: "USD", amount: 1998.75 });
  const before = await books();
  const form = (requestId: string) => fd({ amount: 1998.75, feeDeducted: 26, feeCategoryId: fees.id, paidDate: "2026-08-07", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, requestId });
  for (let i = 0; i < 2; i++) {
    const res = await I.recordPayment(inv.id, form("mark-paid-E-RETRY"));
    assert.equal(res.success, true, res.message);
  }
  const ledger = await S.prisma.transaction.findMany({ where: { invoiceNumber: "E-RETRY" }, orderBy: { type: "asc" } });
  assert.deepEqual(ledger.map((t) => [t.type, t.amount]), [["EXPENSE", 26], ["INCOME", 1998.75]]);
  const allocations = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
  assert.deepEqual(allocations.map((a) => [a.kind, a.amount]), [["PAYMENT", 1998.75]]);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PAID");
  const after = await books();
  assert.equal(r2(after.balances["MB USD"] - before.balances["MB USD"]), 1972.75);
  assert.equal(after.entries.length - before.entries.length, 2);
  assert.equal(await S.prisma.changeLog.count({ where: { entity: "Invoice", entityId: inv.id, action: "PAYMENT" } }), 1);

  // A new save for a settled invoice is refused, and the same receipt can't be linked to it again.
  const again = await I.recordPayment(inv.id, form("mark-paid-E-RETRY-2"));
  assert.equal(again.success, false);
  assert.match(again.message ?? "", /Nothing left to settle/);
  const income = ledger.find((t) => t.type === "INCOME")!;
  assert.match((await I.linkToInvoice(inv.id, fd({ kind: "PAYMENT", transactionId: income.id, amount: 1 }))).message ?? "", /Already linked/);
  assert.deepEqual(await books(), after);
});

test("Mark paid clicked twice at once still records one entry", async () => {
  as.admin();
  const full = await invoice("E-DOUBLE", { currency: "USD", amount: 3000 });
  const part = await invoice("E-DOUBLE-PART", { currency: "USD", amount: 3000 });
  const form = (amount: number, requestId: string) => fd({ amount, paidDate: "2026-08-12", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, requestId });
  const fullRes = await Promise.all([I.recordPayment(full.id, form(3000, "dbl-full")), I.recordPayment(full.id, form(3000, "dbl-full"))]);
  const partRes = await Promise.all([I.recordPayment(part.id, form(1000, "dbl-part")), I.recordPayment(part.id, form(1000, "dbl-part"))]);
  // Only the data is guaranteed here: when the first save settles the whole invoice, the
  // second may answer "Nothing left to settle" instead of success (seen: [true, false]).
  assert.ok(fullRes.some((r) => r.success), JSON.stringify(fullRes));
  assert.deepEqual(partRes.map((r) => r.success), [true, true], JSON.stringify(partRes));
  for (const [inv, paid, status] of [[full, 3000, "PAID"], [part, 1000, "PARTIAL"]] as const) {
    assert.equal(await S.prisma.transaction.count({ where: { invoiceNumber: inv.number } }), 1);
    const allocations = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
    assert.deepEqual(allocations.map((a) => a.amount), [paid]);
    assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, status);
  }
});

test("a payment recorded from the invoice can't be entered a second time from its bank line", async () => {
  as.admin();
  const inv = await invoice("E-BANK", { currency: "USD", amount: 1998.75 });
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 1998.75, feeDeducted: 26, feeCategoryId: fees.id, paidDate: "2026-08-25", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, requestId: "bank-route" }))).success, true);
  const receipt = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "E-BANK", type: "INCOME" } });
  const st = await S.prisma.bankStatement.create({ data: { accountId: S.usd.id, fileName: "synthetic.xlsx", periodFrom: new Date("2026-08-25"), periodTo: new Date("2026-08-25"), openingBalance: 0, closingBalance: 1972.75, inflows: 1972.75, outflows: 0, lineCount: 1 } });
  const line = await S.prisma.bankLine.create({ data: { accountId: S.usd.id, statementId: st.id, txnDate: new Date("2026-08-25"), amount: 1972.75, reference: "FT-E-BANK", locator: "synthetic.xlsx · 1", dedupeKey: "FT-E-BANK" } });
  const m = await B.matchLine(line.id, [receipt.id]);
  assert.equal(m.success, true, m.message);
  const before = await books();
  const res = await L.createTransaction(fd({ type: "INCOME", amount: 1972.75, currency: "USD", date: "2026-08-25", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, description: "E-BANK again from the bank line", bankLineId: line.id }));
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /more than the bank line/);
  assert.equal(await S.prisma.transaction.count({ where: { description: "E-BANK again from the bank line" } }), 0);
  assert.deepEqual(await books(), before);
});

test("evidence keeps its original file name and bytes — on an expense, after a note edit, on a payment and in the handover ZIP", async () => {
  as.admin();
  const draftName = "Hóa đơn GTGT 0001234 (bản nháp).pdf";
  const adviceName = "MB bank advice 07-08.png";
  const draftBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 250, 251]);
  const adviceBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 8, 7]);
  const gift = await entry("ACV gift basket", {
    amount: 1500000, date: "2026-08-18", docStatus: "MISSING",
    files: [new File([draftBytes], draftName, { type: "application/pdf" }), new File([adviceBytes], adviceName, { type: "image/png" })],
  });
  const onDisk = async (filePath: string) => new Uint8Array(await readFile(join(uploadDir!, filePath)));
  const stored = await S.prisma.attachment.findMany({ where: { transactionId: gift.id } });
  const original = [adviceName, draftName].map((n) => stored.find((a) => a.fileName === n)!);
  assert.deepEqual(original.map((a) => [a?.fileName, a?.fileType]), [[adviceName, "image/png"], [draftName, "application/pdf"]]);
  assert.equal(stored.length, 2);
  for (const a of original) assert.match(a.filePath, /^[0-9a-f-]{36}\.(pdf|png)$/); // stored under a key, never the user's name
  assert.deepEqual(await onDisk(original[0].filePath), adviceBytes);
  assert.deepEqual(await onDisk(original[1].filePath), draftBytes);

  // A note edit with a newer file of the same name adds it beside the original — nothing is overwritten.
  const newer = new Uint8Array([7, 7, 7]);
  const res = await L.editTransaction(gift.id, formOf(gift, { reviewNote: GIFT_NOTE, files: new File([newer], draftName, { type: "application/pdf" }) }));
  assert.equal(res.success, true, res.message);
  const now = await S.prisma.attachment.findMany({ where: { transactionId: gift.id } });
  assert.equal(now.length, 3);
  for (const a of original) {
    const same = now.find((x) => x.id === a.id);
    assert.deepEqual([same?.fileName, same?.filePath], [a.fileName, a.filePath]);
  }
  assert.deepEqual(await onDisk(original[1].filePath), draftBytes);
  const added = now.find((x) => !original.some((o) => o.id === x.id))!;
  assert.deepEqual([added.fileName, await onDisk(added.filePath)], [draftName, newer]);

  // Served back under the original name, byte for byte.
  const served = await UP.GET(new Request(`http://test/api/uploads/${original[1].filePath}`), { params: Promise.resolve({ name: original[1].filePath }) });
  assert.equal(served.status, 200);
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), draftBytes);
  assert.ok(served.headers.get("Content-Disposition")?.includes(encodeURIComponent(draftName)));

  // Evidence given with Mark paid stays with the receipt, once, as uploaded.
  const swift = new Uint8Array([0x25, 0x50, 0x44, 0x46, 42, 43]);
  const inv = await invoice("E-EVID", { currency: "USD", amount: 1998.75 });
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 1998.75, feeDeducted: 26, feeCategoryId: fees.id, paidDate: "2026-08-07", accountId: S.usd.id, rateMode: "MANUAL", rate: 26000, requestId: "evidence-1", files: new File([swift], "SWIFT MT103 E-EVID.pdf", { type: "application/pdf" }) }))).success, true);
  const [fee, receipt] = await S.prisma.transaction.findMany({ where: { invoiceNumber: "E-EVID" }, orderBy: { type: "asc" }, include: { attachments: true } });
  assert.deepEqual([fee.attachments.length, receipt.attachments.map((a) => a.fileName)], [0, ["SWIFT MT103 E-EVID.pdf"]]);
  assert.deepEqual(await onDisk(receipt.attachments[0].filePath), swift);

  // The accountant's ZIP carries the same bytes.
  const zip = unzipSync(await H.pack(await H.collect("2026-08"), "test"));
  for (const [a, bytes] of [[original[1], draftBytes], [original[0], adviceBytes], [receipt.attachments[0], swift]] as const) {
    const key = Object.keys(zip).find((k) => k.includes(`_${a.id.slice(-6)}_`));
    assert.ok(key, `${a.fileName} in the ZIP`);
    assert.deepEqual(zip[key], bytes);
  }
});

test("a draft or supporting extract is never taken for the final invoice — only the user's own 'Invoice on file' counts", async () => {
  as.admin();
  // File names and a note that sound final change nothing by themselves.
  const kit = await entry("Starlink kit", {
    amount: 11000000, date: "2026-09-22", reviewNote: "Final VAT invoice attached — VAT claimable.",
    files: [new File([new Uint8Array([1])], "FINAL VAT INVOICE 0001234.pdf"), new File([new Uint8Array([2])], "draft invoice extract.pdf")],
  });
  assert.deepEqual([kit.docStatus, kit.vatStatus, kit.vatAmount], ["PENDING", "PENDING", null]);

  // A receipt, payment proof or nothing at all can't carry claimable VAT.
  for (const docStatus of ["PENDING", "RECEIPT", "PAYMENT_ONLY", "MISSING"]) {
    const res = await L.editTransaction(kit.id, formOf(kit, { docStatus, purposeStatus: "CONFIRMED", vatStatus: "CLAIMABLE", vatAmount: 1000000 }));
    assert.equal(res.success, false, docStatus);
    assert.match(res.message ?? "", /invoice on file/);
  }
  assert.deepEqual([(await reload(kit.id)).docStatus, (await reload(kit.id)).vatStatus], ["PENDING", "PENDING"]);

  // Staff may record that the invoice is on file, but not the VAT decision.
  as.staff();
  assert.equal((await L.editTransaction(kit.id, formOf(kit, { docStatus: "INVOICE", purposeStatus: "CONFIRMED", vatStatus: "CLAIMABLE" }))).success, true);
  const byStaff = await reload(kit.id);
  assert.deepEqual([byStaff.docStatus, byStaff.purposeStatus, byStaff.vatStatus], ["INVOICE", "PENDING", "PENDING"]);

  // The owner, with the invoice on file by an explicit choice, can then decide it.
  as.admin();
  const res = await L.editTransaction(kit.id, formOf(byStaff, { docStatus: "INVOICE", purposeStatus: "CONFIRMED", vatStatus: "CLAIMABLE", vatAmount: 1000000 }));
  assert.equal(res.success, true, res.message);
  assert.deepEqual([(await reload(kit.id)).vatStatus, (await reload(kit.id)).vatAmount], ["CLAIMABLE", 1000000]);

  // A bill's attached PDF stays the bill's; its payment isn't marked as invoiced.
  const res2 = await I.createInvoice(fd({ direction: "PAYABLE", number: "BILL-FINAL", vendorId: S.vendor.id, issueDate: "2026-09-01", dueDate: "2026-09-30", currency: "VND", amount: 4400000, files: new File([new Uint8Array([3])], "bill-final-signed.pdf") }));
  assert.equal(res2.success, true, res2.message);
  const bill = await S.prisma.invoice.findFirstOrThrow({ where: { number: "BILL-FINAL" }, include: { attachments: true } });
  assert.deepEqual(bill.attachments.map((a) => a.fileName), ["bill-final-signed.pdf"]);
  assert.equal((await I.recordPayment(bill.id, fd({ amount: 4400000, paidDate: "2026-09-25", accountId: S.vnd.id }))).success, true);
  const pay = await S.prisma.transaction.findFirstOrThrow({ where: { invoiceNumber: "BILL-FINAL" }, include: { attachments: true } });
  assert.deepEqual([pay.type, pay.docStatus, pay.vatStatus, pay.attachments.length], ["EXPENSE", "PENDING", "PENDING", 0]);
});
