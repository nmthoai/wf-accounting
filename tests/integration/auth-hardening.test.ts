// Sign-in hardening: wrong 2FA codes lock the account (only after the right
// password), a code works once, unknown/inactive/locked accounts still pay for
// a bcrypt check, and a session ends 12 hours after sign-in however active it is.
// The real src/auth.ts is loaded with next-auth stubbed out, so its authorize()
// and jwt callback can be called directly (tests/helpers/setup.ts replaces
// @/auth wholesale, so this file sets up its own throwaway database).
import { before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import speakeasy from "speakeasy";

const dir = mkdtempSync(join(tmpdir(), "wf-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
execFileSync(join(process.cwd(), "node_modules/.bin/prisma"), ["db", "push", "--skip-generate"], { env: process.env, stdio: "ignore" });

type Config = {
  providers: { authorize: (c: Record<string, string>) => Promise<unknown> }[];
  callbacks: { jwt: (p: { token: Record<string, unknown>; user?: unknown }) => Promise<Record<string, unknown> | null> };
};
let config: Config;
mock.module("next-auth", { defaultExport: (c: Config) => { config = c; return { handlers: {}, auth: async () => null, signIn: async () => undefined, signOut: async () => undefined }; } });
mock.module("next-auth/providers/credentials", { defaultExport: (o: unknown) => o });

// Every hash bcrypt is asked to check against: compare is wrapped on the
// module object src/auth.ts uses (it calls bcrypt.compare at call time).
const bcrypt: typeof import("bcryptjs") = createRequire(__filename)("bcryptjs");
const compared: string[] = [];
const realCompare = bcrypt.compare;
(bcrypt as { compare: unknown }).compare = (p: string, h: string) => { compared.push(h); return realCompare(p, h); };

let prisma: typeof import("@/lib/prisma").prisma;
let authConfig: typeof import("@/auth.config").authConfig;
const secret = speakeasy.generateSecret().base32;
const code = (offset = 0) => speakeasy.totp({ secret, encoding: "base32", time: Date.now() / 1000 + offset });

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ authConfig } = await import("@/auth.config"));
  await import("@/auth");
  const passwordHash = await bcrypt.hash("right-pass", 4);
  await prisma.user.createMany({
    data: [
      { id: "u-owner", username: "owner", passwordHash, role: "ADMIN", twoFactorEnabled: true, twoFactorSecret: secret, mustChangePassword: false },
      { id: "u-off", username: "gone", passwordHash, isActive: false, twoFactorEnabled: true, twoFactorSecret: secret, mustChangePassword: false },
      { id: "u-new", username: "newcomer", passwordHash, mustChangePassword: true },
    ],
  });
});

const signIn = (password: string, token = "", username = "owner") => config.providers[0].authorize({ username, password, token });
const owner = () => prisma.user.findUniqueOrThrow({ where: { id: "u-owner" } });
const reset = () => prisma.user.update({ where: { id: "u-owner" }, data: { failedLoginAttempts: 0, failedCodeAttempts: 0, lockedUntil: null, lastTotpStep: null } });
// A code no authenticator shows right now (outside the ±1 step window).
const wrongCode = () => { const c = code(-300); return [code(-30), code(0), code(30)].includes(c) ? "000000" : c; };

test("5 wrong codes after the right password lock the account, even for the right password and a valid code", async () => {
  await reset();
  for (let i = 0; i < 4; i++) assert.equal(await signIn("right-pass", wrongCode()), null);
  assert.equal((await owner()).failedCodeAttempts, 4);
  assert.equal((await owner()).lockedUntil, null);
  assert.equal(await signIn("right-pass", wrongCode()), null);
  const locked = await owner();
  assert.ok(locked.lockedUntil && locked.lockedUntil.getTime() > Date.now() + 14 * 60 * 1000);
  assert.equal(await signIn("right-pass", code()), null);
  // Once the 15 minutes are up, the right code works and the count starts over.
  await prisma.user.update({ where: { id: "u-owner" }, data: { lockedUntil: new Date(Date.now() - 1000) } });
  assert.ok(await signIn("right-pass", code()));
  const after = await owner();
  assert.equal(after.failedCodeAttempts, 0);
  assert.equal(after.lockedUntil, null);
});

test("wrong passwords don't count as wrong codes, and their lock doesn't keep a 2FA owner out", async () => {
  await reset();
  for (let i = 0; i < 5; i++) assert.equal(await signIn("guess-" + i, code()), null);
  const u = await owner();
  assert.equal(u.failedCodeAttempts, 0);
  assert.ok(u.lockedUntil && u.lockedUntil > new Date());
  assert.ok(await signIn("right-pass", code()));
});

test("a code is accepted once; an earlier code is refused after a later one was used", async () => {
  await reset();
  const c = code();
  assert.ok(await signIn("right-pass", c));
  const { lastTotpStep } = await owner();
  assert.ok(lastTotpStep !== null && Math.abs(lastTotpStep - Math.floor(Date.now() / 30000)) <= 1);
  assert.equal(await signIn("right-pass", c), null);
  assert.equal(await signIn("right-pass", code(-30)), null);
  assert.equal((await owner()).failedCodeAttempts, 2);
});

test("two sign-ins racing with the same code: only one gets in", async () => {
  await reset();
  const c = code();
  const results = await Promise.all([signIn("right-pass", c), signIn("right-pass", c)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test("unknown, inactive and locked accounts still run a bcrypt check", async () => {
  await reset();
  const { passwordHash } = await owner();
  for (const username of ["nobody-here", "gone"]) {
    compared.length = 0;
    assert.equal(await signIn("right-pass", code(), username), null);
    assert.equal(compared.length, 1, username);
    assert.notEqual(compared[0], passwordHash);
  }
  await prisma.user.update({ where: { id: "u-owner" }, data: { failedCodeAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) } });
  compared.length = 0;
  assert.equal(await signIn("right-pass", code()), null);
  assert.equal(compared.length, 1);
  assert.notEqual(compared[0], passwordHash);
  // A locked account without 2FA (mid-onboarding) too.
  await prisma.user.update({ where: { id: "u-new" }, data: { lockedUntil: new Date(Date.now() + 60_000) } });
  compared.length = 0;
  assert.equal(await signIn("right-pass", "", "newcomer"), null);
  assert.equal(compared.length, 1);
});

test("a session ends 12 hours after sign-in, however active", async () => {
  const H = 60 * 60 * 1000;
  const user = { id: "u-new", role: "USER", twoFactorEnabled: false, mustChangePassword: true, sessionVersion: 0 };
  const signedIn = await config.callbacks.jwt({ token: {}, user });
  assert.ok(signedIn && typeof signedIn.authTime === "number" && Math.abs((signedIn.authTime as number) - Date.now()) < 5000);

  const token = { id: "u-new", sessionVersion: 0 };
  assert.ok(await config.callbacks.jwt({ token: { ...token, authTime: Date.now() - 11 * H } }));
  assert.equal(await config.callbacks.jwt({ token: { ...token, authTime: Date.now() - 12 * H - 1000 } }), null);
  // Without the database check too (the config's own callback).
  assert.equal(await authConfig.callbacks.jwt({ token: { ...token, authTime: Date.now() - 13 * H } } as never), null);

  // A token from before this change starts its 12 hours on first sight.
  const legacy = await config.callbacks.jwt({ token: { ...token } });
  assert.ok(legacy && Math.abs((legacy.authTime as number) - Date.now()) < 5000);

  // The sessionVersion check still applies.
  assert.equal(await config.callbacks.jwt({ token: { ...token, sessionVersion: 7, authTime: Date.now() } }), null);
});
