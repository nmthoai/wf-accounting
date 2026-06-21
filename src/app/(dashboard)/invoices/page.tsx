import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { InvoicesClient } from "@/components/invoices/invoices-client";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function InvoicesPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({ where: { id: session?.user?.id } });

  const invoices = await prisma.invoice.findMany({
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    include: { client: true, vendor: true, project: true, attachments: true },
  });
  const clients = await prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const projects = await prisma.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const now = new Date();
  const rows = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    direction: i.direction,
    party: i.direction === "PAYABLE" ? (i.vendor?.name ?? null) : (i.client?.name ?? null),
    projectName: i.project?.name ?? null,
    issueDate: iso(i.issueDate)!,
    dueDate: iso(i.dueDate)!,
    paidDate: iso(i.paidDate),
    currency: i.currency,
    amount: i.amount,
    amountVnd: i.amount * i.exchangeRate,
    status: i.status,
    overdue: i.status === "OPEN" && i.dueDate < now,
    attachment: i.attachments[0] ? i.attachments[0].filePath : null,
  }));

  const open = rows.filter((r) => r.status === "OPEN");
  const sum = (arr: typeof rows) => arr.reduce((a, r) => a + r.amountVnd, 0);
  const summary = {
    arOutstanding: sum(open.filter((r) => r.direction === "RECEIVABLE")),
    apOutstanding: sum(open.filter((r) => r.direction === "PAYABLE")),
    arOverdue: sum(open.filter((r) => r.direction === "RECEIVABLE" && r.overdue)),
    apOverdue: sum(open.filter((r) => r.direction === "PAYABLE" && r.overdue)),
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Invoices &amp; Bills</h1>
        <p className="text-muted-foreground mt-1">What clients owe you, and what you owe vendors</p>
      </div>
      <InvoicesClient
        invoices={rows}
        clients={clients}
        vendors={vendors}
        projects={projects}
        defaultUsdRate={user?.defaultUsdRate || 25400}
        summary={summary}
      />
    </div>
  );
}
