import { prisma } from "@/lib/prisma";
import { ProjectsClient } from "@/components/projects/projects-client";

const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;

export default async function ProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { client: true, transactions: true },
  });
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const projectRows = projects.map((p) => {
    const income = p.transactions.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
    const expense = p.transactions.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
    return {
      id: p.id, name: p.name, status: p.status, clientId: p.clientId, clientName: p.client?.name ?? null,
      income, expense, net: income - expense, txnCount: p.transactions.length,
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
