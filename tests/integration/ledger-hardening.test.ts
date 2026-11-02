import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

// Review findings on the ledger and accounts actions: VAT edits by staff,
// retried saves, refusals the user can read, server-side checks of what a
// form or a crafted call sends.
let L: typeof import("@/app/actions/ledger");
let A: typeof import("@/app/actions/accounts");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  L = await import("@/app/actions/ledger");
  A = await import("@/app/actions/accounts");
  S = await seed();
});

const expense = (extra: Record<string, string | number> = {}) =>
  fd({ type: "EXPENSE", amount: 1_100_000, currency: "VND", date: "2026-07-10", accountId: S.vnd.id, categoryId: S.expense.id, description: "Hosting", ...extra });
const make = async (description: string, extra: Record<string, string | number> = {}) => {
  const res = await L.createTransaction(expense({ description, ...extra }));
  assert.equal(res.success, true, res.message);
  return S.prisma.transaction.findFirstOrThrow({ where: { description } });
};
const entry = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });

// Sets the entry's status right after the action's nth read of this kind
// returns, so the action goes on with what it read before the change.
function changeAfterRead(method: "findUnique" | "findMany", n: number, id: string, status: string) {
  const delegate = S.prisma.transaction as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const original = delegate[method];
  let calls = 0;
  delegate[method] = async (...args: unknown[]) => {
    const read = await original(...args);
    if (++calls === n) {
      delegate[method] = original;
      await S.prisma.transaction.updateMany({ where: { id }, data: { status } });
    }
    return read;
  };
  return () => { delegate[method] = original; };
}

test("staff changing the VAT amount on a reviewed expense sends it back for review; evidence alone keeps it reviewed", async () => {
  as.admin();
  const t = await make("vat edit", { vatAmount: 100_000 });
  assert.equal(t.status, "REVIEWED");
  as.staff();
  const evidence = await L.editTransaction(t.id, expense({ description: "vat edit", vatAmount: 100_000, docStatus: "INVOICE" }));
  assert.equal(evidence.success, true, evidence.message);
  assert.deepEqual([(await entry(t.id)).docStatus, (await entry(t.id)).status], ["INVOICE", "REVIEWED"]);

  const vat = await L.editTransaction(t.id, expense({ description: "vat edit", vatAmount: 0, docStatus: "INVOICE" }));
  assert.equal(vat.success, true, vat.message);
  assert.deepEqual([(await entry(t.id)).vatAmount, (await entry(t.id)).status], [0, "DRAFT"]);

  // The owner's own change keeps it reviewed.
  as.admin();
  assert.equal((await L.reviewEntries([t.id])).success, true);
  assert.equal((await L.editTransaction(t.id, expense({ description: "vat edit", vatAmount: 100_000, docStatus: "INVOICE" }))).success, true);
  assert.deepEqual([(await entry(t.id)).vatAmount, (await entry(t.id)).status], [100_000, "REVIEWED"]);
});

test("a retried save with the same request id records once", async () => {
  as.staff();
  const form = () => expense({ description: "retried expense", requestId: "req-expense-1" });
  for (let i = 0; i < 3; i++) assert.equal((await L.createTransaction(form())).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { description: "retried expense" } }), 1);
  // Two arriving at once: one entry, both told it is saved.
  const both = await Promise.all([1, 2].map(() => L.createTransaction(expense({ description: "raced expense", requestId: "req-expense-2" }))));
  assert.deepEqual(both.map((r) => r.success), [true, true]);
  assert.equal(await S.prisma.transaction.count({ where: { description: "raced expense" } }), 1);

  const movement = () => fd({ type: "CAPITAL_IN", accountId: S.vnd.id, amount: 5_000_000, date: "2026-07-01", description: "retried capital", requestId: "req-move-1" });
  for (let i = 0; i < 2; i++) assert.equal((await A.recordMovement(movement())).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { description: "retried capital" } }), 1);

  const transfer = () => fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 2_000_000, date: "2026-07-02", description: "retried transfer", requestId: "req-transfer-1" });
  for (let i = 0; i < 2; i++) assert.equal((await A.createTransfer(transfer())).success, true);
  const legs = await S.prisma.transaction.findMany({ where: { description: "retried transfer" } });
  assert.deepEqual(legs.map((l) => l.type).sort(), ["TRANSFER_IN", "TRANSFER_OUT"]);

  // Without a request id every save records, as before.
  for (let i = 0; i < 2; i++) assert.equal((await L.createTransaction(expense({ description: "no request id" }))).success, true);
  assert.equal(await S.prisma.transaction.count({ where: { description: "no request id" } }), 2);
});

test("deleting a posted entry answers why, instead of throwing", async () => {
  as.admin();
  const t = await make("posted delete");
  assert.equal((await L.postEntries([t.id])).success, true);
  const res = await L.deleteTransaction(t.id);
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /Can't delete — it's posted\. Reverse it instead\./);
  assert.equal((await entry(t.id)).status, "POSTED");
});

test("approving or posting from a stale page says so — never a success for nothing", async () => {
  as.admin();
  const t = await make("stale");
  const approve = await L.reviewEntries([t.id]); // the owner's entry is reviewed already
  assert.deepEqual([approve.success, approve.count], [false, 0]);
  assert.match(approve.message ?? "", /Nothing to approve — reload the page\./);

  assert.equal((await L.postEntries([t.id])).count, 1);
  const again = await L.postEntries([t.id]);
  assert.deepEqual([again.success, again.count], [false, 0]);
  assert.match(again.message ?? "", /Nothing to post — reload the page\./);

  const through = await L.postEntries(null, "2020-01-31");
  assert.equal(through.success, false);
  assert.match(through.message ?? "", /No reviewed entries to post up to 2020-01-31/);
});

