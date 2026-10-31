import { toVnd, isBooked } from "@/lib/money";

// Profit & loss by month for a period: booked income and expense entries
// only, in VND, per category and per item. Months are YYYY-MM; dates are
// stored as UTC midnight of the day.

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_MONTHS = 240;

export function addMonths(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(0);
  d.setUTCFullYear(y, m - 1 + delta, 1); // setUTCFullYear keeps years 0–99 as they are (Date.UTC maps them to 19xx)
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Every month from `from` to `to`, both included (empty if from > to); a range
// longer than MAX_MONTHS keeps its latest months.
export function monthsBetween(from: string, to: string) {
  if (from > to) return [];
  const out: string[] = [];
  for (let m = to; m >= from && out.length < MAX_MONTHS; m = addMonths(m, -1)) out.unshift(m);
  return out;
}

export const monthStart = (month: string) => new Date(`${month}-01T00:00:00.000Z`);

// Chart axis: 1, 2 or 5 × 10^k steps from at or below `lo` to at or above `hi`, including 0.
export function chartTicks(lo: number, hi: number) {
  lo = Math.min(lo, 0); hi = Math.max(hi, 0);
  const span = hi - lo || 1;
  const pow = 10 ** Math.floor(Math.log10(span / 5));
  const step = [1, 2, 5, 10].map((k) => k * pow).find((s) => span / s <= 6)!;
  const first = Math.floor(lo / step), last = Math.ceil(hi / step);
  const out: number[] = [];
  for (let k = first; k <= last; k++) out.push(k * step);
  return out.length > 1 ? out : [0, step];
}

export type PnlEntry = {
  id: string; date: Date; type: string; amount: number; currency: string; exchangeRate: number; vndAmount: number | null;
  rateSource: string | null; description: string | null; status: string; category: { name: string } | null; project: { name: string } | null;
};
export type PnlItem = { id: string; date: string; month: string; description: string; project: string | null; currency: string; amount: number; vnd: number; provisional: boolean };
export type PnlCategory = { name: string; perMonth: number[]; total: number; items: PnlItem[] };
export type PnlSide = { perMonth: number[]; total: number; categories: PnlCategory[] };
export type Pnl = { months: string[]; revenue: PnlSide; cost: PnlSide; net: number[]; netTotal: number; provisional: number };

// A foreign-currency amount valued at a default or manual rate, not the VND
// actually settled — its VND figure is an estimate until revalued.
export const isProvisional = (t: { currency: string; vndAmount: number | null; rateSource: string | null }) =>
  t.currency !== "VND" && t.vndAmount == null && t.rateSource !== "BANK";

function side(entries: PnlEntry[], months: string[], uncategorized: string): PnlSide {
  const at = new Map(months.map((m, i) => [m, i]));
  const cats = new Map<string, PnlCategory>();
  for (const t of entries) {
    const month = t.date.toISOString().slice(0, 7);
    const i = at.get(month);
    if (i === undefined) continue;
    const name = t.category?.name || uncategorized;
    const c = cats.get(name) ?? { name, perMonth: months.map(() => 0), total: 0, items: [] };
    const vnd = toVnd(t);
    c.perMonth[i] += vnd;
    c.total += vnd;
    c.items.push({
      id: t.id, date: t.date.toISOString().slice(0, 10), month, description: t.description ?? "", project: t.project?.name ?? null,
      currency: t.currency, amount: t.amount, vnd, provisional: isProvisional(t),
    });
    cats.set(name, c);
  }
  const categories = [...cats.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  for (const c of categories) c.items.sort((a, b) => a.date.localeCompare(b.date) || b.vnd - a.vnd);
  const perMonth = months.map((_, i) => categories.reduce((s, c) => s + c.perMonth[i], 0));
  return { perMonth, total: perMonth.reduce((s, v) => s + v, 0), categories };
}

// Drafts and rejected entries are not in the books, whatever the caller passes.
export function buildPnl(entries: PnlEntry[], months: string[], uncategorized: string): Pnl {
  const inPeriod = new Set(months);
  const booked = entries.filter((t) => isBooked(t) && inPeriod.has(t.date.toISOString().slice(0, 7)));
  const revenue = side(booked.filter((t) => t.type === "INCOME"), months, uncategorized);
  const cost = side(booked.filter((t) => t.type === "EXPENSE"), months, uncategorized);
  const net = months.map((_, i) => revenue.perMonth[i] - cost.perMonth[i]);
  const provisional = booked.filter((t) => (t.type === "INCOME" || t.type === "EXPENSE") && isProvisional(t)).length;
  return { months, revenue, cost, net, netTotal: revenue.total - cost.total, provisional };
}
