// QA pass, Oct 2026: staff saw Delete on projects, clients and vendors, which the
// server refuses (admin only — see tests/integration/authz-routes.test.ts). The
// pages pass the role down and each delete button sits behind isAdmin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const CASES = [
  { page: "src/app/(dashboard)/projects/page.tsx", client: "src/components/projects/projects-client.tsx", actions: ["deleteProject"] },
  { page: "src/app/(dashboard)/contacts/page.tsx", client: "src/components/contacts/contacts-client.tsx", actions: ["deleteClient", "deleteVendor"] },
];

for (const { page, client, actions } of CASES) {
  test(`${page} tells its list whether the viewer is an admin`, () => {
    assert.match(read(page), /isAdmin=\{session\.user\.role === "ADMIN"\}/);
  });

  for (const action of actions) {
    test(`${client}: the ${action} button shows only for admins`, () => {
      const src = read(client);
      const at = src.indexOf(`${action}(`);
      assert.notEqual(at, -1, `${action} is not called`);
      // The call belongs to the first button after the nearest `{isAdmin && (`.
      const gate = src.lastIndexOf("{isAdmin && (", at);
      assert.notEqual(gate, -1, `${action} is not behind isAdmin`);
      const between = src.slice(gate, at);
      assert.ok(between.includes("<Button") && !between.includes("</Button>"), `${action} is outside its isAdmin block`);
    });
  }
}
