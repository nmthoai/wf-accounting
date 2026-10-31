import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { EntryForm } from "../entry-form";
import { redirect } from "next/navigation";
import { defaultUsdRate } from "@/lib/fx";
import { requirePageSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { EntryStatus } from "@/components/ledger/entry-status";
import { fmtMoney, fmtVnd } from "@/lib/money";
import { APP_REASONS, parseSnapshot } from "@/lib/history-format";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, ENTRY_STATUS_TONE, ENTRY_TYPE_TONE, PanelHead } from "@/components/wf/ledger-ui";

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
    rateSource: "rateSource",
  };
  const label = (key: string, raw: string) => (tc.has(key) ? tc(key) : raw);
  const num = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
  const show = (field: string | null, v: string | null) => {
    if (v === null) return "—";
    if (field && names[field]) return names[field].get(v) ?? v;
    if (field && labels[field]) return label(`${labels[field]}.${v}`, v);
    // Numbers grouped as on the rest of the page.
    const n = Number(v);
    if (field === "vndAmount" && Number.isFinite(n)) return fmtVnd(n);
    if ((field === "amount" || field === "exchangeRate" || field === "vatAmount") && Number.isFinite(n)) return num.format(n);
    return v;
  };
  // A created or deleted entry's snapshot, in the reader's language.
  const showSnapshot = (v: string | null) => {
    const s = v === null ? null : parseSnapshot(v);
    return s ? [label(`type.${s.type}`, s.type), s.date, fmtMoney(s.amount, s.currency), s.description].filter(Boolean).join(" · ") : v;
  };
  const reason = (r: string) => (APP_REASONS[r] ? t(`history.reasons.${APP_REASONS[r]}`) : r);
  // Why the owner sent it back: the latest rejection (history is newest first).
  const rejected = transaction.status === "REJECTED" ? history.find((h) => h.action === "REJECT") : undefined;
  const rejection = rejected?.reason ? { reason: rejected.reason, by: rejected.user } : null;
  const action = (a: string) => (t.has(`history.action.${a}`) ? t(`history.action.${a}`) : a);
  const fieldName = (f: string) => (t.has(`history.field.${f}`) ? t(`history.field.${f}`) : f);

  const status = label(`status.${transaction.status}`, transaction.status);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        section="ledger"
        title={transaction.status === "POSTED" ? t("edit.titlePosted") : t("edit.title")}
        description={transaction.createdBy ? t("edit.enteredBy", { name: transaction.createdBy }) : t("edit.subtitle")}
        meta={
          <>
            <Chip tone={ENTRY_TYPE_TONE[transaction.type] ?? "neutral"}>{label(`type.${transaction.type}`, transaction.type)}</Chip>
            <Chip tone={ENTRY_STATUS_TONE[transaction.status] ?? "neutral"} mono dot>
              {transaction.reversalOfId ? t("row.reversal", { status }) : transaction.reversedBy ? t("row.reversed", { status }) : status}
            </Chip>
          </>
        }
      />

      <div className="grid gap-6">
        <EntryStatus
          id={transaction.id}
          status={transaction.status}
          isAdmin={session?.user?.role === "ADMIN"}
          reversalOf={ref(transaction.reversalOf)}
          reversedBy={ref(transaction.reversedBy)}
          correctionOf={ref(correctionOf)}
          withFee={!!transaction.deductedFee || !!transaction.deductedFromId}
          rejection={rejection}
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
          <PanelHead title={t("history.title")} count={history.length} />
          <ul className="wf-rows">
            {history.map((h) => (
              <li key={h.id} className="flex-wrap items-start">
                <div className="min-w-48 flex-1">
                  <p className="font-semibold text-foreground">
                    {h.field && h.action !== "MATCH" && h.action !== "UNMATCH"
                      ? t("history.actionField", { action: action(h.action), field: fieldName(h.field) })
                      : action(h.action)}
                  </p>
                  {(h.action === "UPDATE" || h.action === "REVALUE") && (
                    <p className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{show(h.field, h.oldValue)} → <span className="text-foreground">{show(h.field, h.newValue)}</span></p>
                  )}
                  {(h.action === "CREATE" || h.action === "DELETE" || h.action === "LINK" || h.action === "UNLINK") && (
                    <p className="text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{showSnapshot(h.newValue ?? h.oldValue)}</p>
                  )}
                  {h.reason && <p className="text-[12px] text-text-secondary">{t("history.reason", { reason: reason(h.reason) })}</p>}
                </div>
                <span className="wf-num shrink-0 text-[12px] text-muted-foreground">
                  {h.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC{h.user ? ` · ${h.user}` : ""}
                </span>
              </li>
            ))}
            {history.length === 0 && <li className="text-muted-foreground">{t("history.empty")}</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
