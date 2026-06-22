import { prisma } from "@/lib/prisma";
import { ContactsClient } from "@/components/contacts/contacts-client";

const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;

export default async function ContactsPage() {
  const [clients, vendors, projects, incomeTx] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { projects: true, invoices: true } } } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, include: { transactions: true } }),
    prisma.project.findMany({ select: { id: true, clientId: true } }),
    prisma.transaction.findMany({ where: { type: "INCOME" }, select: { projectId: true, amount: true, exchangeRate: true } }),
  ]);

  // Revenue received per client = income transactions on that client's projects.
  const projClient = new Map(projects.map((p) => [p.id, p.clientId]));
  const revByClient = new Map<string, number>();
  for (const t of incomeTx) {
    const cid = t.projectId ? projClient.get(t.projectId) : null;
    if (!cid) continue;
    revByClient.set(cid, (revByClient.get(cid) ?? 0) + t.amount * t.exchangeRate);
  }

  const clientRows = clients.map((c) => ({
    id: c.id, name: c.name, email: c.email, phone: c.phone,
    projectCount: c._count.projects, invoiceCount: c._count.invoices,
    revenue: revByClient.get(c.id) ?? 0,
  }));
  const vendorRows = vendors.map((v) => ({
    id: v.id, name: v.name, email: v.email, phone: v.phone,
    spend: v.transactions.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0),
    txnCount: v.transactions.length,
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Clients &amp; Vendors</h1>
        <p className="text-muted-foreground mt-1">The parties you invoice and pay</p>
      </div>
      <ContactsClient clients={clientRows} vendors={vendorRows} />
    </div>
  );
}
