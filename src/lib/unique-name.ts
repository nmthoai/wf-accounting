// Duplicate-name check for projects, clients and vendors (owner rule, 2026-11-01).
// Names match when they are the same after trimming, collapsing inner spaces and
// ignoring case: "AI  interview " is the same project as "AI Interview". SQLite
// through Prisma has no case-insensitive mode, so the comparison runs here, over
// the list's names (each list is small). NFC keeps a Vietnamese name typed with
// combining accents equal to the same name typed precomposed.
export const nameKey = (name: string) => name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

// The other record already using this name, if any. On a rename, pass the record's
// own id: changing only its spacing or case is not a clash with itself. A record
// whose name is not changing is never refused, so duplicates saved before this
// rule existed can still be edited (and renamed apart).
export function findSameName<T extends { id: string; name: string }>(rows: T[], name: string, selfId?: string): T | undefined {
  const key = nameKey(name);
  const self = selfId ? rows.find((r) => r.id === selfId) : undefined;
  if (self && nameKey(self.name) === key) return undefined;
  return rows.find((r) => r.id !== selfId && nameKey(r.name) === key);
}
