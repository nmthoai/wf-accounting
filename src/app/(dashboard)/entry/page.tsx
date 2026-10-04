import { prisma } from "@/lib/prisma";
import { EntryForm } from "./entry-form";
import { defaultUsdRate } from "@/lib/fx";
import { auth } from "@/auth";
import { accountDelta, fmtMoney } from "@/lib/money";

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ bankLine?: string; reenter?: string }> }) {
  const { bankLine: lineId, reenter } = await searchParams;
  const [session, usdRate, accounts, categories, projects, vendors, line, reversed] = await Promise.all([
    auth(),
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    lineId ? prisma.bankLine.findUnique({ where: { id: lineId }, include: { account: true, entries: true } }) : null,
    reenter ? prisma.transaction.findUnique({ where: { id: reenter }, include: { reversedBy: true } }) : null,
  ]);

  // Started from a bank statement line: the part of it not yet in the ledger.
  let prefill;
  let bankLine;
  let correction;
  // Re-entering a reversed posted entry: start from its values, to be corrected.
  if (reversed?.reversedBy && (reversed.type === "INCOME" || reversed.type === "EXPENSE")) {
    const r = reversed;
    prefill = {
      type: r.type, accountId: r.accountId, date: r.date, amount: r.amount, currency: r.currency,
      exchangeRate: r.exchangeRate, vndAmount: r.vndAmount, rateSource: r.rateSource,
      categoryId: r.categoryId, projectId: r.projectId, vendorId: r.vendorId, invoiceNumber: r.invoiceNumber, description: r.description,
      docStatus: r.docStatus, purposeStatus: r.purposeStatus, citStatus: r.citStatus, vatStatus: r.vatStatus, vatAmount: r.vatAmount, reviewNote: r.reviewNote,
    };
    correction = { id: reversed.id, label: `${reversed.date.toISOString().slice(0, 10)} · ${fmtMoney(reversed.amount, reversed.currency)}${reversed.description ? ` · ${reversed.description}` : ""}` };
  }
  if (line) {
    const cur = line.account.currency;
    const matched = line.entries.reduce((s, t) => s + Math.abs(accountDelta(t, cur)), 0);
    const open = Math.round((Math.abs(line.amount) - matched) * 100) / 100;
    prefill = {
      type: line.amount > 0 ? "INCOME" : "EXPENSE",
      accountId: line.accountId,
      currency: cur,
      date: line.txnDate,
      amount: open,
      // A foreign-currency purchase paid from a VND account settles at the bank's VND figure.
      vndAmount: cur === "VND" ? open : null,
      rateSource: cur === "VND" ? "BANK" : null,
      description: line.counterparty ?? line.description ?? "",
    };
    bankLine = {
      id: line.id,
      label: `${line.txnDate.toISOString().slice(0, 10)} · ${line.amount < 0 ? "−" : "+"}${fmtMoney(open, cur)}${line.reference ? ` · ${line.reference}` : ""}`,
    };
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">New Entry</h1>
        <p className="text-muted-foreground mt-1">Log a new income or expense transaction</p>
      </div>

      <EntryForm
        categories={categories}
        projects={projects}
        vendors={vendors}
        accounts={accounts}
        defaultUsdRate={usdRate}
        isAdmin={session?.user?.role === "ADMIN"}
        prefill={prefill}
        bankLine={bankLine}
        correction={correction}
      />
    </div>
  );
}
