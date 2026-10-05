import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";
import { unzipSync } from "fflate";

let S: Awaited<ReturnType<typeof seed>>;
let H: typeof import("@/lib/handover");
let L: typeof import("@/app/actions/ledger");
let I: typeof import("@/app/actions/invoices");
before(async () => {
  S = await seed();
  H = await import("@/lib/handover");
  L = await import("@/app/actions/ledger");
  I = await import("@/app/actions/invoices");
});
const sheet = async (month: string, name: string) => {
  const zip = unzipSync(await H.pack(await H.collect(month), "test"));
  return { zip, rows: xlsx.utils.sheet_to_json<unknown[]>(xlsx.read(zip[`WF-handover-${month}.xlsx`]).Sheets[name], { header: 1 }) };
};

test("M7: invoices appear as they stood at month end — open in July even though paid in August", async () => {
  as.admin();
  await I.createInvoice(fd({ direction: "RECEIVABLE", number: "JUN-1", issueDate: "2026-06-10", dueDate: "2026-07-10", currency: "VND", amount: 3000000 }));
  const inv = await S.prisma.invoice.findFirstOrThrow({ where: { number: "JUN-1" } });
  await I.recordPayment(inv.id, fd({ amount: 3000000, paidDate: "2026-08-05", accountId: S.vnd.id }));
  const { rows } = await sheet("2026-07", "Invoices");
  const row = rows.find((r) => r[1] === "JUN-1") as unknown[];
  assert.ok(row, "listed in July");
  const head = rows[0] as string[];
  assert.equal(row[head.indexOf("Received")], 0); // the August payment isn't counted yet
  assert.equal(row[head.indexOf("Status")], "Open");
});

test("L2: two receipts with the same file name both make it into the ZIP", async () => {
  as.admin();
  await L.createTransaction(fd({ type: "EXPENSE", amount: 5, currency: "VND", date: "2026-07-03", accountId: S.vnd.id, description: "two images",
    files: [new File([new Uint8Array([1])], "image.jpg"), new File([new Uint8Array([2])], "image.jpg")] }));
  const { zip } = await sheet("2026-07", "Ledger");
  assert.equal(Object.keys(zip).filter((n) => n.endsWith("image.jpg")).length, 2);
});

test("L4: a month's bank opening starts from the latest statement that began by then", async () => {
  as.admin();
  const mk = (from: string, to: string, opening: number) => S.prisma.bankStatement.create({ data: { accountId: S.usd.id, fileName: from, periodFrom: new Date(from), periodTo: new Date(to), openingBalance: opening, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 1 } });
  const may = await mk("2026-05-01", "2026-05-31", 0);
  await S.prisma.bankLine.create({ data: { accountId: S.usd.id, statementId: may.id, txnDate: new Date("2026-05-10"), amount: 100, locator: "x", dedupeKey: "m" } });
  // June's statement was never imported; July's says it opened at 300.
  const jul = await mk("2026-07-01", "2026-07-31", 300);
  await S.prisma.bankLine.create({ data: { accountId: S.usd.id, statementId: jul.id, txnDate: new Date("2026-07-15"), amount: 50, locator: "y", dedupeKey: "j" } });
  const b = (await H.collect("2026-07")).bank.find((x) => x.account.id === S.usd.id)!;
  assert.deepEqual([b.opening, b.closing], [300, 350]);
});

test("Excel export of invoices works with the upgraded spreadsheet library", async () => {
  const { GET } = await import("@/app/api/reports/export/route");
  as.admin();
  const res = await GET(new Request("http://test/api/reports/export?type=invoices&from=2026-06-01&to=2026-12-31"));
  assert.equal(res.status, 200);
  const wb = xlsx.read(Buffer.from(await res.arrayBuffer()));
  assert.deepEqual(wb.SheetNames, ["Invoices & Bills"]);
  assert.ok(xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Invoices & Bills"]).some((r) => r.Number === "JUN-1"));
});
