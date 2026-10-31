// The Tax tab: the owner records the declarations the accountant filed, notes flags as
// known, and only the owner can see or change any of it — files included. Declarations
// and their files are kept apart from the books: no entry, invoice or attachment is touched.
import { as, fd, seed } from "../helpers/setup";
import { before, test } from "node:test";
import assert from "node:assert/strict";

let T: typeof import("@/app/actions/tax");
let F: typeof import("@/app/api/tax/files/[id]/route");
let U: typeof import("@/app/api/uploads/[name]/route");
let S: Awaited<ReturnType<typeof seed>>;
before(async () => {
  T = await import("@/app/actions/tax");
  F = await import("@/app/api/tax/files/[id]/route");
  U = await import("@/app/api/uploads/[name]/route");
  S = await seed();
});

// An invented Q2 2030 VAT declaration, typed the way declarations are printed.
const q2 = (extra: Record<string, string | number | File | File[]> = {}) => fd({
  form: "01/GTGT", period: "2030-Q2", supplement: 0, filedDate: "2030-07-14", submissionRef: "L000000000000000000001",
  line_22: "370.000", line_23: "7.650.000", line_24: "230.000", line_25: "230.000", line_27: "48.000.000", line_28: "4.800.000",
  line_32: "48.000.000", line_33: "4.800.000", line_34: "48.000.000", line_35: "4.800.000", line_36: "4.570.000",
  line_40a: "4.200.000", line_40: "4.200.000", ...extra,
});
const history = (entityId: string) => S.prisma.changeLog.findMany({ where: { entityId }, orderBy: { createdAt: "asc" } });
const pdf = (name: string) => new File(["%PDF-1.4 test"], name, { type: "application/pdf" });

test("signed out or as staff: nothing can be recorded, noted, changed or deleted", async () => {
  for (const who of [as.nobody, as.staff]) {
    who();
    await assert.rejects(T.saveTaxReturn(null, q2()), /Unauthorized/);
    await assert.rejects(T.setTaxFlagNote("sales-gap:2030-Q1", "x"), /Unauthorized/);
    await assert.rejects(T.clearTaxFlagNote("sales-gap:2030-Q1"), /Unauthorized/);
    await assert.rejects(T.deleteTaxReturn("x"), /Unauthorized/);
    await assert.rejects(T.deleteTaxReturnFile("x"), /Unauthorized/);
  }
  assert.equal(await S.prisma.taxReturn.count(), 0);
});

test("the owner records a declaration: figures stored exactly, the creation in the history, a second original refused", async () => {
  as.admin();
  const res = await T.saveTaxReturn(null, q2());
  assert.equal(res.success, true, res.message);
  const r = await S.prisma.taxReturn.findFirstOrThrow({ where: { form: "01/GTGT", period: "2030-Q2" } });
  assert.deepEqual(JSON.parse(r.lines), {
    "22": 370000, "23": 7650000, "24": 230000, "25": 230000, "27": 48000000, "28": 4800000, "32": 48000000, "33": 4800000,
    "34": 48000000, "35": 4800000, "36": 4570000, "40a": 4200000, "40": 4200000,
  });
  assert.equal(r.template, "TT80/2021");
  assert.equal(r.filedDate?.toISOString().slice(0, 10), "2030-07-14");
  assert.equal(r.createdBy, "owner");
  assert.deepEqual((await history(r.id)).map((h) => [h.entity, h.action]), [["TaxReturn", "CREATE"]]);

  const again = await T.saveTaxReturn(null, q2());
  assert.equal(again.success, false);
  const supplement = await T.saveTaxReturn(null, q2({ supplement: 1 }));
  assert.equal(supplement.success, true, supplement.message);
});

test("bad input changes nothing: a word or a decimal for a figure, a negative where the form has none, a bad quarter, an odd file", async () => {
  as.admin();
  const before = await S.prisma.taxReturn.count();
  for (const bad of [
    q2({ period: "2030-Q3", line_34: "12abc" }),
    q2({ period: "2030-Q3", line_34: "48000000.0" }),
    q2({ period: "2030-Q3", line_34: "-5" }),
    q2({ period: "2030-Q5" }),
    q2({ form: "03/TNDN", period: "2030-Q3" }),
    q2({ period: "2030-Q3", files: new File(["x"], "script.exe", { type: "application/octet-stream" }) }),
  ]) {
    const res = await T.saveTaxReturn(null, bad);
    assert.equal(res.success, false);
  }
  // A figure that doesn't read names its line, so the form can take the owner to it.
  const res = await T.saveTaxReturn(null, q2({ period: "2030-Q3", line_34: "48000000.0" }));
  assert.equal("field" in res && res.field, "line_34");
  assert.equal(await S.prisma.taxReturn.count(), before);
});

