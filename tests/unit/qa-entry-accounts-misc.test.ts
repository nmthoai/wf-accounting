// QA pass: the change history shows a created entry's snapshot and the app's own
// reasons in the reader's language, without changing what is stored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { snapshot } from "@/lib/history";
import { APP_REASONS, parseSnapshot } from "@/lib/history-format";
import { RAW_MESSAGES } from "@/i18n/messages";

test("a stored snapshot reads back into its parts", () => {
  const stored = snapshot({ type: "INCOME", date: new Date("2026-10-31T00:00:00Z"), amount: -250, currency: "USD", description: "Reversal: QA · edited" });
  assert.deepEqual(parseSnapshot(stored), { type: "INCOME", date: "2026-10-31", amount: -250, currency: "USD", description: "Reversal: QA · edited" });
  const bare = snapshot({ type: "EXPENSE", date: new Date("2026-06-21T00:00:00Z"), amount: 8221200, currency: "VND", description: null });
  assert.deepEqual(parseSnapshot(bare), { type: "EXPENSE", date: "2026-06-21", amount: 8221200, currency: "VND", description: null });
});

test("other history values are not mistaken for a snapshot", () => {
  assert.equal(parseSnapshot("invoice INV-7 · PAYMENT 250"), null);
  assert.equal(parseSnapshot("cmvwm5l91001ws4wjcw4fusbf PAYMENT 250"), null);
  assert.equal(parseSnapshot("receipt.pdf"), null);
});

test("every reason the app writes has a message in both languages", () => {
  for (const key of Object.values(APP_REASONS)) {
    for (const l of ["en", "vi"] as const) {
      const reasons = (RAW_MESSAGES[l] as { ledger: { history: { reasons: Record<string, string> } } }).ledger.history.reasons;
      assert.ok(reasons[key], `${l} ledger.history.reasons.${key}`);
    }
  }
});
