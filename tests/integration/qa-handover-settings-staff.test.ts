import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let S: Awaited<ReturnType<typeof seed>>;
let ST: typeof import("@/app/actions/settings");
let U: typeof import("@/app/actions/users");
let FX: typeof import("@/lib/fx");
let H: typeof import("@/lib/handover");
let $: typeof import("@/lib/money");
before(async () => {
  S = await seed();
  ST = await import("@/app/actions/settings");
  U = await import("@/app/actions/users");
  FX = await import("@/lib/fx");
  H = await import("@/lib/handover");
  $ = await import("@/lib/money");
});

test("a blank category or unit-rate name is refused; names are trimmed", async () => {
  as.admin();
  assert.equal((await ST.createCategory(fd({ name: "   ", type: "EXPENSE" }))).success, false);
  assert.equal((await ST.createCategory(fd({ name: "  QA Travel  ", type: "EXPENSE" }))).success, true);
  assert.equal((await S.prisma.category.count({ where: { name: { in: ["   ", ""] } } })), 0);
  assert.ok(await S.prisma.category.findFirst({ where: { name: "QA Travel" } }));

  assert.equal((await ST.createUnitRate(fd({ description: "  ", rate: 40, unit: "hours" }))).success, false);
  assert.equal((await ST.createUnitRate(fd({ description: " QA Senior ", rate: 40, unit: "hours" }))).success, true);
  assert.deepEqual((await S.prisma.unitRate.findMany()).map((r) => r.description), ["QA Senior"]);
});

test("a new admin starts with the company USD rate; a new staff user is untouched", async () => {
  as.admin();
  assert.equal((await ST.updateExchangeRate(fd({ rate: 26_150 }))).success, true);
  assert.equal(await FX.defaultUsdRate(), 26_150);
  assert.equal((await U.createUser(fd({ username: "qa-admin2", password: "longenough", role: "ADMIN" }))).success, true);
  assert.equal((await U.createUser(fd({ username: "qa-staff2", password: "longenough", role: "USER" }))).success, true);
  const [admin2, staff2] = await Promise.all(["qa-admin2", "qa-staff2"].map((username) => S.prisma.user.findUniqueOrThrow({ where: { username } })));
  assert.equal(admin2.defaultUsdRate, 26_150);
  assert.notEqual(staff2.defaultUsdRate, 26_150);
});

test("handover open questions: the workbook keeps plain amounts, the page gets formatted money", async () => {
  as.admin();
  await S.prisma.transaction.create({
    data: { type: "EXPENSE", status: "DRAFT", amount: 1_131_990, currency: "VND", exchangeRate: 1, date: new Date("2026-09-10T00:00:00.000Z"), description: "QA draft", accountId: S.vnd.id, categoryId: S.expense.id },
  });
  const d = await H.collect("2026-09");
  const plain = H.questions(d).find((q) => q.item.endsWith("QA draft"));
  const shown = H.questions(d, "en", $.fmtMoney).find((q) => q.item.endsWith("QA draft"));
  assert.equal(plain?.amount, "1131990 VND");
  assert.equal(shown?.amount, $.fmtMoney(1_131_990, "VND"));
  assert.equal(shown?.amount, "1.131.990 ₫");
});
