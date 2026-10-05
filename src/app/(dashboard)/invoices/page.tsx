import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { defaultUsdRate } from "@/lib/fx";
import { EPS, settlement, type Totals , vnTodayStart } from "@/lib/money";
import { InvoicesClient } from "@/components/invoices/invoices-client";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function InvoicesPage() {
  const session = await requirePageSession(); // second line behind the proxy
  const t = await getTranslations("invoices");
  const [usdRate, accounts, invoices, clients, vendors, projects, categories, entries] = await Promise.all([
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.invoice.findMany({
      include: {
        client: true, vendor: true, project: true, category: true, attachments: true,
        allocations: { include: { transaction: { include: { account: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, type: true } }),
    // Ledger entries that could settle an invoice: income/expense with money not
    // yet allocated — not a reversal, nor an entry a reversal cancelled.
    prisma.transaction.findMany({
      where: { type: { in: ["INCOME", "EXPENSE"] }, reversalOfId: null, reversedBy: { is: null } },
      orderBy: { date: "desc" },
      include: { account: true, allocations: true, _count: { select: { attachments: true } } },
    }),
  ]);

  const now = vnTodayStart(); // overdue from the day after the due date
  const rows = invoices.map((i) => {
    const s = settlement(i.amount, i.allocations.filter((a) => a.transaction.status !== "DRAFT"));
    const open = i.status === "OPEN" || i.status === "PARTIAL";
    return {
      id: i.id,
      number: i.number,
      direction: i.direction,
      party: i.direction === "PAYABLE" ? (i.vendor?.name ?? null) : (i.client?.name ?? null),
      clientId: i.clientId,
      vendorId: i.vendorId,
      projectId: i.projectId,
      categoryId: i.categoryId,
      projectName: i.project?.name ?? null,
      categoryName: i.category?.name ?? null,
      issueDate: iso(i.issueDate)!,
      dueDate: iso(i.dueDate)!,
      paidDate: iso(i.paidDate),
      currency: i.currency,
      amount: i.amount,
      notes: i.notes,
      status: i.status,
      overdue: open && i.dueDate < now,
      attachment: i.attachments[0] ? i.attachments[0].filePath : null,
      ...s,
      allocations: i.allocations.map((a) => ({
        id: a.id, kind: a.kind, amount: a.amount, draft: a.transaction.status === "DRAFT",
        date: iso(a.transaction.date)!,
        accountName: a.transaction.account?.name ?? "—",
        description: a.transaction.description,
      })),
    };
  });

  // Still-open (incl. part-paid) first, then paid, then void; earliest due first.
  const rank: Record<string, number> = { OPEN: 0, PARTIAL: 0, PAID: 1, VOID: 2 };
  rows.sort((a, b) => (rank[a.status] ?? 1) - (rank[b.status] ?? 1) || a.dueDate.localeCompare(b.dueDate));

  const candidates = entries
    .map((t) => ({
      id: t.id, type: t.type, date: iso(t.date)!, amount: t.amount, currency: t.currency,
      description: t.description, accountName: t.account?.name ?? "—",
      hasEvidence: t._count.attachments > 0,
      free: t.amount - t.allocations.reduce((s, a) => s + a.amount, 0),
      linkedTo: t.allocations.map((a) => a.invoiceId),
    }))
    .filter((c) => c.free > EPS);

  // Outstanding per currency (gross − payments − evidenced fees), never converted.
  const add = (t: Totals, c: string, v: number) => { t[c] = (t[c] ?? 0) + v; };
  const summary = { ar: {} as Totals, ap: {} as Totals, arOverdue: {} as Totals, apOverdue: {} as Totals };
  for (const r of rows) {
    if ((r.status !== "OPEN" && r.status !== "PARTIAL") || r.difference <= EPS) continue;
    const ar = r.direction === "RECEIVABLE";
    add(ar ? summary.ar : summary.ap, r.currency, r.difference);
    if (r.overdue) add(ar ? summary.arOverdue : summary.apOverdue, r.currency, r.difference);
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{t("page.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("page.subtitle")}</p>
      </div>
      <InvoicesClient
        isAdmin={session.user.role === "ADMIN"}
        invoices={rows}
        clients={clients}
        vendors={vendors}
        projects={projects}
        categories={categories}
        accounts={accounts}
        candidates={candidates}
        defaultUsdRate={usdRate}
        summary={summary}
      />
    </div>
  );
}
