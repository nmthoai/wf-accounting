import { as, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import * as xlsx from "xlsx";
import { unzipSync } from "fflate";

// Owner rules, 1 Nov 2026: no handover for a month that hasn't started; each
// entry once in the open questions; reviewed entries aren't called locked.

let S: Awaited<ReturnType<typeof seed>>;
let H: typeof import("@/lib/handover");
let $: typeof import("@/lib/money");
let F: typeof import("@/lib/format");
let GET: typeof import("@/app/api/handover/route").GET;
before(async () => {
  S = await seed();
  H = await import("@/lib/handover");
  $ = await import("@/lib/money");
  F = await import("@/lib/format");
  ({ GET } = await import("@/app/api/handover/route"));
});
const shift = (months: number) => {
  const [y, m] = $.vnToday().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 7);
};
const download = (month: string) => GET(new Request(`http://test/api/handover?month=${month}`));

test("the current month (Vietnam time) is the latest one that can be handed over", () => {
  assert.equal(H.currentMonth(), $.vnToday().slice(0, 7));
  assert.equal(H.isFutureMonth(shift(0)), false, "the current, unfinished month is allowed");
  assert.equal(H.isFutureMonth(shift(-1)), false);
  assert.equal(H.isFutureMonth(shift(1)), true);
  assert.equal(H.isFutureMonth(shift(14)), true);
});

test("the download refuses a month that hasn't started, saying which months can be downloaded", async () => {
  as.admin();
  for (const month of [shift(1), shift(13)]) {
    const res = await download(month);
    assert.equal(res.status, 400, month);
    assert.notEqual(res.headers.get("Content-Type"), "application/zip");
    const text = await res.text();
    assert.equal(text, `${F.fmtMonth(month, "en")} hasn't started yet, so there's nothing to hand over. Download ${F.fmtMonth(shift(0), "en")} (the current month, still in progress) or an earlier month.`);
  }
  assert.equal((await download("2026-13")).status, 400, "not a month at all");
  // The current and earlier months still download.
  for (const month of [shift(0), shift(-1)]) assert.equal((await download(month)).status, 200, month);
});

test("an entry with several open issues is listed once, with all of them, on the page and in the workbook", async () => {
  as.admin();
  // Reviewed, not posted, tax review pending and a note: three issues, one entry.
  const t = await S.prisma.transaction.create({
    data: { type: "EXPENSE", status: "REVIEWED", amount: 250_000, currency: "VND", exchangeRate: 1, date: new Date("2026-08-12T00:00:00.000Z"),
      description: "RH grouped", accountId: S.cash.id, categoryId: S.expense.id, reviewNote: "Is this a gift or a client cost?" },
  });
  const d = await H.collect("2026-08");
  assert.equal(H.questions(d).filter((q) => q.ref === t.id).length, 3, "three issues underneath");

  const mine = H.openQuestions(d).filter((q) => q.ref === t.id);
  assert.equal(mine.length, 1, "shown once");
  assert.deepEqual(mine[0].issues.map((i) => i.area), ["Not posted", "Tax review", "Note"]);
  assert.equal(mine[0].item, "2026-08-12 · RH grouped");
  assert.equal(mine[0].amount, "250000 VND");
  assert.equal(H.summarize(d).questions, H.openQuestions(d).length, "the read-me count matches the rows");

  const zip = unzipSync(await H.pack(d, "test"));
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(xlsx.read(zip["WF-handover-2026-08.xlsx"]).Sheets["Open questions"]);
  const row = rows.filter((r) => r.Reference === t.id);
  assert.equal(row.length, 1, "one row in the workbook too");
  assert.equal(row[0].Area, "Not posted, Tax review, Note");
  assert.equal(row[0]["Question / detail"],
    "Not posted: Reviewed but not yet posted, so not locked yet — posting locks it. · Tax review: CIT: Pending review; input VAT: Pending review. · Note: Is this a gift or a client cost?");
});

