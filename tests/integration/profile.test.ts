import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let S: Awaited<ReturnType<typeof seed>>;
let P: typeof import("@/app/actions/profile");
before(async () => {
  S = await seed();
  P = await import("@/app/actions/profile");
});

const nameOf = async (id: string) => (await S.prisma.user.findUniqueOrThrow({ where: { id } })).displayName;

test("a user sets their own display name; spaces are tidied and empty clears it", async () => {
  as.staff();
  assert.equal((await P.updateProfile(fd({ displayName: "  Dot   Tran " }))).success, true);
  assert.equal(await nameOf("u-staff"), "Dot Tran");
  assert.equal(await nameOf("u-admin"), null); // nobody else's profile moved

  assert.equal((await P.updateProfile(fd({ displayName: "   " }))).success, true);
  assert.equal(await nameOf("u-staff"), null); // back to the username in the greeting
});

test("the username, role and other users can't be changed through the profile", async () => {
  as.staff();
  await P.updateProfile(fd({ displayName: "Dot", username: "owner2", role: "ADMIN", id: "u-admin" }));
  const me = await S.prisma.user.findUniqueOrThrow({ where: { id: "u-staff" } });
  assert.equal(me.username, "dot");
  assert.equal(me.role, "USER");
  assert.equal(await nameOf("u-admin"), null);
});

test("an over-long name is refused and nothing changes", async () => {
  as.admin();
  const res = await P.updateProfile(fd({ displayName: "x".repeat(61) }));
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /60/);
  assert.equal(await nameOf("u-admin"), null);
  assert.equal((await P.updateProfile(fd({ displayName: "x".repeat(60) }))).success, true);
});

test("signed out or mid-onboarding, the profile can't be saved", async () => {
  for (const who of [as.nobody, as.pending]) {
    who();
    assert.equal((await P.updateProfile(fd({ displayName: "Mallory" }))).success, false);
  }
  assert.equal(await nameOf("u-new"), null);
});
