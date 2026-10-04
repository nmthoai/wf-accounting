import { prisma } from "@/lib/prisma";
import { EntryForm } from "./entry-form";
import { defaultUsdRate } from "@/lib/fx";
import { auth } from "@/auth";
import { accountDelta, fmtMoney } from "@/lib/money";
import { CostDuplicates, type Lookalike } from "@/components/costs/cost-duplicates";

const DAY = 86_400_000;

export default async function NewEntryPage({ searchParams }: { searchParams: Promise<{ bankLine?: string; reenter?: string; costItem?: string }> }) {
  const { bankLine: lineId, reenter, costItem: itemId } = await searchParams;
  const [session, usdRate, accounts, categories, projects, vendors, line, reversed, item] = await Promise.all([
    auth(),
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    lineId ? prisma.bankLine.findUnique({ where: { id: lineId }, include: { account: true, entries: true } }) : null,
    reenter ? prisma.transaction.findUnique({ where: { id: reenter }, include: { reversedBy: true } }) : null,
    itemId ? prisma.costItem.findUnique({ where: { id: itemId } }) : null,
  ]);

  // Started from a bank statement line: the part of it not yet in the ledger.
  let prefill;
  let bankLine;
  let correction;
  let costItem;
  let lookalikes: Lookalike[] = [];
  // From the cost register: the receipt's details, paid from the payer's account.
  if (item?.status === "PENDING") {
    const active = accounts.filter((a) => a.isActive);
    const account = item.payer === "OWNER"
      ? active.find((a) => a.type === "OWNER" && a.currency === "VND")
      : item.payer === "COMPANY"
        ? active.find((a) => a.type === "BANK" && a.currency === "VND") // cloud charges go through the company's VND card
        : undefined;
    const period = item.servicePeriodFrom && item.servicePeriodTo
      ? ` — ${item.servicePeriodFrom.toISOString().slice(0, 10)} to ${item.servicePeriodTo.toISOString().slice(0, 10)}` : "";
    prefill = {
      type: "EXPENSE", accountId: account?.id ?? "", date: item.receiptDate, amount: item.amount, currency: item.currency,
      rateSource: item.currency === "VND" ? null : "BANK",
      description: `${item.provider}${period}`, invoiceNumber: item.receiptNumber,
      vendorId: vendors.find((v) => v.name.toLowerCase() === item.provider.toLowerCase())?.id ?? "",
      docStatus: item.docStatus, reviewNote: item.reviewNote,
    };
    costItem = { id: item.id, label: `${item.provider} · ${item.receiptDate.toISOString().slice(0, 10)} · ${fmtMoney(item.amount, item.currency)}` };
    // Expenses within ten days that match the amount, or name the provider.
    const word = item.provider.toLowerCase().split(/[\s/]+/)[0];
    const nearby = await prisma.transaction.findMany({
      where: {
        type: "EXPENSE", reversalOfId: null, reversedBy: { is: null }, costItem: { is: null },
        date: { gte: new Date(+item.receiptDate - 10 * DAY), lte: new Date(+item.receiptDate + 10 * DAY) },
      },
      include: { vendor: true },
      orderBy: { date: "asc" },
    });
    lookalikes = nearby
      .filter((t) => (t.currency === item.currency && Math.abs(t.amount - item.amount) <= Math.max(0.01, item.amount * 0.01))
        || `${t.description ?? ""} ${t.vendor?.name ?? ""}`.toLowerCase().includes(word))
      .map((t) => ({ id: t.id, date: t.date.toISOString().slice(0, 10), label: t.description ?? "Expense", amount: fmtMoney(t.amount, t.currency) }));
  }
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

      {costItem && <CostDuplicates itemId={costItem.id} lookalikes={lookalikes} />}

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
        costItem={costItem}
      />
    </div>
  );
}
