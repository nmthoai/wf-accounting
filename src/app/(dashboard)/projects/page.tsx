import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "@/components/projects/projects-client";
import { toVnd, settlement, totalsList, fmtMoney, type Totals } from "@/lib/money";

export default async function ProjectsPage() {
  const [projects, clients, openInvoices] = await Promise.all([
    prisma.project.findMany({ orderBy: { createdAt: "desc" }, include: { client: true, transactions: true, _count: { select: { attachments: true } } } }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.invoice.findMany({ where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { projectId: true, amount: true, currency: true, allocations: true } }),
  ]);

  const projectRows = projects.map((p) => {
    const income = p.transactions.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
    const expense = p.transactions.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
    const open = openInvoices.filter((i) => i.projectId === p.id);
    // Still open per currency (never converted).
    const openTotals: Totals = {};
    for (const i of open) openTotals[i.currency] = (openTotals[i.currency] ?? 0) + settlement(i.amount, i.allocations).difference;
    return {
      id: p.id, name: p.name, status: p.status, clientId: p.clientId, clientName: p.client?.name ?? null,
      income, expense, net: income - expense, txnCount: p.transactions.length,
      openCount: open.length,
      openLabel: totalsList(openTotals).map(([c, v]) => fmtMoney(v, c)).join(" · "),
      attachmentCount: p._count.attachments,
    };
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Projects</h1>
        <p className="text-muted-foreground mt-1">Per-project profitability — click in for the cost breakdown</p>
      </div>
      <ProjectsClient projects={projectRows} clients={clients} />
    </div>
  );
}
