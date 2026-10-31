import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import { ProjectOutstanding } from "@/components/projects/project-outstanding";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { ProjectDocuments } from "@/components/projects/project-documents";
import { toVnd, valueIn, settlement, BOOKED, BOOKED_ALLOCATIONS , vnTodayStart , isMoneyIn, fmtMoney } from "@/lib/money";
import { defaultUsdRate } from "@/lib/fx";
import { getView } from "@/lib/view";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate as formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { ViewNote } from "@/components/wf/view-note";
import { Bar, Chip, ENTRY_TYPE_TONE, PanelHead, PROJECT_STATUS_TONE, Stat, StatStrip } from "@/components/wf/ledger-ui";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (d: Date | null, locale: string) => (d ? formatDate(d, locale, { day: "2-digit", month: "short", year: "numeric" }) : null);

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePageSession(); // second line behind the proxy
  const t = await getTranslations("projects");
  const locale = await getLocale();
  const { id } = await params;
  const [project, openInvoices, clients, accounts, usdRate, feeCategories, view] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        transactions: { where: BOOKED, orderBy: { date: "desc" }, include: { category: true, vendor: true, invoice: true } }, // drafts wait for review
        attachments: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.invoice.findMany({
      where: { projectId: id, status: { in: ["OPEN", "PARTIAL"] } },
      orderBy: { dueDate: "asc" },
      include: { client: true, vendor: true, allocations: BOOKED_ALLOCATIONS },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    defaultUsdRate(),
    prisma.category.findMany({ where: { type: "EXPENSE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getView(session.user.id),
  ]);
  if (!project) redirect("/projects");

  const documents = project.attachments.map((a) => ({ id: a.id, fileName: a.fileName, filePath: a.filePath, createdAt: iso(a.createdAt) }));
  const dateRange = [fmtDate(project.startDate, locale), fmtDate(project.endDate, locale)].filter(Boolean).join(" → ");
  const now = vnTodayStart(); // overdue from the day after the due date
  const outstanding = openInvoices.map((i) => ({
    id: i.id,
    number: i.number,
    direction: i.direction,
    party: i.direction === "PAYABLE" ? (i.vendor?.name ?? null) : (i.client?.name ?? null),
    status: i.status,
    amount: i.amount,
    difference: settlement(i.amount, i.allocations).difference,
    currency: i.currency,
    dueDate: iso(i.dueDate)!,
    overdue: i.dueDate < now,
  }));

  // The summary (profit, cost breakdown) is in the user's summary currency;
  // the entry log below keeps its own figures.
  const money = (n: number) => fmtMoney(n, view.currency);
  const txns = project.transactions;
  const income = txns.filter((t) => t.type === "INCOME").reduce((a, t) => a + valueIn(view, t), 0);
  const expense = txns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + valueIn(view, t), 0);
  const net = income - expense;

  // Cost breakdown by category (expenses only)
  const byCategory = new Map<string, number>();
  const uncategorized = t("detail.uncategorized");
  for (const t of txns.filter((x) => x.type === "EXPENSE")) {
    const key = t.category?.name || uncategorized;
    byCategory.set(key, (byCategory.get(key) || 0) + valueIn(view, t));
  }
  const costRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const typeBadge = (type: string) => (t.has(`detail.typeBadge.${type}`) ? t(`detail.typeBadge.${type}`) : type);
  const status = project.status;

  return (
    <div>
      <Link href="/projects" className="wf-label mb-5 inline-flex items-center gap-2 transition-colors duration-150 hover:text-primary">
        <ArrowLeft className="size-3.5" aria-hidden="true" />{t("page.title")}
      </Link>
      <PageHeader
        section="projects"
        title={project.name}
        description={project.description && <span className="whitespace-pre-wrap">{project.description}</span>}
        meta={
          <>
            <Chip tone={PROJECT_STATUS_TONE[status] ?? "neutral"} mono dot={status === "ACTIVE"}>
              {t.has(`status.${status}`) ? t(`status.${status}`) : status}
            </Chip>
            <Chip>{project.client?.name || t("noClient")}</Chip>
            {dateRange && <span className="wf-num text-[13.5px] text-muted-foreground">{dateRange}</span>}
            <ViewNote view={view} />
          </>
        }
        actions={
          <EditProjectDialog
            project={{
              id: project.id, name: project.name, clientId: project.clientId, status: project.status,
              description: project.description, startDate: project.startDate ? iso(project.startDate) : null,
              endDate: project.endDate ? iso(project.endDate) : null,
            }}
            clients={clients}
          />
        }
      />

      <StatStrip className="lg:grid-cols-3">
        <Stat label={t("detail.income")} icon={ArrowDownLeft} tone="pos">{money(income)}</Stat>
        <Stat label={t("detail.expenses")} icon={ArrowUpRight} tone="neg">{money(expense)}</Stat>
        <Stat label={t("detail.netProfit")} icon={TrendingUp} tone={net >= 0 ? "info" : "neg"} emphasis>{money(net)}</Stat>
      </StatStrip>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <PanelHead title={t("detail.outstandingTitle")} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("detail.outstandingDescription")}</p>
          <ProjectOutstanding items={outstanding} accounts={accounts} defaultUsdRate={usdRate} feeCategories={feeCategories} />
        </Card>

        <Card className="lg:col-span-6">
          <PanelHead title={t("detail.costBreakdown")} />
          <ul className="wf-rows">
            {costRows.map(([name, amt]) => {
              const pct = expense > 0 ? Math.round((amt / expense) * 100) : 0;
              return (
                <li key={name} className="block">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-foreground">{name}</span>
                    <span className="flex shrink-0 items-baseline gap-3">
                      <span className="wf-num text-[13.5px] text-muted-foreground">{pct}%</span>
                      <span className="wf-figure">{money(amt)}</span>
                    </span>
                  </div>
                  <Bar pct={pct} tone="neg" />
                </li>
              );
            })}
            {costRows.length === 0 && <li className="text-muted-foreground">{t("detail.noCosts")}</li>}
          </ul>
        </Card>

        <Card className="lg:col-span-12">
          <PanelHead title={t("detail.documentsTitle")} count={documents.length} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("detail.documentsDescription")}</p>
          <ProjectDocuments projectId={project.id} documents={documents} />
        </Card>

        <Card className="lg:col-span-12">
          <PanelHead title={t("detail.transactions")} count={txns.length} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("detail.table.date")}</TableHead>
                <TableHead>{t("detail.table.type")}</TableHead>
                <TableHead>{t("detail.table.category")}</TableHead>
                <TableHead>{t("detail.table.vendor")}</TableHead>
                <TableHead>{t("detail.table.description")}</TableHead>
                <TableHead className="text-right">{t("detail.table.amountVnd")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => {
                const moneyIn = isMoneyIn(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="wf-num text-text-secondary">{formatDate(t.date, locale)}</TableCell>
                    <TableCell><Chip tone={ENTRY_TYPE_TONE[t.type] ?? "neutral"} mono>{typeBadge(t.type)}</Chip></TableCell>
                    <TableCell className="text-foreground">{t.category?.name || "—"}</TableCell>
                    <TableCell className="text-text-secondary">{t.vendor?.name || "—"}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-text-secondary" title={t.description || ""}>{t.description || "—"}</TableCell>
                    <TableCell className={cn("text-right font-semibold", moneyIn && "text-pos")}>
                      {moneyIn ? "+" : "−"}{new Intl.NumberFormat("vi-VN").format(Math.round(Math.abs(toVnd(t))))}
                    </TableCell>
                  </TableRow>
                );
              })}
              {txns.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t("detail.noTransactions")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
