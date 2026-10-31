// Review finding F-001: a session from before an admin reset must not survive
// it — otherwise its holder could set the new password or enrol a new
// authenticator through onboarding without knowing the reset password.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let S: Awaited<ReturnType<typeof seed>>;
let U: typeof import("@/app/actions/users");
let current: typeof import("@/lib/session-version").isSessionCurrent;
before(async () => {
  S = await seed();
  U = await import("@/app/actions/users");
  ({ isSessionCurrent: current } = await import("@/lib/session-version"));
});

const versionOf = async (id: string) => (await S.prisma.user.findUniqueOrThrow({ where: { id } })).sessionVersion;

test("a password reset ends the user's existing sessions; signing in again gets a current one", async () => {
  const v = await versionOf("u-staff");
  assert.equal(await current("u-staff", v), true);
  as.admin();
  assert.equal((await U.resetUserPassword("u-staff", fd({ password: "a-new-temp-pass" }))).success, true);
  assert.equal(await current("u-staff", v), false);
  assert.equal(await current("u-staff", v + 1), true);
});

test("a 2FA reset ends existing sessions too", async () => {
  const v = await versionOf("u-staff");
  as.admin();
  assert.equal((await U.resetUser2FA("u-staff")).success, true);
  assert.equal(await current("u-staff", v), false);
});

test("deactivating ends sessions, and re-activating doesn't bring the old ones back", async () => {
  const v = await versionOf("u-staff");
  as.admin();
  assert.equal((await U.setUserActive("u-staff", false)).success, true);
  assert.equal(await current("u-staff", v), false);
  assert.equal(await current("u-staff", v + 1), false); // inactive: no session is current
  assert.equal((await U.setUserActive("u-staff", true)).success, true);
  assert.equal(await current("u-staff", v), false);
  assert.equal(await current("u-staff", v + 1), true);
});

test("unlocking an account leaves its sessions alone", async () => {
  const v = await versionOf("u-staff");
  as.admin();
  assert.equal((await U.unlockUser("u-staff")).success, true);
  assert.equal(await current("u-staff", v), true);
});

test("a deleted user, a missing id, and pre-upgrade tokens", async () => {
  assert.equal(await current("no-such-user", 0), false);
  assert.equal(await current(undefined, 0), false);
  assert.equal(await current("u-admin", undefined), (await versionOf("u-admin")) === 0);
});

// The mocked session carries no sessionVersion (= 0, the version it signed in
// with): after the reset bumps it, the session stands for one that passed the
// check just before the reset landed.
test("onboarding writes from a session checked just before a reset don't land", async () => {
  const bcrypt = (await import("bcryptjs")).default;
  await S.prisma.user.update({ where: { id: "u-new" }, data: { passwordHash: await bcrypt.hash("default-pass", 10), sessionVersion: 0 } });
  const A = await import("@/app/actions/auth");
  as.admin();
  assert.equal((await U.resetUserPassword("u-new", fd({ password: "admin-reset-pass" }))).success, true);

  as.pending();
  const res = await A.changePassword(fd({ newPassword: "attacker-pass", confirmPassword: "attacker-pass" }));
  assert.equal(res.success, false);
  const u = await S.prisma.user.findUniqueOrThrow({ where: { id: "u-new" } });
  assert.equal(u.mustChangePassword, true);
  assert.equal(await bcrypt.compare("admin-reset-pass", u.passwordHash), true);

  const secret = await A.generate2FASecret();
  assert.equal(secret.success, false);
  assert.equal((await S.prisma.user.findUniqueOrThrow({ where: { id: "u-new" } })).twoFactorSecret, null);
});

test("the check is wired into every auth() call and the proxy", () => {
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  assert.match(read("src/auth.ts"), /async jwt\([\s\S]*?isSessionCurrent\(/);
  assert.match(read("src/auth.config.ts"), /token\.sessionVersion = user\.sessionVersion/);
  assert.match(read("src/proxy.ts"), /import \{ auth \} from "\.\/auth"/);
});
