import { prisma } from "@/lib/prisma";
import { ContactsClient } from "@/components/contacts/contacts-client";

const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;

export default async function ContactsPage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { projects: true, invoices: true } } },
  });
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: "asc" },
    include: { transactions: true },
  });

  const clientRows = clients.map((c) => ({
    id: c.id, name: c.name, email: c.email,
    projectCount: c._count.projects, invoiceCount: c._count.invoices,
  }));
  const vendorRows = vendors.map((v) => ({
    id: v.id, name: v.name, email: v.email,
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