test("an entry changed while it was being approved, rejected or posted: reload, not 'something went wrong'", async () => {
  as.staff();
  const draft = await make("changed meanwhile");
  as.admin();
  // withLegs reads the chosen entries, then their legs; approved in between.
  let restore = changeAfterRead("findMany", 2, draft.id, "REVIEWED");
  const review = await L.reviewEntries([draft.id]);
  restore();
  assert.equal(review.success, false);
  assert.match(review.message ?? "", /The entry changed meanwhile — reload the page and try again\./);

  await S.prisma.transaction.update({ where: { id: draft.id }, data: { status: "DRAFT" } });
  restore = changeAfterRead("findMany", 2, draft.id, "REVIEWED");
  const reject = await L.rejectEntries([draft.id], "wrong account");
  restore();
  assert.equal(reject.success, false);
  assert.match(reject.message ?? "", /changed meanwhile/);

  // Posted by someone else meanwhile: say it is posted.
  restore = changeAfterRead("findMany", 2, draft.id, "POSTED");
  const post = await L.postEntries([draft.id]);
  restore();
  assert.equal(post.success, false);
  assert.match(post.message ?? "", /posted meanwhile/);
});

test("a category must exist and be of the entry's type", async () => {
  as.admin();
  const wrong = await L.createTransaction(expense({ description: "wrong category", categoryId: S.income.id }));
  assert.equal(wrong.success, false);
  assert.match(wrong.message ?? "", /is an income category — choose an expense category/);
  const gone = await L.createTransaction(expense({ description: "gone category", categoryId: "no-such-category" }));
  assert.equal(gone.success, false);
  assert.match(gone.message ?? "", /Category not found/);
  // Left empty, it is still optional.
  assert.equal((await L.createTransaction(expense({ description: "no category", categoryId: "" }))).success, true);
  // Editing to a category of the other type is refused too.
  const t = await make("edit category");
  assert.equal((await L.editTransaction(t.id, expense({ description: "edit category", categoryId: S.income.id }))).success, false);
  assert.equal((await entry(t.id)).categoryId, S.expense.id);
});

test("amounts that aren't plain numbers are refused", async () => {
  as.admin();
  const before = await S.prisma.transaction.count();
  for (const bad of ["Infinity", "12abc", "1e999"]) {
    assert.equal((await L.createTransaction(expense({ description: `bad ${bad}`, amount: bad }))).success, false, bad);
    assert.equal((await A.recordMovement(fd({ type: "CAPITAL_IN", accountId: S.vnd.id, amount: bad, date: "2026-07-01" }))).success, false, bad);
    assert.equal((await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: bad, date: "2026-07-01" }))).success, false, bad);
    assert.equal((await A.createTransfer(fd({ fromAccountId: S.usd.id, toAccountId: S.vnd.id, amountOut: 10, amountIn: bad, date: "2026-07-01" }))).success, false, bad);
    const acc = await A.saveAccount(null, fd({ name: `bad opening ${bad}`, type: "BANK", openingBalance: bad }));
    assert.equal(acc.success, false, bad);
  }
  assert.equal(await S.prisma.transaction.count(), before);
  assert.equal(await S.prisma.account.count({ where: { name: { startsWith: "bad opening" } } }), 0);
  // A negative opening balance stays allowed where it was (an owner account), and empty is zero.
  assert.equal((await A.saveAccount(null, fd({ name: "Owner opening", type: "OWNER", openingBalance: "-2500000" }))).success, true);
  assert.equal((await A.saveAccount(null, fd({ name: "Empty opening", type: "CASH", openingBalance: "" }))).success, true);
  assert.equal((await S.prisma.account.findFirstOrThrow({ where: { name: "Empty opening" } })).openingBalance, 0);
});

test("ids that aren't strings are refused, never used as a query filter", async () => {
  as.admin();
  const transfer = await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.owner.id, amountOut: 300_000, date: "2026-07-03", description: "crafted id" }));
  assert.equal(transfer.success, true);
  const crafted = { not: null } as unknown as string;
  const before = await S.prisma.transaction.findMany({ orderBy: { id: "asc" } });

  const results = [
    await A.updateTransfer(crafted, fd({ fromAccountId: S.vnd.id, toAccountId: S.owner.id, amountOut: 1, date: "2026-07-03" })),
    await A.updateMovement(crafted, fd({ type: "CAPITAL_IN", accountId: S.vnd.id, amount: 1, date: "2026-07-03" })),
    await A.classifyMovement(crafted, fd({ type: "EXPENSE", accountId: S.vnd.id, amount: 1, date: "2026-07-03" })),
    await A.updateLoan(crafted, fd({ lender: "x" })),
    await A.deleteLoan(crafted),
    await A.saveAccount(crafted, fd({ name: "x", type: "BANK" })),
    await L.editTransaction(crafted, expense()),
    await L.deleteTransaction(crafted),
    await L.reverseEntry(crafted, "why"),
    await L.revalueEntry(crafted, fd({ reason: "why" })),
    await L.deleteAttachment(crafted),
    await L.reviewEntries([crafted]),
    await L.rejectEntries(crafted as unknown as string[], "why"),
    await L.postEntries({ in: [] } as unknown as string[]),
  ];
  assert.deepEqual(results.map((r) => r.success), results.map(() => false));
  for (const r of results) assert.match(r.message ?? "", /not found/i);
  assert.deepEqual(await S.prisma.transaction.findMany({ orderBy: { id: "asc" } }), before);
});
