// QA pass: a declaration recorded twice is refused with the quarter written the way
// the Tax page writes it ("Q3 2030", "Quý 3/2030"), never the stored key "2030-Q3".
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let T: typeof import("@/app/actions/tax");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  T = await import("@/app/actions/tax");
  S = await seed();
});

const q3 = () => fd({ form: "01/GTGT", period: "2030-Q3", supplement: 0 });

test("the duplicate-declaration error names the quarter as the page does, in either language", async () => {
  as.admin();
  const first = await T.saveTaxReturn(null, q3());
  assert.equal(first.success, true, first.message);

  const again = await T.saveTaxReturn(null, q3());
  assert.equal(again.success, false);
  assert.match(again.message ?? "", /01\/GTGT .*Q3 2030/);
  assert.doesNotMatch(again.message ?? "", /2030-Q3/);

  await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: "vi" } });
  try {
    const vi = await T.saveTaxReturn(null, q3());
    assert.equal(vi.success, false);
    assert.match(vi.message ?? "", /Quý 3\/2030/);
    assert.doesNotMatch(vi.message ?? "", /2030-Q3/);
  } finally {
    await S.prisma.user.update({ where: { id: "u-admin" }, data: { locale: null } });
  }
});
