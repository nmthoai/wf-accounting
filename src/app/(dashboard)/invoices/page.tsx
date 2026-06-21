import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { InvoicesClient } from "@/components/invoices/invoices-client";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function InvoicesPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({ where: { id: session?.user?.id } });

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { client: true, project: true },
  });
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const projects = await prisma.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const now = new Date();
  const rows = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    clientName: i.client?.name ?? null,
    projectName: i.project?.name ?? null,
    issueDate: iso(i.issueDate)!,
    dueDate: iso(i.dueDate)!,
    paidDate: iso(i.paidDate),
    currency: i.currency,
    amount: i.amount,
    amountVnd: i.amount * i.exchangeRate,
    status: i.status,
    overdue: i.status === "SENT" && i.dueDate < now,
    notes: i.notes,
  }));

  const outstanding = rows.filter((r) => r.status === "SENT").reduce((a, r) => a + r.amountVnd, 0);
  const overdueTotal = rows.filter((r) => r.overdue).reduce((a, r) => a + r.amountVnd, 0);
  const draftCount = rows.filter((r) => r.status === "DRAFT").length;
  const paidThisCount = rows.filter((r) => r.status === "PAID").length;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Invoices</h1>
        <p className="text-muted-foreground mt-1">Track what you&apos;ve billed and what&apos;s still owed</p>
      </div>
      <InvoicesClient
        invoices={rows}
        clients={clients}
        projects={projects}
        defaultUsdRate={user?.defaultUsdRate || 25400}
        summary={{ outstanding, overdueTotal, draftCount, paidThisCount }}
      />
    </div>
  );
}
