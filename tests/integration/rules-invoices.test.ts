// Owner's rules for invoices and bills (1 Nov 2026): the due date is never before
// the issue date; a receivable needs a client and a number, a bill a vendor and a
// number — refused by the server on create and on edit, with the reason. Old rows
// that predate the rules still load and take payments; they meet the rules when
// next saved. Money still outstanding reads "still to receive / pay", not as an
// unexplained difference; only an overpayment is flagged.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let I: typeof import("@/app/actions/invoices");
let S: Awaited<ReturnType<typeof seed>>;
let clientId: string;
before(async () => {
  I = await import("@/app/actions/invoices");
  S = await seed();
  clientId = (await S.prisma.client.create({ data: { name: "Acme Studio" } })).id;
});

const receivable = (values: Record<string, string | number>) =>
  fd({ direction: "RECEIVABLE", number: "R-1", clientId, issueDate: "2026-10-01", dueDate: "2026-10-31", currency: "VND", amount: 5000000, ...values });
const bill = (values: Record<string, string | number>) =>
  fd({ direction: "PAYABLE", number: "B-1", vendorId: S.vendor.id, issueDate: "2026-10-01", dueDate: "2026-10-31", currency: "VND", amount: 2000000, ...values });
const count = () => S.prisma.invoice.count();

test("a due date before the issue date is refused on create and edit, naming both dates", async () => {
  as.admin();
  const before = await count();
  const res = await I.createInvoice(receivable({ number: "D-1", issueDate: "2026-10-31", dueDate: "2026-10-15" }));
  assert.equal(res.success, false);
  assert.match(res.message!, /due date \(2026-10-15\) is before the issue date \(2026-10-31\)/);
  assert.match(res.message!, /on or after 2026-10-31/);
  assert.equal(await count(), before, "nothing was written");

  // The same day is fine.
  assert.equal((await I.createInvoice(receivable({ number: "D-1", issueDate: "2026-10-31", dueDate: "2026-10-31" }))).success, true);
  const inv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "D-1" } });
  const edit = await I.updateInvoice(inv.id, receivable({ number: "D-1", issueDate: "2026-10-31", dueDate: "2026-10-30" }));
  assert.equal(edit.success, false);
  assert.match(edit.message!, /before the issue date/);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).dueDate.toISOString().slice(0, 10), "2026-10-31");
});

test("a receivable needs a client and an invoice number; a bill needs a vendor, its number may wait (trimmed)", async () => {
  as.staff();
  const before = await count();
  assert.match((await I.createInvoice(receivable({ clientId: "" }))).message!, /Choose the client/);
  assert.match((await I.createInvoice(receivable({ number: "   " }))).message!, /Enter the invoice number/);
  assert.match((await I.createInvoice(bill({ vendorId: "" }))).message!, /Choose the vendor/);
  // A receivable's vendor (or a bill's client) doesn't count as its party.
  assert.match((await I.createInvoice(receivable({ clientId: "", vendorId: S.vendor.id }))).message!, /Choose the client/);
  assert.match((await I.createInvoice(bill({ vendorId: "", clientId }))).message!, /Choose the vendor/);
  // A party that no longer exists is named as such, not a crash.
  assert.match((await I.createInvoice(receivable({ clientId: "gone" }))).message!, /client no longer exists/);
  assert.match((await I.createInvoice(bill({ vendorId: "gone" }))).message!, /vendor no longer exists/);
  assert.equal(await count(), before, "nothing was written");

  assert.equal((await I.createInvoice(receivable({ number: "  R-OK  " }))).success, true);
  const r = await S.prisma.invoice.findFirstOrThrow({ where: { number: "R-OK" } });
  assert.equal(r.clientId, clientId);
  assert.equal((await I.createInvoice(bill({ number: "B-OK" }))).success, true);
  const b = await S.prisma.invoice.findFirstOrThrow({ where: { number: "B-OK" } });
  assert.equal(b.vendorId, S.vendor.id);

  // Editing can't take them away either.
  assert.match((await I.updateInvoice(r.id, receivable({ number: "R-OK", clientId: "" }))).message!, /Choose the client/);
  assert.match((await I.updateInvoice(r.id, receivable({ number: "" }))).message!, /Enter the invoice number/);
  assert.match((await I.updateInvoice(b.id, bill({ number: "B-OK", vendorId: "" }))).message!, /Choose the vendor/);
  const [r2, b2] = await Promise.all([r, b].map((x) => S.prisma.invoice.findUniqueOrThrow({ where: { id: x.id } })));
  assert.deepEqual([r2.number, r2.clientId, b2.number, b2.vendorId], ["R-OK", clientId, "B-OK", S.vendor.id]);

  // A bill can be recorded before the vendor's invoice arrives (an accrual): no number yet.
  assert.equal((await I.createInvoice(bill({ number: "  ", notes: "accrual, invoice to follow" }))).success, true);
  const accrual = await S.prisma.invoice.findFirstOrThrow({ where: { notes: "accrual, invoice to follow" } });
  assert.equal(accrual.number, null);
  assert.equal((await I.updateInvoice(b.id, bill({ number: " " }))).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: b.id } })).number, null);
});

