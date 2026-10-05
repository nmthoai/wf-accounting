// Translations: both languages carry the same messages, every literal key the
// code asks for exists, and dates are formatted for the user's language.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { NAMESPACES } from "@/i18n/config";
import { RAW_MESSAGES } from "@/i18n/messages";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

type Tree = { [k: string]: string | Tree };
const root = process.cwd();

// "a.b.c" → "text" for every leaf.
function leaves(t: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(t)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(key, v);
    else for (const [kk, vv] of leaves(v, key)) out.set(kk, vv);
  }
  return out;
}
const en = leaves(RAW_MESSAGES.en as Tree);
const vi = leaves(RAW_MESSAGES.vi as Tree);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const files = sourceFiles(join(root, "src"));

// The arguments ({name}, {count, plural, ...}, {kind, select, ...}) and <tag>
// names of a message, read with the ICU parser next-intl uses.
function args(msg: string) {
  const found = new Set<string>();
  const visit = (nodes: MessageFormatElement[]) => {
    for (const n of nodes) {
      if (n.type === TYPE.argument || n.type === TYPE.number || n.type === TYPE.date || n.type === TYPE.time) found.add(n.value);
      if (n.type === TYPE.select || n.type === TYPE.plural) {
        found.add(`${n.value}:${Object.keys(n.options).filter((k) => !/^(one|two|few|many|zero)$/.test(k)).sort().join("|")}`);
        for (const o of Object.values(n.options)) visit(o.value);
      }
      if (n.type === TYPE.tag) { found.add(`<${n.value}>`); visit(n.children); }
    }
  };
  visit(parse(msg));
  return [...found].sort();
}

test("every namespace file exists for both languages", () => {
  for (const ns of NAMESPACES) {
    for (const l of ["en", "vi"] as const) {
      assert.ok((RAW_MESSAGES[l] as Record<string, unknown>)[ns], `${l}/${ns}.json`);
    }
  }
});

test("every literal message key used in the code exists in English", () => {
  const missing: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    // const t = useTranslations("ns") | await getTranslations("ns") | await getT("ns") | translator(x, "ns")
    const bindings = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations|getT)\(\s*["'`]([\w.]+)["'`]\s*\)/g)]
      .concat([...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*translator\([^,]+,\s*["'`]([\w.]+)["'`]\s*\)/g)])
      .sort((a, b) => a.index! - b.index!);
    for (const [i, b] of bindings.entries()) {
      const [, name, ns] = b;
      // A binding covers the code up to the next binding of the same name.
      const next = bindings.slice(i + 1).find((o) => o[1] === name);
      const scope = src.slice(b.index, next?.index ?? src.length);
      const calls = scope.matchAll(new RegExp(`\\b${name}(?:\\.rich|\\.markup)?\\(\\s*["']([\\w.]+)["']`, "g"));
      for (const [, key] of calls) {
        if (!en.has(`${ns}.${key}`)) missing.push(`${relative(root, f)}: ${ns}.${key}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test("Vietnamese has exactly the English messages, with the same placeholders", () => {
  const onlyEn = [...en.keys()].filter((k) => !vi.has(k));
  const onlyVi = [...vi.keys()].filter((k) => !en.has(k));
  assert.deepEqual(onlyEn, [], "missing in vi");
  assert.deepEqual(onlyVi, [], "not in en");
  const mismatched = [...en].filter(([k, v]) => vi.has(k) && args(v).join() !== args(vi.get(k)!).join()).map(([k]) => k);
  assert.deepEqual(mismatched, [], "placeholders differ");
  const empty = [...en, ...vi].filter(([, v]) => !v.trim()).map(([k]) => k);
  assert.deepEqual(empty, [], "empty messages");
});

test("dates are formatted for the user's language, not the server's", () => {
  // Use fmtDate / fmtDateTime / fmtMonth (src/lib/format.ts) with the user's locale.
  const offenders = files
    .filter((f) => !f.endsWith(join("lib", "format.ts")))
    .filter((f) => /toLocale(Date|Time)?String\(\s*(undefined\b|\)|["'](en|vi))/.test(readFileSync(f, "utf8")))
    .map((f) => relative(root, f));
  assert.deepEqual(offenders, []);
});
