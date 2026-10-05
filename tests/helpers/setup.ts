// Test harness, imported first by every integration test file: a throwaway
// SQLite database and upload folder, a switchable signed-in user in place of
// next-auth, and no-op cache revalidation. App modules must be loaded with
// `await import(...)` (e.g. in a `before` hook) AFTER this file, so the mocks
// and env apply to them. Run from the project root (npm test).
import { mock } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), "wf-test-"));
process.env.DATABASE_URL = `file:${join(dir, "test.db")}`;
process.env.UPLOAD_DIR = join(dir, "uploads");
execFileSync(join(root, "node_modules/.bin/prisma"), ["db", "push", "--skip-generate"], { cwd: root, env: process.env, stdio: "ignore" });

type Session = { user: { id: string; name: string; role: string; twoFactorEnabled: boolean; mustChangePassword: boolean } } | null;
let session: Session = null;
const user = (id: string, name: string, role: string, onboarded = true) =>
  ({ user: { id, name, role, twoFactorEnabled: onboarded, mustChangePassword: !onboarded } });
export const as = {
  admin: () => { session = user("u-admin", "owner", "ADMIN"); },
  staff: () => { session = user("u-staff", "dot", "USER"); },
  // Signed in with the default password, 2FA not yet enrolled.
  pending: () => { session = user("u-new", "newcomer", "ADMIN", false); },
  nobody: () => { session = null; },
};

mock.module("@/auth", { namedExports: { auth: async () => session, signIn: async () => undefined, signOut: async () => undefined, handlers: {} } });
mock.module("next/cache", { namedExports: { revalidatePath: () => undefined, revalidateTag: () => undefined } });

export const uploadDir = process.env.UPLOAD_DIR;

// FormData from a plain object; File values are appended as files.
export function fd(values: Record<string, string | number | File | File[] | undefined | null>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined || v === null) continue;
    for (const item of Array.isArray(v) ? v : [v]) f.append(k, item instanceof File ? item : String(item));
  }
  return f;
}

// The users behind the mocked sessions (the session check reads them from the
// database), plus accounts, categories and a vendor most tests need.
export async function seed() {
  const { prisma } = await import("@/lib/prisma");
  await prisma.user.createMany({
    data: [
      { id: "u-admin", username: "owner", passwordHash: "x", role: "ADMIN", twoFactorEnabled: true, mustChangePassword: false },
      { id: "u-staff", username: "dot", passwordHash: "x", role: "USER", twoFactorEnabled: true, mustChangePassword: false },
      { id: "u-new", username: "newcomer", passwordHash: "x", role: "ADMIN", twoFactorEnabled: false, mustChangePassword: true },
    ],
  });
  const open = new Date("2026-05-01T00:00:00.000Z");
  const [vnd, usd, owner, cash] = await Promise.all([
    prisma.account.create({ data: { name: "MB VND", type: "BANK", currency: "VND", openingDate: open } }),
    prisma.account.create({ data: { name: "MB USD", type: "BANK", currency: "USD", openingDate: open } }),
    prisma.account.create({ data: { name: "Owner-paid", type: "OWNER", currency: "VND" } }),
    prisma.account.create({ data: { name: "Company cash", type: "CASH", currency: "VND" } }),
  ]);
  const [income, expense] = await Promise.all([
    prisma.category.create({ data: { name: "Client Project", type: "INCOME" } }),
    prisma.category.create({ data: { name: "Cloud & software", type: "EXPENSE" } }),
  ]);
  const vendor = await prisma.vendor.create({ data: { name: "ODP Solution" } });
  return { prisma, vnd, usd, owner, cash, income, expense, vendor };
}
