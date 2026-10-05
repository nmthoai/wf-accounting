import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readdirSync } from "node:fs";
import * as xlsx from "xlsx";
import { unzipSync } from "fflate";

let S: Awaited<ReturnType<typeof seed>>;
const actions: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>> = {};
before(async () => {
  S = await seed();
  for (const f of readdirSync(join(process.cwd(), "src/app/actions")).filter((x) => x.endsWith(".ts"))) {
    actions[f] = (await import(`@/app/actions/${f.replace(/\.ts$/, "")}`)) as typeof actions[string];
  }
});

// Row counts of every table — a refused call must leave all of them alone.
async function snapshot() {
  const p = S.prisma as unknown as Record<string, { count: () => Promise<number> }>;
  const models = ["user", "account", "loan", "transaction", "invoice", "paymentAllocation", "attachment", "bankStatement", "bankLine", "costItem", "changeLog", "category", "client", "vendor", "project"];
  return Object.fromEntries(await Promise.all(models.map(async (m) => [m, await p[m].count()])));
}
async function refused(call: () => Promise<unknown>) {
  try {
    const res = (await call()) as { success?: boolean } | undefined;
    return res !== undefined && res !== null && typeof res === "object" && res.success === false;
  } catch {
    return true;
  }
}

// Signing in, choosing the language, and signing out are fine without a session.
const PUBLIC = new Set(["auth.ts:authenticate", "locale.ts:setLocale", "auth.ts:finishOnboarding", "auth.ts:signOutIdle", "auth.ts:signOutAction"]);
const ADMIN_ONLY = [
  "accounts.ts:saveAccount", "bank.ts:deleteStatement", "clients.ts:deleteClient", "vendors.ts:deleteVendor", "projects.ts:deleteProject",
  "costs.ts:dismissCostItem", "costs.ts:reopenCostItem", "costs.ts:deleteCostItem", "invoices.ts:deleteInvoice",
  "ledger.ts:deleteTransaction", "ledger.ts:reviewEntries", "ledger.ts:postEntries", "ledger.ts:reverseEntry",
  "settings.ts:createCategory", "settings.ts:updateCategory", "settings.ts:deleteCategory", "settings.ts:updateExchangeRate",
  "settings.ts:createUnitRate", "settings.ts:updateUnitRate", "settings.ts:deleteUnitRate",
  "users.ts:createUser", "users.ts:deleteUser", "users.ts:setUserActive", "users.ts:resetUserPassword", "users.ts:resetUser2FA", "users.ts:unlockUser",
];

test("signed out, every server action is refused and changes nothing", async () => {
  as.nobody();
  const before = await snapshot();
  const allowed: string[] = [];
  for (const [file, mod] of Object.entries(actions)) {
    for (const [name, fn] of Object.entries(mod)) {
      if (typeof fn !== "function" || PUBLIC.has(`${file}:${name}`)) continue;
      const form = fd({ name: "x", amount: 1, type: "EXPENSE", date: "2026-06-01", provider: "x", receiptDate: "2026-06-01", username: "evil", password: "Password123!", role: "ADMIN" });
      if (!(await refused(() => fn("x", form, form)))) allowed.push(`${file}:${name}`);
    }
  }
  assert.deepEqual(allowed, []);
  assert.deepEqual(await snapshot(), before);
});

test("an account that hasn't finished onboarding (default password, no 2FA) can't touch the books", async () => {
  as.pending();
  const before = await snapshot();
  const allowed: string[] = [];
  for (const [file, mod] of Object.entries(actions)) {
    if (file === "auth.ts" || file === "locale.ts") continue; // the onboarding steps themselves
    for (const [name, fn] of Object.entries(mod)) {
      const form = fd({ name: "x", amount: 1, type: "EXPENSE", date: "2026-06-01", provider: "x", receiptDate: "2026-06-01", accountId: S.vnd.id });
      if (!(await refused(() => fn("x", form, form)))) allowed.push(`${file}:${name}`);
    }
  }
  assert.deepEqual(allowed, []);
  assert.deepEqual(await snapshot(), before);
  for (const route of ["@/app/api/reports/export/route", "@/app/api/handover/route"]) {
    const { GET } = await import(route);
    assert.equal((await GET(new Request("http://test/x?type=entries&from=2026-06-01&to=2026-06-30&month=2026-06"))).status, 401, route);
  }
  const uploads = await import("@/app/api/uploads/[name]/route");
  assert.equal((await uploads.GET(new Request("http://test/x"), { params: Promise.resolve({ name: "r1.pdf" }) })).status, 401);
});

test("deactivating a user ends their access at once; the role comes from the database, not the token", async () => {
  const L = await import("@/app/actions/ledger");
  const make = (d: string) => L.createTransaction(fd({ type: "EXPENSE", amount: 1, currency: "VND", date: "2026-06-01", accountId: S.vnd.id, description: d }));
  as.staff();
  assert.equal((await make("before")).success, true);
  await S.prisma.user.update({ where: { id: "u-staff" }, data: { isActive: false } });
  assert.equal(await refused(() => make("after deactivation")), true);
  await S.prisma.user.update({ where: { id: "u-staff" }, data: { isActive: true } });
  // A token still saying ADMIN for a user demoted in the database gets staff rights only.
  await S.prisma.user.update({ where: { id: "u-admin" }, data: { role: "USER" } });
  as.admin();
  await assert.rejects(() => L.reviewEntries(["x"]), /Unauthorized/);
  await S.prisma.user.update({ where: { id: "u-admin" }, data: { role: "ADMIN" } });
});

