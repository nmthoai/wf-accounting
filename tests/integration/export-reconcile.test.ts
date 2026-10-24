import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";

// The ledger export carries what an accountant needs to reconcile any date
// range against the bank: the statement line each entry is matched to, and
// the entry's ID.
let S: Awaited<ReturnType<typeof seed>>;
let L: typeof import("@/app/actions/ledger");
let B: typeof import("@/app/actions/bank");
let EX: typeof import("@/app/api/reports/export/route");
before(async () => {
  S = await seed();
  L = await import("@/app/actions/ledger");
  B = await import("@/app/actions/bank");
  EX = await import("@/app/api/reports/export/route");
});

async function exportRows() {
  const res = await EX.GET(new Request("http://test/api/reports/export?type=entries&from=2026-07-01&to=2026-07-31"));
  assert.equal(res.status, 200);
  const wb = xlsx.read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
  return xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

test("each entry shows the bank line it is reconciled to and its ID; an unmatched one leaves the line blank", async () => {
  as.admin();
  const st = await S.prisma.bankStatement.create({
    data: { accountId: S.vnd.id, fileName: "jul.xlsx", periodFrom: new Date("2026-07-01"), periodTo: new Date("2026-07-31"), openingBalance: 0, closingBalance: -725, inflows: 0, outflows: 725, lineCount: 1 },
  });
  const line = await S.prisma.bankLine.create({
    data: { accountId: S.vnd.id, statementId: st.id, txnDate: new Date("2026-07-21"), reference: "FT26202", amount: -725, locator: "jul.xlsx · 1 · row 9", dedupeKey: "FT26202|2026-07-21|-725" },
  });
  for (const description of ["bank fee", "hosting"]) {
    assert.equal((await L.createTransaction(fd({ type: "EXPENSE", amount: description === "bank fee" ? 725 : 250000, currency: "VND", date: "2026-07-21", accountId: S.vnd.id, categoryId: S.expense.id, description }))).success, true);
  }
  const fee = await S.prisma.transaction.findFirstOrThrow({ where: { description: "bank fee" } });
  const hosting = await S.prisma.transaction.findFirstOrThrow({ where: { description: "hosting" } });
  assert.equal((await B.matchLine(line.id, [fee.id])).success, true);

  const rows = await exportRows();
  const byDesc = (d: string) => rows.find((r) => r.Description === d)!;
  assert.equal(byDesc("bank fee")["Bank line"], "2026-07-21 · FT26202");
  assert.equal(byDesc("bank fee")["Entry ID"], fee.id);
  assert.equal(byDesc("hosting")["Bank line"], "");
  assert.equal(byDesc("hosting")["Entry ID"], hosting.id);
  // The totals rows stay as they were — blank in the new columns.
  const total = rows.find((r) => r.Type === "TOTAL Expense")!;
  assert.deepEqual([total["Bank line"], total["Entry ID"], total["Amount (VND)"]], ["", "", 250725]);
});

test("the headers follow the user's language", async () => {
  as.admin();
  await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: "vi" } });
  try {
    const headers = Object.keys((await exportRows())[0]);
    assert.ok(headers.includes("Dòng sao kê"), headers.join(", "));
    assert.ok(headers.includes("Mã bút toán"), headers.join(", "));
  } finally {
    await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: null } });
  }
});
