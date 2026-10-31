// Reading the change history back. Values are stored raw (see history.ts); these
// help show them in the reader's language without changing what is stored.

// The parts of a snapshot() line ("INCOME 2026-10-31 -250 USD · Note"), or null
// for any other text.
export function parseSnapshot(s: string) {
  const m = /^([A-Z_]+) (\d{4}-\d{2}-\d{2}) (\S+) ([A-Z]{3})(?: · ([\s\S]*))?$/.exec(s);
  const amount = m ? Number(m[3]) : NaN;
  if (!m || !Number.isFinite(amount)) return null;
  return { type: m[1], date: m[2], amount, currency: m[4], description: m[5] ?? null };
}

// Reasons the app writes itself (in English) → their key under ledger "history.reasons".
export const APP_REASONS: Record<string, string> = {
  "Correction of a reversed entry": "correction",
  "matched entry deleted": "matchedEntryDeleted",
};
