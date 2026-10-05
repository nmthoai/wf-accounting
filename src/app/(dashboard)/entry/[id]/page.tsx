import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { EntryForm } from "../entry-form";
import { redirect } from "next/navigation";
import { defaultUsdRate } from "@/lib/fx";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntryStatus } from "@/components/ledger/entry-status";
import { fmtMoney } from "@/lib/money";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, usdRate, accounts, categories, projects, vendors, transaction, history, allProjects] = await Promise.all([
    requirePageSession(),
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.transaction.findUnique({ where: { id }, include: { attachments: true, reversalOf: true, reversedBy: true, deductedFee: { select: { amount: true } } } }),
    prisma.changeLog.findMany({ where: { entity: "Transaction", entityId: id }, orderBy: { createdAt: "desc" } }),
    prisma.project.findMany({ select: { id: true, name: true } }),
  ]);

  if (!transaction) {
    redirect("/ledger");
  }
  // Transfers, capital and loans are edited on the Accounts page.
  if (transaction.type !== "INCOME" && transaction.type !== "EXPENSE") {
    redirect("/accounts");
  }
  const correctionOf = transaction.correctionOfId
    ? await prisma.transaction.findUnique({ where: { id: transaction.correctionOfId } })
    : null;
  const t = await getTranslations("ledger");
  const tc = await getTranslations("common");

  const ref = (t: { id: string; date: Date; amount: number; currency: string; description: string | null } | null) =>
    t ? { id: t.id, label: `${t.date.toISOString().slice(0, 10)} · ${fmtMoney(Math.abs(t.amount), t.currency)}${t.description ? ` · ${t.description}` : ""}` } : null;

  // History values are stored raw; show names and labels.
  const names: Record<string, Map<string, string>> = {
    accountId: new Map(accounts.map((a) => [a.id, a.name])),
    categoryId: new Map(categories.map((c) => [c.id, c.name])),
    projectId: new Map(allProjects.map((p) => [p.id, p.name])),
    vendorId: new Map(vendors.map((v) => [v.id, v.name])),
  };
  // Where each coded field's labels live in the common messages.
  const labels: Record<string, string> = {
    status: "status", type: "type", docStatus: "review.doc", purposeStatus: "review.purpose", citStatus: "review.cit", vatStatus: "review.vat",
  };
  const label = (key: string, raw: string) => (tc.has(key) ? tc(key) : raw);
  const show = (field: string | null, v: string | null) =>
    v === null ? "—" : field && names[field] ? names[field].get(v) ?? v : field && labels[field] ? label(`${labels[field]}.${v}`, v) : v;
  const action = (a: string) => (t.has(`history.action.${a}`) ? t(`history.action.${a}`) : a);
  const fieldName = (f: string) => (t.has(`history.field.${f}`) ? t(`history.field.${f}`) : f);

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{transaction.status === "POSTED" ? t("edit.titlePosted") : t("edit.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {transaction.createdBy ? t("edit.enteredBy", { name: transaction.createdBy }) : t("edit.subtitle")}
        </p>
      </div>

      <EntryStatus
        id={transaction.id}
        status={transaction.status}
        isAdmin={session?.user?.role === "ADMIN"}
        reversalOf={ref(transaction.reversalOf)}
        reversedBy={ref(transaction.reversedBy)}
        correctionOf={ref(correctionOf)}
        withFee={!!transaction.deductedFee || !!transaction.deductedFromId}
      />

      <EntryForm
        categories={categories}
        projects={projects}
        vendors={vendors}
        accounts={accounts}
        defaultUsdRate={usdRate}
        isAdmin={session?.user?.role === "ADMIN"}
        initialData={transaction}
        locked={transaction.status === "POSTED"}
      />

      <Card>
        <CardHeader><CardTitle className="text-base">{t("history.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="text-sm border-b last:border-0 pb-2">
              <div className="flex justify-between gap-3">
                <span className="font-medium">
                  {h.field && h.action !== "MATCH" && h.action !== "UNMATCH"
                    ? t("history.actionField", { action: action(h.action), field: fieldName(h.field) })
                    : action(h.action)}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{h.user ? ` · ${h.user}` : ""}
                </span>
              </div>
              {(h.action === "UPDATE" || h.action === "REVALUE") && (
                <p className="text-xs text-muted-foreground">{show(h.field, h.oldValue)} → <span className="text-foreground">{show(h.field, h.newValue)}</span></p>
              )}
              {(h.action === "CREATE" || h.action === "DELETE" || h.action === "LINK" || h.action === "UNLINK") && (
                <p className="text-xs text-muted-foreground">{h.newValue ?? h.oldValue}</p>
              )}
              {h.reason && <p className="text-xs">{t("history.reason", { reason: h.reason })}</p>}
            </div>
          ))}
          {history.length === 0 && <p className="text-sm text-muted-foreground">{t("history.empty")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
