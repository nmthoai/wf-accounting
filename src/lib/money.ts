// Movement kinds. Only INCOME and EXPENSE are profit & loss; every other kind just
// moves money between accounts or finances the company, so it never touches P&L.
export const TYPE_LABEL: Record<string, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  CAPITAL_IN: "Capital contribution",
  LOAN_IN: "Loan received",
  LOAN_REPAY: "Loan repayment",
  OTHER_IN: "Unclassified in",
  OTHER_OUT: "Unclassified out",
};

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  BANK: "Bank",
  CASH: "Cash",
  OWNER: "Owner",
  TERM_DEPOSIT: "Term deposit",
};

export const RATE_SOURCE_LABEL: Record<string, string> = {
  BANK: "bank",
  MANUAL: "manual",
  DEFAULT: "default",
};

const INFLOW = new Set(["INCOME", "TRANSFER_IN", "CAPITAL_IN", "LOAN_IN", "OTHER_IN"]);

export const isPnl = (type: string) => type === "INCOME" || type === "EXPENSE";
export const isInflow = (type: string) => INFLOW.has(type);

type Money = { amount: number; exchangeRate: number; vndAmount?: number | null };

// VND value: the exact settled VND when known, otherwise amount × rate.
export const toVnd = (t: Money) => t.vndAmount ?? t.amount * t.exchangeRate;

// Signed movement in the account's own currency (a VND account moves by the VND
// value; a USD account by the USD amount).
export function accountDelta(t: Money & { type: string }, accountCurrency: string) {
  const v = accountCurrency === "VND" ? toVnd(t) : t.amount;
  return isInflow(t.type) ? v : -v;
}

type BalanceAccount = { id: string; currency: string; openingBalance: number; openingDate: Date | null };
type BalanceTxn = Money & { type: string; accountId: string | null; date: Date };

// Balance per account = opening balance + movements dated on/after the opening date.
export function computeBalances(accounts: BalanceAccount[], txns: BalanceTxn[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const bal = new Map(accounts.map((a) => [a.id, a.openingBalance]));
  for (const t of txns) {
    const a = t.accountId ? byId.get(t.accountId) : undefined;
    if (!a || (a.openingDate && t.date < a.openingDate)) continue;
    bal.set(a.id, bal.get(a.id)! + accountDelta(t, a.currency));
  }
  return bal;
}

// Currencies an amount can originally be in. Accounts themselves are VND or USD.
export const CURRENCIES = ["VND", "USD", "EUR"];

export type Totals = Record<string, number>;

// Money per currency, split into cash & bank, term deposits, and the owner's
// position. Currencies are never added together or revalued: a USD balance
// stays USD (an ending-balance valuation would need a real rate, not a default).
// Owner accounts: positive = the owner holds company money (e.g. client cash
// received personally); negative = the company owes the owner (owner-paid costs).
export function cashPosition(accounts: { id: string; type: string; currency: string }[], bal: Map<string, number>) {
  const liquid: Totals = {};
  const deposits: Totals = {};
  const owner: Totals = {};
  for (const a of accounts) {
    const target = a.type === "OWNER" ? owner : a.type === "TERM_DEPOSIT" ? deposits : liquid;
    target[a.currency] = (target[a.currency] ?? 0) + (bal.get(a.id) ?? 0);
  }
  return { liquid, deposits, owner };
}

export const fmtVnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";
export const fmtMoney = (n: number, currency: string) =>
  currency === "VND" ? fmtVnd(n) : new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

// Amounts within half a cent/dong are treated as equal.
export const EPS = 0.005;

// How far an invoice is settled: payments received, separately evidenced fees,
// and the unmatched difference (> 0 still open or unexplained, < 0 overpaid).
export function settlement(gross: number, allocations: { kind: string; amount: number }[]) {
  const received = allocations.filter((a) => a.kind === "PAYMENT").reduce((s, a) => s + a.amount, 0);
  const fees = allocations.filter((a) => a.kind === "FEE").reduce((s, a) => s + a.amount, 0);
  return { received, fees, difference: gross - received - fees };
}

// Non-zero totals in a fixed currency order, e.g. [["VND", 53636145], ["USD", 435.75]].
export const totalsList = (t: Totals): [string, number][] =>
  Object.entries(t)
    .filter(([, v]) => Math.abs(v) >= 0.005)
    .sort(([a], [b]) => CURRENCIES.indexOf(a) - CURRENCIES.indexOf(b));
