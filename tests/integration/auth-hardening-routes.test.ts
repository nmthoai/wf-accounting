// A download link opened after the session ended goes to sign-in instead of a
// bare "Unauthorized" page (the proxy leaves /api alone, so the route redirects).
import { as, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

before(async () => {
  await seed();
});

const routes = {
  handover: { mod: "@/app/api/handover/route", url: "http://app.test/api/handover?month=2026-06" },
  export: { mod: "@/app/api/reports/export/route", url: "http://app.test/api/reports/export?type=entries&from=2026-06-01&to=2026-06-30" },
};

for (const [name, r] of Object.entries(routes)) {
  test(`${name}: signed out or mid-onboarding → redirected to /login, nothing served`, async () => {
    const { GET } = await import(r.mod);
    for (const who of [as.nobody, as.pending]) {
      who();
      const res: Response = await GET(new Request(r.url));
      assert.ok(res.status >= 300 && res.status < 400, `status ${res.status}`);
      assert.equal(res.headers.get("location"), "/login"); // relative, never the container host
      assert.equal(res.headers.get("content-disposition"), null);
    }
  });

  test(`${name}: signed in → the file`, async () => {
    const { GET } = await import(r.mod);
    as.admin();
    const res: Response = await GET(new Request(r.url));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", /^attachment;/);
  });
}
