// Owner's rules for invoices and bills (1 Nov 2026): the due date is never before
// the issue date; a receivable needs a client and a number, a bill a vendor and a
// number — unless it is marked "no invoice yet", which saves it without one and
// keeps it flagged — refused by the server on create and on edit, with the reason. Old rows
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

test("a receivable needs a client and an invoice number; a bill needs a vendor and its number (trimmed)", async () => {
  as.staff();
  const before = await count();
  assert.match((await I.createInvoice(receivable({ clientId: "" }))).message!, /Choose the client/);
  assert.match((await I.createInvoice(receivable({ number: "   " }))).message!, /Enter the invoice number/);
  assert.match((await I.createInvoice(bill({ vendorId: "" }))).message!, /Choose the vendor/);
  assert.match((await I.createInvoice(bill({ number: "   " }))).message!, /Enter the bill number.*No invoice yet/);
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

  assert.match((await I.updateInvoice(b.id, bill({ number: " " }))).message!, /Enter the bill number/);
});

test("\"no invoice yet\" saves a bill or receivable without a number, flagged in the list and the handover until the number is entered", async () => {
  as.admin();
  // A bill before the vendor's invoice arrives (an accrual); a receivable before its e-invoice is issued.
  assert.equal((await I.createInvoice(bill({ number: "typed anyway", noInvoiceYet: "on", notes: "accrual, invoice to follow" }))).success, true);
  const accrual = await S.prisma.invoice.findFirstOrThrow({ where: { notes: "accrual, invoice to follow" } });
  assert.equal(accrual.number, null, "the flag wins over a typed number");
  assert.equal((await I.createInvoice(receivable({ number: "", noInvoiceYet: "on", notes: "e-invoice to issue" }))).success, true);
  const pending = await S.prisma.invoice.findFirstOrThrow({ where: { notes: "e-invoice to issue" } });
  assert.equal(pending.number, null);
  // The rest of the rules still hold.
  assert.match((await I.createInvoice(bill({ noInvoiceYet: "on", vendorId: "" }))).message!, /Choose the vendor/);

  // The handover asks about each one, in its own words, until the number is in.
  const { collect, openQuestions } = await import("@/lib/handover");
  const asked = async () => openQuestions(await collect("2026-10"), "en").filter((q) => q.issues.some((i) => /No invoice yet/.test(i.detail)));
  const details = (await asked()).flatMap((q) => q.issues.map((i) => i.detail));
  assert.ok(details.includes("No invoice yet — the vendor's invoice hasn't arrived."));
  assert.ok(details.includes("No invoice yet — the invoice hasn't been issued."));
  // Each row says which one it is: no number, so the party and issue date.
  const items = (await asked()).map((q) => q.item);
  assert.ok(items.includes(`Bill without a number · ${S.vendor.name} · issued 2026-10-01`), items.join(" | "));
  assert.ok(items.includes("Invoice without a number · Acme Studio · issued 2026-10-01"), items.join(" | "));
  const before = (await asked()).length;

  // The invoice arrives: entering its number clears the flag.
  assert.equal((await I.updateInvoice(accrual.id, bill({ number: "B-ARRIVED", notes: "accrual, invoice to follow" }))).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: accrual.id } })).number, "B-ARRIVED");
  assert.equal((await asked()).length, before - 1);
  // And it can be set back while the invoice is still missing.
  assert.equal((await I.updateInvoice(accrual.id, bill({ number: "B-ARRIVED", noInvoiceYet: "on" }))).success, true);
  assert.equal((await S.prisma.invoice.findUniqueOrThrow({ where: { id: accrual.id } })).number, null);

  // Part paid as well: one row with both issues, and its amount is what is still open.
  assert.equal((await I.recordPayment(pending.id, fd({ amount: 1000000, paidDate: "2026-10-20", accountId: S.vnd.id }))).success, true);
  const row = (await asked()).find((q) => q.ref === pending.id)!;
  assert.equal(row.issues.length, 2);
  assert.match(row.issues.map((i) => i.detail).join(" "), /still to receive/);
  assert.equal(row.amount, "4000000 VND");

  // The list shows the chip on such rows, and both forms carry the checkbox.
  for (const f of ["src/components/invoices/invoices-client.tsx", "src/components/invoices/edit-invoice-dialog.tsx"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.match(src, /name="noInvoiceYet"/);
    assert.match(src, /required=\{!noInvoiceYet\} disabled=\{noInvoiceYet\}/);
  }
  assert.match(readFileSync(join(process.cwd(), "src/components/invoices/invoices-client.tsx"), "utf8"), /!i\.number && i\.status !== "VOID" && <Chip tone="warn"[^>]*>\{t\("list\.noInvoiceYet"\)\}/);
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