test("staff are refused every owner-only action, and nothing changes", async () => {
  as.admin();
  const t = await (await import("@/app/actions/ledger")).createTransaction(fd({ type: "EXPENSE", amount: 1000, currency: "VND", date: "2026-06-01", accountId: S.vnd.id, description: "target" }));
  assert.equal((t as { success: boolean }).success, true);
  const target = await S.prisma.transaction.findFirstOrThrow({ where: { description: "target" } });
  as.staff();
  const before = await snapshot();
  const allowed: string[] = [];
  for (const key of ADMIN_ONLY) {
    const [file, name] = key.split(":");
    const fn = actions[file][name];
    assert.equal(typeof fn, "function", key);
    const form = fd({ name: "x", rate: 1, username: "evil", password: "Password123!", role: "ADMIN", type: "EXPENSE", currency: "VND", openingBalance: 1 });
    const arg = name === "reviewEntries" || name === "postEntries" ? [target.id] : target.id;
    if (!(await refused(() => fn(arg, form, form)))) allowed.push(key);
  }
  assert.deepEqual(allowed, []);
  assert.deepEqual(await snapshot(), before);
});

test("receipts: sign-in required, no path tricks, safe content types", async () => {
  const { GET } = await import("@/app/api/uploads/[name]/route");
  const get = (name: string) => GET(new Request("http://test/api/uploads/x"), { params: Promise.resolve({ name }) });
  mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  writeFileSync(join(process.env.UPLOAD_DIR!, "r1.pdf"), "%PDF-1.4");
  writeFileSync(join(process.env.UPLOAD_DIR!, "x.html"), "<script>alert(1)</script>");
  await S.prisma.attachment.create({ data: { filePath: "r1.pdf", fileName: "Hóa đơn 12.pdf", fileType: "application/pdf" } });

  as.nobody();
  assert.equal((await get("r1.pdf")).status, 401);
  as.staff();
  for (const evil of ["../../etc/passwd", "..%2f..%2fetc%2fpasswd", "/etc/passwd", "sub/r1.pdf", ""]) assert.equal((await get(evil)).status, 404, evil);
  const ok = await get("r1.pdf");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/pdf");
  assert.match(ok.headers.get("content-disposition")!, /filename\*=UTF-8''H%C3%B3a/);
  const html = await get("x.html");
  assert.notEqual(html.headers.get("content-type"), "text/html"); // never rendered as a page
});

test("Excel export: sign-in required; drafts listed but not in the totals", async () => {
  const { GET } = await import("@/app/api/reports/export/route");
  as.nobody();
  assert.equal((await GET(new Request("http://test/api/reports/export?type=entries&from=2026-06-01&to=2026-06-30"))).status, 401);
  as.staff();
  await (await import("@/app/actions/ledger")).createTransaction(fd({ type: "EXPENSE", amount: 777, currency: "VND", date: "2026-06-02", accountId: S.vnd.id, description: "draft row" }));
  as.admin();
  const res = await GET(new Request("http://test/api/reports/export?type=entries&from=2026-06-01&to=2026-06-30"));
  assert.equal(res.status, 200);
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(xlsx.read(Buffer.from(await res.arrayBuffer())).Sheets["Ledger Entries"]);
  assert.ok(rows.some((r) => r.Description === "draft row" && r.Status === "Draft"));
  assert.equal(rows.find((r) => r.Type === "TOTAL Expense")?.["Amount (VND)"], 1000); // the reviewed 1,000 only
  assert.equal((await GET(new Request("http://test/api/reports/export?type=entries&from=bad&to=2026-06-30"))).status, 400);
});

test("handover package: sign-in required; ZIP holds the workbook and the evidence each entry links to", async () => {
  const { GET } = await import("@/app/api/handover/route");
  const L = await import("@/app/actions/ledger");
  as.nobody();
  assert.equal((await GET(new Request("http://test/api/handover?month=2026-06"))).status, 401);
  as.admin();
  assert.equal((await GET(new Request("http://test/api/handover?month=June"))).status, 400);
  await L.createTransaction(fd({ type: "EXPENSE", amount: 5000, currency: "VND", date: "2026-06-15", accountId: S.vnd.id, description: "with receipt", files: new File([new Uint8Array([1, 2, 3])], "receipt ánh.pdf") }));
  const res = await GET(new Request("http://test/api/handover?month=2026-06"));
  assert.equal(res.status, 200);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const names = Object.keys(zip);
  assert.ok(names.includes("WF-handover-2026-06.xlsx"), names.join(", "));
  const evidence = names.filter((n) => n.startsWith("evidence/"));
  assert.equal(evidence.length, 1);
  assert.ok(!evidence[0].includes("..") && /^[\w./-]+$/.test(evidence[0]), evidence[0]); // safe names inside the ZIP
  const wb = xlsx.read(zip["WF-handover-2026-06.xlsx"]);
  assert.deepEqual(wb.SheetNames, ["Read me", "Ledger", "Invoices", "Bank reconciliation", "Missing documents", "Open questions", "Change history"]);
  const ledger = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets.Ledger);
  assert.equal(ledger.find((r) => r.Description === "with receipt")?.Evidence, evidence[0]);
  const questions = xlsx.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets["Open questions"]);
  assert.ok(questions.some((q) => q.Area === "Not reviewed")); // the staff draft from the export test
});
