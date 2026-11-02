// Money typed into a form. Only a plain decimal number counts: "12abc",
// "Infinity", "1e999" and "0x10" are refused (NaN), and so is anything past a
// trillion-scale bound no real entry reaches. Empty is NaN too.
const MAX_AMOUNT = 1e15;

export function parseAmount(raw: FormDataEntryValue | string | null | undefined): number {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN; // plain decimal only: no hex, exponent or words
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) <= MAX_AMOUNT ? n : NaN;
}