test("separate items stay separate: a single-issue entry reads as before, and no-statement rows don't merge", async () => {
  as.admin();
  const draft = await S.prisma.transaction.create({
    data: { type: "EXPENSE", status: "DRAFT", amount: 1000, currency: "VND", exchangeRate: 1, date: new Date("2026-09-03T00:00:00.000Z"), description: "RH draft", accountId: S.cash.id, categoryId: S.expense.id },
  });
  for (const id of [S.vnd.id, S.usd.id]) {
    await S.prisma.bankStatement.create({ data: { accountId: id, periodFrom: new Date("2026-06-01T00:00:00.000Z"), periodTo: new Date("2026-06-30T00:00:00.000Z"), openingBalance: 0, closingBalance: 0, inflows: 0, outflows: 0, lineCount: 0, fileName: `rh-${id}.xlsx` } });
  }
  const d = await H.collect("2026-09");
  const open = H.openQuestions(d);
  const one = open.find((q) => q.ref === draft.id)!;
  assert.deepEqual(H.questionCells(one), { area: "Not reviewed", detail: "Draft — excluded from this package's figures until the owner reviews it." });
  const noStatement = open.filter((q) => q.issues.some((i) => i.detail === "No bank statement imported for this month."));
  assert.deepEqual(noStatement.map((q) => q.item).sort(), ["MB USD", "MB VND"], "one row per account without a statement");
});

test("a reviewed entry isn't called locked; only posted ones are", async () => {
  as.admin();
  const t = await S.prisma.transaction.create({
    data: { type: "INCOME", status: "REVIEWED", amount: 5000, currency: "VND", exchangeRate: 1, date: new Date("2026-07-02T00:00:00.000Z"), description: "RH reviewed", accountId: S.cash.id, categoryId: S.income.id },
  });
  const d = await H.collect("2026-07");
  for (const locale of ["en", "vi"] as const) {
    const q = H.questions(d, locale).find((x) => x.ref === t.id)!;
    assert.ok(!/\(locked\)|\(đã khóa\)/i.test(q.detail), q.detail);
  }
  assert.equal(H.questions(d).find((x) => x.ref === t.id)?.detail, "Reviewed but not yet posted, so not locked yet — posting locks it.");
});

// Open questions are grouped by what they are about, not by the displayed
// reference: two statement lines can share "file · sheet · row N".
test("bank lines with the same reference on different accounts stay separate; a part payment is still to receive", () => {
  const line = (id: string, amount: number) => ({
    id, amount, txnDate: new Date("2026-09-12T00:00:00Z"), reference: null, counterparty: "X", description: null,
    locator: "SaoKe.xlsx · Sheet1 · row 12", status: "Not in ledger",
  });
  const data = {
    entries: [], costItems: [], cancelled: () => false,
    bank: [
      { account: { id: "a1", name: "MB VND", currency: "VND" }, covered: true, lines: [line("l1", 1000)] },
      { account: { id: "a2", name: "MB USD", currency: "USD" }, covered: true, lines: [line("l2", 50)] },
    ],
    invoices: [{ id: "i1", number: "INV-9", direction: "RECEIVABLE", status: "PARTIAL", currency: "USD", amount: 1234.5, allocations: [{ kind: "PAYMENT", amount: 1000 }] }],
  } as unknown as Parameters<typeof H.openQuestions>[0];
  const rows = H.openQuestions(data, "en");
  const bank = rows.filter((r) => r.ref === "SaoKe.xlsx · Sheet1 · row 12");
  assert.equal(bank.length, 2);
  assert.deepEqual(bank.map((r) => r.amount).sort(), ["1000 VND", "50 USD"]);
  const inv = rows.find((r) => r.ref === "i1")!;
  assert.match(inv.issues[0].detail, /still to receive 234\.5/);
  assert.doesNotMatch(inv.issues[0].detail, /unmatched/);
});
