import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

// Owner rules (2026-11-01): a project can't end before it starts, and no two
// projects, clients or vendors share a name (trimmed, spaces collapsed, any case).
let S: Awaited<ReturnType<typeof seed>>;
let P: typeof import("@/app/actions/projects");
let C: typeof import("@/app/actions/clients");
let V: typeof import("@/app/actions/vendors");
before(async () => {
  S = await seed();
  P = await import("@/app/actions/projects");
  C = await import("@/app/actions/clients");
  V = await import("@/app/actions/vendors");
});

const projectNamed = (name: string) => S.prisma.project.findFirstOrThrow({ where: { name } });

test("a project end date before its start date is refused on create and on edit, with both dates named", async () => {
  as.staff();
  const bad = await P.createProject(fd({ name: "Dated create", startDate: "2026-11-01", endDate: "2026-10-01" }));
  assert.equal(bad.success, false);
  assert.match(bad.message ?? "", /2026-10-01.*2026-11-01.*on or after 2026-11-01/);
  assert.equal(await S.prisma.project.count({ where: { name: "Dated create" } }), 0);

  // Same day, open-ended and either date alone are all fine.
  assert.equal((await P.createProject(fd({ name: "Dated create", startDate: "2026-11-01", endDate: "2026-11-01" }))).success, true);
  const p = await projectNamed("Dated create");
  assert.equal(p.endDate?.toISOString().slice(0, 10), "2026-11-01");

  const edit = await P.updateProject(p.id, fd({ name: "Dated create", status: "ACTIVE", startDate: "2026-12-01", endDate: "2026-11-30" }));
  assert.equal(edit.success, false);
  assert.match(edit.message ?? "", /2026-11-30.*2026-12-01/);
  assert.equal((await projectNamed("Dated create")).startDate?.toISOString().slice(0, 10), "2026-11-01"); // nothing saved

  assert.equal((await P.updateProject(p.id, fd({ name: "Dated create", status: "ACTIVE", startDate: "2026-12-01" }))).success, true);
  assert.equal((await P.updateProject(p.id, fd({ name: "Dated create", status: "ACTIVE", endDate: "2026-01-01" }))).success, true);
});

test("an old project saved with its dates the wrong way round still lists, archives, and saves once fixed", async () => {
  as.staff();
  const old = await S.prisma.project.create({ data: { name: "Legacy dates", startDate: new Date("2026-11-01"), endDate: new Date("2026-10-01") } });
  assert.ok((await S.prisma.project.findMany()).some((p) => p.id === old.id));
  assert.equal((await P.setProjectStatus(old.id, "ARCHIVED")).success, true);
  assert.equal((await P.updateProject(old.id, fd({ name: "Legacy dates", status: "ACTIVE", startDate: "2026-11-01", endDate: "2026-10-01" }))).success, false);
  assert.equal((await P.updateProject(old.id, fd({ name: "Legacy dates", status: "ACTIVE", startDate: "2026-10-01", endDate: "2026-11-01" }))).success, true);
});

test("a duplicate project name is refused whatever its spacing or case, and the message names the existing project", async () => {
  as.staff();
  assert.equal((await P.createProject(fd({ name: "AI Interview" }))).success, true);
  for (const name of ["AI Interview", "  ai   interview ", "AI\tINTERVIEW"]) {
    const res = await P.createProject(fd({ name }));
    assert.equal(res.success, false, name);
    assert.equal(res.message, "A project called “AI Interview” already exists — use that project, or give this one a different name.");
  }
  assert.equal(await S.prisma.project.count({ where: { name: { contains: "nterview" } } }), 1);
  // A different name is fine.
  assert.equal((await P.createProject(fd({ name: "AI Interview 2" }))).success, true);
});

test("renaming a project onto another's name is refused; renaming it to its own name in new case is fine", async () => {
  as.admin();
  await P.createProject(fd({ name: "Rename source" }));
  await P.createProject(fd({ name: "Rename target" }));
  const src = await projectNamed("Rename source");

  const clash = await P.updateProject(src.id, fd({ name: "rename TARGET", status: "ACTIVE" }));
  assert.equal(clash.success, false);
  assert.match(clash.message ?? "", /“Rename target”/);
  assert.equal((await S.prisma.project.findUniqueOrThrow({ where: { id: src.id } })).name, "Rename source");

  assert.equal((await P.updateProject(src.id, fd({ name: "RENAME Source", status: "DONE" }))).success, true);
  const after = await S.prisma.project.findUniqueOrThrow({ where: { id: src.id } });
  assert.equal(after.name, "RENAME Source");
  assert.equal(after.status, "DONE");
});

