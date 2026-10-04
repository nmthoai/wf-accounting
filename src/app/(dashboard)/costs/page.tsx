import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import type { Prisma } from "@prisma/client";
import { CostsClient, type CostRow } from "@/components/costs/costs-client";
import type { Totals } from "@/lib/money";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const VIEWS: Record<string, Prisma.CostItemWhereInput | undefined> = {
  pending: { status: "PENDING" },
  converted: { status: "CONVERTED" },
  dismissed: { status: "DISMISSED" },
  all: undefined,
};

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = sp.view && sp.view in VIEWS ? sp.view : "pending";
  const session = await auth();
  const [items, all] = await Promise.all([
    prisma.costItem.findMany({
      where: VIEWS[view],
      orderBy: [{ receiptDate: "desc" }, { provider: "asc" }],
      include: { attachments: true, transaction: { select: { id: true, status: true } } },
    }),
    prisma.costItem.findMany({ select: { status: true, amount: true, currency: true, reimbursement: true, renewalDate: true } }),
  ]);

  // Per currency, never converted.
  const add = (t: Totals, c: string, v: number) => { t[c] = (t[c] ?? 0) + v; };
  const pending: Totals = {}, owed: Totals = {};
  const now = +new Date();
  const soon = now + 30 * 86_400_000;
  let renewals = 0;
  const counts: Record<string, number> = { pending: 0, converted: 0, dismissed: 0, all: all.length };
  for (const i of all) {
    counts[i.status.toLowerCase()] = (counts[i.status.toLowerCase()] ?? 0) + 1;
    if (i.status === "PENDING") add(pending, i.currency, i.amount);
    if (i.reimbursement === "OWED") add(owed, i.currency, i.amount);
    if (i.renewalDate && +i.renewalDate >= now - 86_400_000 && +i.renewalDate <= soon) renewals++;
  }

  const rows: CostRow[] = items.map((i) => ({
    id: i.id, ref: i.ref, provider: i.provider, receiptDate: iso(i.receiptDate)!, amount: i.amount, currency: i.currency,
    servicePeriodFrom: iso(i.servicePeriodFrom), servicePeriodTo: iso(i.servicePeriodTo),
    receiptNumber: i.receiptNumber, billingEntity: i.billingEntity, payer: i.payer, renewalDate: iso(i.renewalDate),
    reimbursement: i.reimbursement, docStatus: i.docStatus, status: i.status, notes: i.notes, reviewNote: i.reviewNote,
    transactionId: i.transaction?.id ?? null,
    attachments: i.attachments.map((a) => ({ id: a.id, fileName: a.fileName, filePath: a.filePath })),
  }));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Cost register</h1>
        <p className="text-muted-foreground mt-1">Cloud services and costs the owner paid — pending until reviewed, then into the ledger once</p>
      </div>
      <CostsClient
        isAdmin={session?.user?.role === "ADMIN"}
        view={view}
        counts={counts}
        summary={{ pending, owed, renewals }}
        items={rows}
      />
    </div>
  );
}
