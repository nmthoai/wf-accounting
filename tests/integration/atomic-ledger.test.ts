import { as, fd, seed } from "../helpers/setup";
import { before, mock, test } from "node:test";
import assert from "node:assert/strict";

// Ledger writes are guarded by the status they were read with, and each one
// commits together with its change history or not at all.
let L: typeof import("@/app/actions/ledger");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  L = await import("@/app/actions/ledger");
  S = await seed();
});

const expense = (extra: Record<string, string | number> = {}) =>
  fd({ type: "EXPENSE", amount: 250000, currency: "VND", date: "2026-07-10", accountId: S.vnd.id, categoryId: S.expense.id, description: "Hosting", ...extra });
const make = async (description: string, extra: Record<string, string | number> = {}) => {
  const res = await L.createTransaction(expense({ description, ...extra }));
  assert.equal(res.success, true, res.message);
  return S.prisma.transaction.findFirstOrThrow({ where: { description } });
};
const entry = (id: string) => S.prisma.transaction.findUnique({ where: { id } });
const history = (id: string) => S.prisma.changeLog.findMany({ where: { entityId: id }, orderBy: { createdAt: "asc" } });

// Posts the entry right after the action's next read of this kind returns, so
// the action goes on with what it read before the posting. (The Prisma model
// is a proxy, so the method is swapped by assignment rather than mock.method.)
function postAfterNextRead(method: "findUnique" | "findMany", id: string) {
  const delegate = S.prisma.transaction as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>;
  const original = delegate[method];
  const restore = () => { delegate[method] = original; };
  const hook = mock.fn(async (...args: unknown[]) => {
    restore();
    const read = await original(...args);
    await S.prisma.transaction.updateMany({ where: { id }, data: { status: "POSTED" } });
    return read;
  });
  delegate[method] = hook;
  return { hook, restore };
}

// The history write for this entry fails, as a full disk or a lock would.
async function failHistoryFor(id: string, fn: () => Promise<unknown>) {
  await S.prisma.$executeRawUnsafe(
    `CREATE TRIGGER fail_history BEFORE INSERT ON "ChangeLog" WHEN NEW."entityId" = '${id}' BEGIN SELECT RAISE(ABORT, 'history write failed'); END;`,
  );
  try { await fn(); } finally { await S.prisma.$executeRawUnsafe(`DROP TRIGGER fail_history`); }
}

test("an edit whose entry is posted between reading and saving is refused; the posted entry stays as posted", async () => {
  as.admin();
  const t = await make("race edit", { amount: 500000 });
  as.staff();
  const race = postAfterNextRead("findUnique", t.id);
  const res = await L.editTransaction(t.id, expense({ description: "race edit (changed)", amount: 900000, reason: "late edit" }));
  race.restore();
  assert.equal(race.hook.mock.callCount(), 1, "the race hook ran");
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /Posted/);
  const after = await entry(t.id);
  assert.deepEqual([after?.amount, after?.description, after?.status], [500000, "race edit", "POSTED"]);
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE"]);
});

test("a delete whose entry is posted meanwhile deletes nothing", async () => {
  as.admin();
  const t = await make("race delete");
  // deleteTransaction reads the entry, then looks for a fee withheld from it.
  const race = postAfterNextRead("findMany", t.id);
  await assert.rejects(() => L.deleteTransaction(t.id), /changed meanwhile/);
  race.restore();
  assert.equal(race.hook.mock.callCount(), 1, "the race hook ran");
  assert.equal((await entry(t.id))?.status, "POSTED");
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE"]);
});

test("without a race the guarded paths behave as before", async () => {
  as.admin();
  const t = await make("plain");
  const res = await L.editTransaction(t.id, expense({ description: "plain (fixed)" }));
  assert.equal(res.success, true, res.message);
  assert.equal((await L.postEntries([t.id])).count, 1);
  assert.equal((await entry(t.id))?.status, "POSTED");
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE", "UPDATE", "POST"]);
});

test("an edit rolls back when its history can't be written", async () => {
  as.admin();
  const t = await make("audited edit", { amount: 500000 });
  await failHistoryFor(t.id, () => assert.rejects(() => L.editTransaction(t.id, expense({ description: "audited edit", amount: 700000, reason: "x" }))));
  assert.equal((await entry(t.id))?.amount, 500000);
  assert.deepEqual((await history(t.id)).map((h) => h.action), ["CREATE"]);
});

test("posting, approving and deleting roll back when their history can't be written", async () => {
  as.admin();
  const reviewed = await make("audited post");
  await failHistoryFor(reviewed.id, () => assert.rejects(() => L.postEntries([reviewed.id])));
  assert.equal((await entry(reviewed.id))?.status, "REVIEWED");

  as.staff();
  const draft = await make("audited review");
  as.admin();
  await failHistoryFor(draft.id, () => assert.rejects(() => L.reviewEntries([draft.id])));
  assert.equal((await entry(draft.id))?.status, "DRAFT");

  await failHistoryFor(draft.id, () => assert.rejects(() => L.deleteTransaction(draft.id)));
  assert.equal((await entry(draft.id))?.status, "DRAFT");
  assert.deepEqual((await history(draft.id)).map((h) => h.action), ["CREATE"]);
});