test("projects, clients and vendors that already share a name still list, edit and rename apart", async () => {
  as.staff();
  // Saved before the rule existed.
  const [p1, p2] = await Promise.all([
    S.prisma.project.create({ data: { name: "Twin project" } }),
    S.prisma.project.create({ data: { name: "twin project " } }),
  ]);
  const [c1, c2] = await Promise.all([
    S.prisma.client.create({ data: { name: "Twin client" } }),
    S.prisma.client.create({ data: { name: "TWIN CLIENT" } }),
  ]);
  const [v1, v2] = await Promise.all([
    S.prisma.vendor.create({ data: { name: "Twin vendor" } }),
    S.prisma.vendor.create({ data: { name: "twin  vendor" } }),
  ]);
  assert.equal((await S.prisma.project.findMany({ where: { id: { in: [p1.id, p2.id] } } })).length, 2);

  // Editing other fields while the name stays the same is allowed.
  assert.equal((await P.updateProject(p1.id, fd({ name: "Twin project", status: "PENDING", description: "kept" }))).success, true);
  assert.equal((await C.updateClient(c1.id, fd({ name: "Twin client", email: "a@b.co" }))).success, true);
  assert.equal((await V.updateVendor(v1.id, fd({ name: "Twin vendor", phone: "0900" }))).success, true);

  // Renaming one of a pair apart is allowed, and then neither may take the other's name back.
  assert.equal((await P.updateProject(p2.id, fd({ name: "Twin project B", status: "ACTIVE" }))).success, true);
  assert.equal((await C.updateClient(c2.id, fd({ name: "Twin client B" }))).success, true);
  assert.equal((await V.updateVendor(v2.id, fd({ name: "Twin vendor B" }))).success, true);
  assert.equal((await P.updateProject(p2.id, fd({ name: "twin project", status: "ACTIVE" }))).success, false);
  assert.equal((await C.updateClient(c2.id, fd({ name: "twin client" }))).success, false);
  assert.equal((await V.updateVendor(v2.id, fd({ name: "twin vendor" }))).success, false);
});

test("a duplicate client name is refused on add and on rename, within the clients list only", async () => {
  as.staff();
  assert.equal((await C.createClient(fd({ name: "Acme Co" }))).success, true);
  const dup = await C.createClient(fd({ name: " acme  co " }));
  assert.equal(dup.success, false);
  assert.equal(dup.message, "A client called “Acme Co” already exists — use that client, or give this one a different name.");
  assert.equal(await S.prisma.client.count({ where: { name: { contains: "cme" } } }), 1);

  assert.equal((await C.createClient(fd({ name: "Beta Co" }))).success, true);
  const beta = await S.prisma.client.findFirstOrThrow({ where: { name: "Beta Co" } });
  const rename = await C.updateClient(beta.id, fd({ name: "ACME CO" }));
  assert.equal(rename.success, false);
  assert.match(rename.message ?? "", /“Acme Co”/);
  assert.equal((await C.updateClient(beta.id, fd({ name: "beta co" }))).success, true); // its own name, new case

  // A vendor may share a client's name: they are separate lists.
  assert.equal((await V.createVendor(fd({ name: "Acme Co" }))).success, true);
});

test("a duplicate vendor name is refused on add and on rename, within the vendors list only", async () => {
  as.staff();
  // The seed already has "ODP Solution".
  const dup = await V.createVendor(fd({ name: "odp   SOLUTION" }));
  assert.equal(dup.success, false);
  assert.equal(dup.message, "A vendor called “ODP Solution” already exists — use that vendor, or give this one a different name.");
  assert.equal(await S.prisma.vendor.count({ where: { name: { contains: "OD" } } }), 1);

  assert.equal((await V.createVendor(fd({ name: "ZDN" }))).success, true);
  const zdn = await S.prisma.vendor.findFirstOrThrow({ where: { name: "ZDN" } });
  const rename = await V.updateVendor(zdn.id, fd({ name: "ODP Solution" }));
  assert.equal(rename.success, false);
  assert.match(rename.message ?? "", /“ODP Solution”/);
  assert.equal((await S.prisma.vendor.findUniqueOrThrow({ where: { id: zdn.id } })).name, "ZDN");

  // A client may share a vendor's name.
  assert.equal((await C.createClient(fd({ name: "ZDN" }))).success, true);
});

test("Vietnamese names match whether the accents were typed precomposed or combining", async () => {
  as.staff();
  assert.equal((await C.createClient(fd({ name: "Công ty Đức" }))).success, true);
  const res = await C.createClient(fd({ name: "CÔNG TY ĐỨC".normalize("NFD") }));
  assert.equal(res.success, false);
  assert.match(res.message ?? "", /“Công ty Đức”/);
});
