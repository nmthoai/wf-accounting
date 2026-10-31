import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let A: typeof import("@/app/actions/accounts");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  A = await import("@/app/actions/accounts");
  S = await seed();
});

// The actions read the entry first, then look up the account(s) while parsing
// the form. Posting the entry during that lookup puts the posting exactly
// between the read (which saw it unposted) and the write.
// (Prisma's model methods are created lazily, so mock.method can't wrap them;
// they are swapped by assignment and put back by the returned restore().)
function postDuringAccountLookup(id: string) {
  const delegate = S.prisma.account;
  const original = delegate.findUnique;
  let calls = 0;
  delegate.findUnique = (async (args: { where: { id: string } }) => {
    if (calls++ === 0) await S.prisma.transaction.update({ where: { id }, data: { status: "POSTED" } });
    return original.call(delegate, args);
  }) as unknown as typeof original;
  return { calls: () => calls, restore: () => { delegate.findUnique = original; } };
}

const row = (id: string) => S.prisma.transaction.findUniqueOrThrow({ where: { id } });
const updates = (id: string) => S.prisma.changeLog.count({ where: { entityId: id, action: "UPDATE" } });

test("a movement posted after it was read is not overwritten by the edit", async () => {
  as.admin();
  assert.equal((await A.recordMovement(fd({ type: "CAPITAL_IN", amount: 5000000, date: "2026-07-01", accountId: S.vnd.id, description: "race movement" }))).success, true);
  const before = await S.prisma.transaction.findFirstOrThrow({ where: { description: "race movement" } });
  assert.equal(before.status, "REVIEWED");

  // Staff edit: unguarded, it would also move the entry back to DRAFT.
  as.staff();
  const lookup = postDuringAccountLookup(before.id);
  const res = await A.updateMovement(before.id, fd({ type: "CAPITAL_IN", amount: 9000000, date: "2026-07-02", accountId: S.vnd.id, description: "race movement" }))
    .finally(lookup.restore);
  assert.ok(lookup.calls() > 0, "the posting landed between read and write");

  assert.equal(res.success, false);
  assert.ok(res.message);
  const now = await row(before.id);
  assert.equal(now.status, "POSTED");
  assert.equal(now.amount, 5000000);
  assert.equal(now.date.toISOString(), before.date.toISOString());
  assert.equal(await updates(before.id), 0);
});

test("a transfer with a leg posted after it was read is not changed on either leg", async () => {
  as.admin();
  assert.equal((await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 2000000, date: "2026-07-03", description: "race transfer" }))).success, true);
  const legs = await S.prisma.transaction.findMany({ where: { description: "race transfer" } });
  const out = legs.find((l) => l.type === "TRANSFER_OUT")!;
  const inn = legs.find((l) => l.type === "TRANSFER_IN")!;

  // The IN leg is posted meanwhile; the OUT leg is written first and must roll back.
  as.staff();
  const lookup = postDuringAccountLookup(inn.id);
  const res = await A.updateTransfer(out.transferId!, fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 3000000, date: "2026-07-04", description: "race transfer" }))
    .finally(lookup.restore);
  assert.ok(lookup.calls() > 0, "the posting landed between read and write");

  assert.equal(res.success, false);
  assert.ok(res.message);
  const [outNow, inNow] = [await row(out.id), await row(inn.id)];
  assert.equal(outNow.status, "REVIEWED");
  assert.equal(outNow.amount, 2000000);
  assert.equal(outNow.date.toISOString(), out.date.toISOString());
  assert.equal(inNow.status, "POSTED");
  assert.equal(inNow.amount, 2000000);
  assert.equal(await updates(out.id) + await updates(inn.id), 0);
});

test("when the history can't be written, the movement or transfer isn't saved either", async () => {
  as.admin();
  assert.equal((await A.recordMovement(fd({ type: "OTHER_IN", amount: 100000, date: "2026-07-05", accountId: S.vnd.id, description: "audit movement" }))).success, true);
  assert.equal((await A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 400000, date: "2026-07-05", description: "audit transfer" }))).success, true);
  const mv = await S.prisma.transaction.findFirstOrThrow({ where: { description: "audit movement" } });
  const legs = await S.prisma.transaction.findMany({ where: { description: "audit transfer" } });
  const transferId = legs[0].transferId!;

  // Every history insert fails at the database.
  await S.prisma.$executeRawUnsafe(`CREATE TRIGGER no_history BEFORE INSERT ON ChangeLog BEGIN SELECT RAISE(ABORT, 'history down'); END`);
  try {
    await assert.rejects(() => A.recordMovement(fd({ type: "OTHER_IN", amount: 1, date: "2026-07-06", accountId: S.vnd.id, description: "orphan movement" })));
    assert.equal(await S.prisma.transaction.count({ where: { description: "orphan movement" } }), 0);

    await assert.rejects(() => A.createTransfer(fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 1, date: "2026-07-06", description: "orphan transfer" })));
    assert.equal(await S.prisma.transaction.count({ where: { description: "orphan transfer" } }), 0);

    await assert.rejects(() => A.updateMovement(mv.id, fd({ type: "OTHER_IN", amount: 200000, date: "2026-07-05", accountId: S.vnd.id, description: "audit movement" })));
    assert.equal((await row(mv.id)).amount, 100000);

    await assert.rejects(() => A.updateTransfer(transferId, fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 500000, date: "2026-07-05", description: "audit transfer" })));
    for (const l of legs) assert.equal((await row(l.id)).amount, 400000);
  } finally {
    await S.prisma.$executeRawUnsafe(`DROP TRIGGER no_history`);
  }

  // With history working again, the same edit saves and is recorded.
  assert.equal((await A.updateTransfer(transferId, fd({ fromAccountId: S.vnd.id, toAccountId: S.cash.id, amountOut: 500000, date: "2026-07-05", description: "audit transfer" }))).success, true);
  for (const l of legs) {
    assert.equal((await row(l.id)).amount, 500000);
    assert.equal(await updates(l.id), 1);
  }
});

test("an edit refused because the entry was rejected meanwhile doesn't claim it is posted", async () => {
  as.staff();
  assert.equal((await A.recordMovement(fd({ type: "CAPITAL_IN", amount: 1000000, date: "2026-07-05", accountId: S.vnd.id, description: "rejected meanwhile" }))).success, true);
  const before = await S.prisma.transaction.findFirstOrThrow({ where: { description: "rejected meanwhile" } });
  assert.equal(before.status, "DRAFT");

  const delegate = S.prisma.account;
  const original = delegate.findUnique;
  let calls = 0;
  delegate.findUnique = (async (args: { where: { id: string } }) => {
    if (calls++ === 0) await S.prisma.transaction.update({ where: { id: before.id }, data: { status: "REJECTED" } });
    return original.call(delegate, args);
  }) as unknown as typeof original;
  const res = await A.updateMovement(before.id, fd({ type: "CAPITAL_IN", amount: 2000000, date: "2026-07-05", accountId: S.vnd.id, description: "rejected meanwhile" }))
    .finally(() => { delegate.findUnique = original; });

  assert.ok(calls > 0);
  assert.equal(res.success, false);
  assert.doesNotMatch(res.message ?? "", /posted/i);
  assert.match(res.message ?? "", /try again/i);
  assert.equal((await row(before.id)).amount, 1000000);
});
