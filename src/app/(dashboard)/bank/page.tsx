import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { accountDelta, fmtMoney, isPnl, isBooked } from "@/lib/money";
import { explained, tolerance } from "@/lib/bank-match";
import { BankClient, type LineRow, type EntryOpt, type AccountSummary, type StatementRow } from "@/components/bank/bank-client";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

export default async function BankPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const session = await requirePageSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const tb = await getTranslations("bank");
  const tc = await getTranslations("common");

  const accounts = await prisma.account.findMany({
    where: { OR: [{ type: "BANK" }, { statements: { some: {} } }] },
    orderBy: { createdAt: "asc" },
  });
  const accountIds = accounts.map((a) => a.id);
  const [statements, lines, entries] = await Promise.all([
    prisma.bankStatement.findMany({ where: { accountId: { in: accountIds } }, orderBy: [{ periodTo: "desc" }, { createdAt: "desc" }], include: { _count: { select: { lines: true } } } }),
    prisma.bankLine.findMany({ where: { accountId: { in: accountIds } }, orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }], include: { entries: true } }),
    prisma.transaction.findMany({ where: { accountId: { in: accountIds } }, orderBy: { date: "desc" } }),
  ]);
  const acc = new Map(accounts.map((a) => [a.id, a]));
  const label = (t: { type: string; description: string | null; status: string }) => {
    const base = `${tc(`type.${t.type}`)}${t.description ? ` · ${t.description}` : ""}`;
    return t.status === "DRAFT" ? tb("page.draftLabel", { label: base }) : base;
  };
  // A reversal and the posted entry it cancels net to zero — neither is a bank movement.
  const cancelled = new Set(entries.map((t) => t.reversalOfId).filter(Boolean));
  const live = (t: { id: string; reversalOfId: string | null }) => !t.reversalOfId && !cancelled.has(t.id);
  const href = (t: { id: string; type: string }) => (isPnl(t.type) ? `/entry/${t.id}` : "/accounts");

  // A receipt and the bank fee withheld from it reach the bank as one net
  // movement: offered, matched and listed together, at the net amount.
  type E = (typeof entries)[number];
  const byId = new Map(entries.map((t) => [t.id, t]));
  const feeOf = new Map(entries.filter((t) => t.deductedFromId).map((t) => [t.deductedFromId!, t]));
  const unmatched = (t: E) => !t.bankLineId && live(t);
  const asUnit = (t: E) => {
    const a = acc.get(t.accountId!)!;
    const fee = feeOf.get(t.id);
    const withFee = fee && unmatched(fee) ? fee : null;
    return {
      id: t.id, accountId: a.id, date: iso(t.date), href: href(t),
      amount: accountDelta(t, a.currency) + (withFee ? accountDelta(withFee, a.currency) : 0),
      label: withFee ? tb("page.feeDeducted", { label: label(t), fee: fmtMoney(Math.abs(accountDelta(withFee, a.currency)), a.currency) }) : label(t),
    };
  };
  const ownUnit = (t: E) => !(t.deductedFromId && byId.get(t.deductedFromId) && unmatched(byId.get(t.deductedFromId)!));

  // Ledger entries not yet on any bank line — candidates for matching.
  const open: EntryOpt[] = entries.filter((t) => unmatched(t) && ownUnit(t)).map(asUnit);

  // Each line: how much of it the ledger explains, oldest first for suggestions.
  const rows: LineRow[] = lines.map((l) => {
    const a = acc.get(l.accountId)!;
    const matched = explained(l, l.entries, a.currency);
    const remaining = Math.abs(l.amount) - matched;
    const tol = tolerance(a.currency);
    return {
      id: l.id, accountId: a.id, accountName: a.name, currency: a.currency,
      txnDate: iso(l.txnDate), postingDate: l.postingDate ? iso(l.postingDate) : null,
      reference: l.reference, counterparty: l.counterparty, description: l.description, locator: l.locator,
      amount: l.amount, remaining: remaining > tol ? remaining : 0,
      status: matched <= tol ? "UNMATCHED" : remaining > tol ? "PARTIAL" : "MATCHED",
      entries: l.entries.map((t) => ({ id: t.id, label: label(t), date: iso(t.date), amount: Math.sign(l.amount) * accountDelta(t, a.currency), href: href(t) })),
      suggestion: null,
    };
  });

  // Suggest one entry per open line: same account and direction, the exact
  // amount still open, dated within a week of the bank's dates. Each entry is
  // suggested once, closest date first.
  const used = new Set<string>();
  for (const r of [...rows].reverse()) {
    if (r.remaining === 0) continue;
    const near = (d: string) => Math.min(...[r.txnDate, r.postingDate].filter(Boolean).map((x) => Math.abs(+new Date(d) - +new Date(x!)) / DAY));
    const best = open
      .filter((e) => e.accountId === r.accountId && !used.has(e.id) && Math.sign(e.amount) === Math.sign(r.amount)
        && Math.abs(Math.abs(e.amount) - r.remaining) <= tolerance(r.currency) && near(e.date) <= 7)
      .sort((x, y) => near(x.date) - near(y.date))[0];
    if (best) { used.add(best.id); r.suggestion = best; }
  }

  // Per account: the latest statement's closing balance against the app's
  // balance on that day, and entries in the statement period with no bank line.
  const summaries: AccountSummary[] = accounts.map((a) => {
    const st = statements.find((s) => s.accountId === a.id);
    const own = statements.filter((s) => s.accountId === a.id);
    const from = own.length ? Math.min(...own.map((s) => +s.periodFrom)) : null;
    const to = st ? +st.periodTo : null;
    // The app's balance on the statement's last day — reviewed and posted entries only.
    const upTo = entries.filter((t) => t.accountId === a.id && (!a.openingDate || t.date >= a.openingDate) && st && +t.date <= to!);
    const appBalance = st ? upTo.filter(isBooked).reduce((s, t) => s + accountDelta(t, a.currency), a.openingBalance) : null;
    const notOnStatement = from !== null
      ? entries.filter((t) => t.accountId === a.id && unmatched(t) && ownUnit(t) && +t.date >= from && +t.date <= to!).map(asUnit)
      : [];
    const mine = rows.filter((r) => r.accountId === a.id);
    return {
      id: a.id, name: a.name, currency: a.currency,
      bankClosing: st ? st.closingBalance : null, asOf: st ? iso(st.periodTo) : null, appBalance,
      lines: mine.length, open: mine.filter((r) => r.status !== "MATCHED").length,
      drafts: upTo.filter((t) => !isBooked(t)).length,
      notOnStatement,
    };
  });

  const statementRows: StatementRow[] = statements.map((s) => ({
    id: s.id, accountName: acc.get(s.accountId)!.name, currency: acc.get(s.accountId)!.currency, fileName: s.fileName,
    periodFrom: iso(s.periodFrom), periodTo: iso(s.periodTo),
    opening: s.openingBalance, inflows: s.inflows, outflows: s.outflows, closing: s.closingBalance,
    lineCount: s.lineCount, added: s._count.lines, importedBy: s.importedBy, importedAt: iso(s.createdAt),
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{tb("page.title")}</h1>
        <p className="text-muted-foreground mt-1">{tb("page.subtitle")}</p>
      </div>
      <BankClient
        isAdmin={isAdmin}
        view={sp.view === "all" || sp.view === "imports" ? sp.view : "open"}
        accounts={accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name, currency: a.currency, type: a.type, isActive: a.isActive }))}
        summaries={summaries}
        lines={rows}
        entries={open}
        statements={statementRows}
      />
    </div>
  );
}