test("editing a figure keeps the old and new value in the history, by line code", async () => {
  as.admin();
  const r = await S.prisma.taxReturn.findFirstOrThrow({ where: { form: "01/GTGT", period: "2030-Q2", supplement: 0 } });
  const res = await T.saveTaxReturn(r.id, q2({ line_40: "4.200.900", notes: "typed from the PDF" }));
  assert.equal(res.success, true, res.message);
  const rows = (await history(r.id)).filter((h) => h.action === "UPDATE").map((h) => [h.field, h.oldValue, h.newValue]);
  assert.deepEqual(rows.sort(), [["[40]", "4200000", "4200900"], ["notes", null, "typed from the PDF"]]);
});

test("a flag noted as known needs a note, keeps it and its figure, and can be reopened", async () => {
  as.admin();
  assert.equal((await T.setTaxFlagNote("sales-gap:2030-Q1", "   ")).success, false);
  assert.equal((await T.setTaxFlagNote("not a key!", "x")).success, false);
  assert.equal((await T.setTaxFlagNote("sales-gap:2030-Q1", "Seen; kept for internal tracking.", 34500000)).success, true);
  const n = await S.prisma.taxFlagNote.findUniqueOrThrow({ where: { key: "sales-gap:2030-Q1" } });
  assert.deepEqual([n.note, n.figure, n.user], ["Seen; kept for internal tracking.", 34500000, "owner"]);
  await T.clearTaxFlagNote("sales-gap:2030-Q1");
  assert.equal(await S.prisma.taxFlagNote.count(), 0);
  assert.deepEqual((await history("sales-gap:2030-Q1")).map((h) => [h.entity, h.action, h.oldValue]),
    [["TaxFlag", "NOTE", null], ["TaxFlag", "REOPEN", "Seen; kept for internal tracking."]]);
});

test("a declaration's files are kept apart from the books' attachments and open for the owner only", async () => {
  as.admin();
  const attachments = await S.prisma.attachment.count();
  const res = await T.saveTaxReturn(null, fd({ form: "05/KK-TNCN", period: "2030-Q2", supplement: 0, files: [pdf("declaration.pdf"), pdf("list.pdf")] }));
  assert.equal(res.success, true, res.message);
  const r = await S.prisma.taxReturn.findFirstOrThrow({ where: { form: "05/KK-TNCN", period: "2030-Q2" }, include: { files: { orderBy: { fileName: "asc" } } } });
  assert.deepEqual(r.files.map((f) => f.fileName), ["declaration.pdf", "list.pdf"]);
  assert.equal(await S.prisma.attachment.count(), attachments); // no attachment row for a declaration's file
  const get = (id: string) => F.GET(new Request(`http://localhost/api/tax/files/${id}`), { params: Promise.resolve({ id }) });
  const [filed] = r.files;

  assert.equal((await get(filed.id)).status, 200);
  assert.match((await get(filed.id)).headers.get("Content-Disposition") ?? "", /declaration\.pdf/);
  assert.equal((await get("not-a-file")).status, 404);
  as.staff();
  assert.equal((await get(filed.id)).status, 404);
  as.nobody();
  assert.equal((await get(filed.id)).status, 401);

  // The books' file route can't reach a declaration's file, even for the owner.
  as.admin();
  for (const name of [filed.filePath, "tax"]) {
    assert.equal((await U.GET(new Request(`http://localhost/api/uploads/${name}`), { params: Promise.resolve({ name }) })).status, 404, name);
  }
});

test("deleting a file or the whole declaration removes it and leaves a note in the history", async () => {
  as.admin();
  const r = await S.prisma.taxReturn.findFirstOrThrow({ where: { form: "05/KK-TNCN", period: "2030-Q2" }, include: { files: { orderBy: { fileName: "asc" } } } });
  const get = (id: string) => F.GET(new Request(`http://localhost/api/tax/files/${id}`), { params: Promise.resolve({ id }) });
  const [filed, list] = r.files;

  assert.equal((await T.deleteTaxReturnFile(list.id)).success, true);
  assert.equal((await get(list.id)).status, 404);
  assert.equal(await S.prisma.taxReturnFile.count({ where: { taxReturnId: r.id } }), 1);

  await T.deleteTaxReturn(r.id);
  assert.equal(await S.prisma.taxReturn.count({ where: { id: r.id } }), 0);
  assert.equal(await S.prisma.taxReturnFile.count({ where: { taxReturnId: r.id } }), 0);
  assert.equal((await get(filed.id)).status, 404);
  const h = await history(r.id);
  assert.deepEqual(h.filter((x) => x.field === "file").map((x) => [x.oldValue, x.newValue]).sort(),
    [[null, "declaration.pdf"], [null, "list.pdf"], ["list.pdf", null]]);
  assert.match(h.find((x) => x.action === "DELETE")!.oldValue ?? "", /files deleted: declaration\.pdf$/);
});
