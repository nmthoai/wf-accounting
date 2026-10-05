import { test } from "node:test";
import assert from "node:assert/strict";
import { diff, snapshot } from "@/lib/history";
import { uploadProblem, MAX_UPLOAD_MB } from "@/lib/upload-limit";

test("history diff records only tracked fields that changed, with the reason", () => {
  const before = { amount: 100, description: "a", date: new Date("2026-06-01T00:00:00Z"), vatAmount: null, secret: "x" };
  const after = { amount: 100, description: "b", date: new Date("2026-06-02T00:00:00Z"), vatAmount: null, secret: "y" };
  const rows = diff("t1", before, after, "typo");
  assert.deepEqual(rows.map((r) => [r.field, r.oldValue, r.newValue, r.reason]), [
    ["date", "2026-06-01", "2026-06-02", "typo"],
    ["description", "a", "b", "typo"],
  ]);
  assert.deepEqual(diff("t1", { reviewNote: null }, { reviewNote: "" }), []); // empty and null are the same
});

test("snapshot is a one-line picture of an entry", () => {
  assert.equal(snapshot({ type: "EXPENSE", date: new Date("2026-06-21T00:00:00Z"), amount: 8221200, currency: "VND", description: "Bill 12" }), "EXPENSE 2026-06-21 8221200 VND · Bill 12");
});

test("uploads: 10 MB of attachments per save", () => {
  const mb = (n: number) => new File([new Uint8Array(Math.round(n * 1024 * 1024))], `f${n}.pdf`);
  assert.equal(MAX_UPLOAD_MB, 10);
  assert.equal(uploadProblem([mb(4), mb(6)]), null);
  assert.match(uploadProblem([mb(6), mb(5)])!, /10 MB per save/);
  assert.equal(uploadProblem([]), null);
});
