// Owner rules, 1 Nov 2026: an expired session says "You're signed out — your
// session ended, so this wasn't saved", and the onboarding wizard offers a way
// out. The toast's decision is unit-tested (tests/unit/session-expired.test.ts);
// here: the server really saves nothing without a session (so the toast tells
// the truth), the same form saves once signed in again, and every onboarding
// step shows Sign out.
import { as, fd, seed } from "../helpers/setup";
import { before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

let S: Awaited<ReturnType<typeof seed>>;
let P: typeof import("@/app/actions/projects");
let C: typeof import("@/app/actions/clients");
let L: typeof import("@/app/actions/ledger");
let Pr: typeof import("@/app/actions/profile");
let A: typeof import("@/app/actions/auth");
before(async () => {
  S = await seed();
  P = await import("@/app/actions/projects");
  C = await import("@/app/actions/clients");
  L = await import("@/app/actions/ledger");
  Pr = await import("@/app/actions/profile");
  A = await import("@/app/actions/auth");
});

const entry = () => fd({
  type: "EXPENSE", date: "2026-10-30", amount: 120000, currency: "VND", description: "Domain renewal",
  accountId: S.vnd.id, categoryId: S.expense.id, vendorId: S.vendor.id, rateMode: "AUTO",
});

test("signed out: saves are refused and nothing is written", async () => {
  as.nobody();
  const before = await Promise.all([S.prisma.project.count(), S.prisma.client.count(), S.prisma.transaction.count()]);
  await assert.rejects(P.createProject(fd({ name: "Signed-out project" })));
  await assert.rejects(C.createClient(fd({ name: "Signed-out client" })));
  await assert.rejects(L.createTransaction(entry()));
  // The profile action answers instead of throwing; it still saves nothing.
  assert.equal((await Pr.updateProfile(fd({ displayName: "Someone" }))).success, false);
  const after = await Promise.all([S.prisma.project.count(), S.prisma.client.count(), S.prisma.transaction.count()]);
  assert.deepEqual(after, before);
  assert.equal((await S.prisma.user.findUniqueOrThrow({ where: { id: "u-admin" } })).displayName, null);
});

test("signed in again: the same form data saves", async () => {
  as.admin();
  assert.equal((await P.createProject(fd({ name: "Signed-out project" }))).success, true);
  assert.equal((await L.createTransaction(entry())).success, true);
  assert.equal(await S.prisma.project.count({ where: { name: "Signed-out project" } }), 1);
});

test("onboarding: a user mid-setup can sign out", async () => {
  as.pending();
  await assert.doesNotReject(A.signOutAction());
});

// The wizard rendered with its message keys in place of text (the i18n unit
// test checks auth.onboard.signOut exists in both languages).
test("onboarding: every step shows Sign out", async () => {
  mock.module("next-intl", { namedExports: { useTranslations: (ns: string) => (key: string) => `${ns}.${key}` } });
  const { OnboardWizard } = await import("@/app/onboard/onboard-wizard");
  const steps = [
    { needsPasswordChange: true, needs2FA: true }, // password step, 2FA next
    { needsPasswordChange: false, needs2FA: true }, // 2FA step only
    { needsPasswordChange: true, needs2FA: false }, // password step only
  ];
  for (const props of steps) {
    const html = renderToStaticMarkup(h(OnboardWizard, props));
    assert.match(html, /<button[^>]*type="submit"[^>]*>(<svg[\s\S]*?<\/svg>)?auth\.onboard\.signOut<\/button>/, JSON.stringify(props));
  }
});
