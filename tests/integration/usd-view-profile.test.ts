import { as, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let S: Awaited<ReturnType<typeof seed>>;
let P: typeof import("@/app/actions/profile");
let getView: typeof import("@/lib/view").getView;
before(async () => {
  S = await seed();
  P = await import("@/app/actions/profile");
  ({ getView } = await import("@/lib/view"));
});

const currencyOf = async (id: string) => (await S.prisma.user.findUniqueOrThrow({ where: { id } })).displayCurrency;

test("each user picks their own summary currency; VND by default", async () => {
  assert.equal(await currencyOf("u-staff"), "VND");
  as.staff();
  assert.equal((await P.setDisplayCurrency("USD")).success, true);
  assert.equal(await currencyOf("u-staff"), "USD");
  assert.equal(await currencyOf("u-admin"), "VND"); // nobody else's view moved
  assert.equal((await P.setDisplayCurrency("VND")).success, true);
  assert.equal(await currencyOf("u-staff"), "VND");
});

test("only VND or USD, and only when signed in and onboarded", async () => {
  as.admin();
  assert.equal((await P.setDisplayCurrency("EUR")).success, false);
  assert.equal(await currencyOf("u-admin"), "VND");
  for (const who of [as.nobody, as.pending]) {
    who();
    assert.equal((await P.setDisplayCurrency("USD")).success, false);
  }
  assert.equal(await currencyOf("u-new"), "VND");
});

test("the USD view uses the Settings rate", async () => {
  await S.prisma.user.updateMany({ where: { role: "ADMIN" }, data: { defaultUsdRate: 26100 } });
  await S.prisma.user.update({ where: { id: "u-staff" }, data: { displayCurrency: "USD" } });
  assert.deepEqual(await getView("u-staff"), { currency: "USD", rate: 26100 });
  assert.deepEqual(await getView("u-admin"), { currency: "VND", rate: 1 });
});
