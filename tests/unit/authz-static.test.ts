// Every export of a "use server" file can be called from any browser, signed
// in or not. This guard fails if an action's first statements don't check the
// session — so a new action can't ship without one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "src/app/actions");
// Calls that establish the session (each helper calls auth() and throws/returns without one).
const GATES = /await (getSession\(\)|auth\(\)|currentUser\(\)|requireUser\(\)|requireAdmin\(\)|readUpload\(|signOut\(|signIn\()/;
// Deliberately public: signing in, and choosing the interface language.
const PUBLIC = new Set(["auth.ts:authenticate", "locale.ts:setLocale"]);

test("every server action checks the session before doing anything", () => {
  const missing: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf8");
    assert.match(src, /^"use server";/, `${file} should be a server-actions file`);
    for (const m of src.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{([\s\S]*?)^\}/gm)) {
      const [, name, body] = m;
      if (PUBLIC.has(`${file}:${name}`)) continue;
      const head = body.split("\n").slice(0, 4).join("\n");
      if (!GATES.test(head)) missing.push(`${file}:${name}`);
    }
  }
  assert.deepEqual(missing, [], `actions without an early session check: ${missing.join(", ")}`);
});

test("server-action files export nothing but async functions", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf8");
    const other = [...src.matchAll(/^export (?!async function)(\w+)/gm)].map((m) => `${file}: export ${m[1]}`);
    assert.deepEqual(other, []);
  }
});

test("every dashboard page checks the session itself, not only through the proxy", () => {
  const root = join(process.cwd(), "src/app/(dashboard)");
  const pages: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name === "page.tsx") pages.push(join(d, e.name));
    }
  };
  walk(root);
  const unguarded = pages.filter((p) => {
    const src = readFileSync(p, "utf8");
    const redirectOnly = /^\s*redirect\(/m.test(src) && !/prisma\./.test(src);
    return !redirectOnly && !/requirePageSession\(\)/.test(src);
  });
  assert.deepEqual(unguarded.map((p) => p.replace(root, "")), []);
});