test("an old row that breaks the rules still lists and takes payments; it meets them when next saved", async () => {
  as.admin();
  // Written before the rules: no client, no number, due before issue.
  const old = await S.prisma.invoice.create({
    data: { direction: "RECEIVABLE", issueDate: new Date("2026-06-30"), dueDate: new Date("2026-06-01"), currency: "VND", amount: 1000000, status: "OPEN" },
  });
  assert.ok((await S.prisma.invoice.findMany()).some((i) => i.id === old.id));
  assert.equal((await I.recordPayment(old.id, fd({ amount: 400000, paidDate: "2026-07-05", accountId: S.vnd.id }))).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: old.id } })).status, "PARTIAL");

  const keep = { direction: "RECEIVABLE", issueDate: "2026-06-30", dueDate: "2026-06-01", currency: "VND", amount: 1000000 };
  assert.match((await I.updateInvoice(old.id, fd(keep))).message!, /before the issue date/);
  assert.match((await I.updateInvoice(old.id, fd({ ...keep, dueDate: "2026-07-30" }))).message!, /Choose the client/);
  assert.match((await I.updateInvoice(old.id, fd({ ...keep, dueDate: "2026-07-30", clientId }))).message!, /Enter the invoice number/);
  const res = await I.updateInvoice(old.id, fd({ ...keep, dueDate: "2026-07-30", clientId, number: "OLD-7" }));
  assert.equal(res.success, true, res.message);
});

test("money still outstanding reads as still to receive / still to pay in the muted style; only an overpayment is flagged", async () => {
  as.admin();
  assert.equal((await I.createInvoice(receivable({ number: "P-1", amount: 3000000 }))).success, true);
  const inv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "P-1" } });
  assert.equal((await I.recordPayment(inv.id, fd({ amount: 1000000, paidDate: "2026-10-10", accountId: S.vnd.id }))).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status, "PARTIAL");

  const { translator } = await import("@/i18n/server");
  const { fmtMoney, settlement } = await import("@/lib/money");
  const allocations = await S.prisma.paymentAllocation.findMany({ where: { invoiceId: inv.id } });
  const left = settlement(inv.amount, allocations).difference;
  assert.equal(left, 2000000);
  const en = translator("en", "invoices");
  assert.equal(en("list.stillToReceive", { amount: fmtMoney(left, "VND") }), `still to receive ${fmtMoney(2000000, "VND")}`);
  assert.equal(en("list.stillToPay", { amount: fmtMoney(left, "VND") }), `still to pay ${fmtMoney(2000000, "VND")}`);
  assert.equal(translator("vi", "invoices")("list.stillToReceive", { amount: "x" }), "còn phải thu x");

  // The list: the outstanding line is muted with no fee tooltip; the overpaid line keeps its flag.
  const src = readFileSync(join(process.cwd(), "src/components/invoices/invoices-client.tsx"), "utf8");
  const at = src.indexOf('t("list.stillToPay"');
  assert.notEqual(at, -1);
  const line = src.slice(src.lastIndexOf("<span", at), at);
  assert.match(line, /text-muted-foreground/);
  assert.doesNotMatch(line, /text-warn|title=/);
  assert.match(src, /t\("list\.stillToReceive"/);
  assert.doesNotMatch(src, /unmatchedDifference|differenceTitle/);
  assert.match(src, /text-neg">\{t\("list\.overpaidBy"/);
});
