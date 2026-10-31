// Owner rule, 1 Nov 2026: when a save fails because the session ended, say so
// ("You're signed out") instead of "Something went wrong". The decision asks
// /api/auth/session, which answers null once the session is gone.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { failureFor, failureToast } from "@/components/ui/toast";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const calls: [string, RequestInit | undefined][] = [];
function answer(body: unknown, status = 200) {
  calls.length = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

test("signed out: the signed-out toast with a sign-in action, whatever the action said", async () => {
  answer(null);
  const f = await failureFor(undefined, "Something went wrong — please try again.");
  assert.equal(f.title, "You're signed out");
  assert.match(f.description ?? "", /session ended, so this wasn't saved\. What you typed is still here/);
  assert.equal(f.signIn, "Sign in");
  // Asked fresh, never from a cache.
  assert.deepEqual(calls, [["/api/auth/session", { cache: "no-store" }]]);

  answer({}); // an empty session counts as signed out too
  assert.equal((await failureFor("Unauthorized")).title, "You're signed out");
});

test("signed in: the action's own message, the fallback only when there is none", async () => {
  answer({ user: { name: "owner" }, expires: "2026-11-02T00:00:00.000Z" });
  const f = await failureFor("The due date is before the issue date — pick a due date on or after 2026-10-31.", "Could not save.");
  assert.deepEqual(f, { title: "The due date is before the issue date — pick a due date on or after 2026-10-31." });
  assert.deepEqual(await failureFor(undefined, "Could not save."), { title: "Could not save." });
  assert.deepEqual(await failureFor(), { title: "Something went wrong — please try again." });
});

test("app unreachable (offline or server error): never a false sign-out; says it couldn't reach the app", async () => {
  answer({ error: "boom" }, 500);
  // A message from the server still explains it best.
  assert.deepEqual(await failureFor("Saved by someone else meanwhile."), { title: "Saved by someone else meanwhile." });
  globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  const f = await failureFor(undefined, "Could not save.");
  assert.equal(f.title, "Couldn't reach the app");
  assert.match(f.description ?? "", /wasn't saved — the connection or the server is down/);
  assert.equal(f.signIn, undefined);
});

test("the decision itself is pure", () => {
  assert.equal(failureToast("out", "Unauthorized").title, "You're signed out");
  assert.deepEqual(failureToast("in", "", "Could not delete."), { title: "Could not delete." });
  assert.equal(failureToast("unreachable").title, "Couldn't reach the app");
});
