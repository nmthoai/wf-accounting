import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { ProjectOutstanding } from "@/components/projects/project-outstanding";
import { EditProjectDialog } from "@/components/projects/edit-project-dialog";
import { ProjectDocuments } from "@/components/projects/project-documents";
import { toVnd, settlement, BOOKED, BOOKED_ALLOCATIONS , vnTodayStart , isMoneyIn } from "@/lib/money";
import { defaultUsdRate } from "@/lib/fx";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate as formatDate } from "@/lib/format";

const vnd = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (d: Date | null, locale: string) => (d ? formatDate(d, locale, { day: "2-digit", month: "short", year: "numeric" }) : null);

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageSession(); // second line behind the proxy
  const t = await getTranslations("projects");
  const locale = await getLocale();
  const { id } = await params;
  const [project, openInvoices, clients, accounts, usdRate] = await Promise.all([
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

  const txns = project.transactions;
  const income = txns.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
  const expense = txns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const net = income - expense;

  // Cost breakdown by category (expenses only)
  const byCategory = new Map<string, number>();
  const uncategorized = t("detail.uncategorized");
  for (const t of txns.filter((x) => x.type === "EXPENSE")) {
    const key = t.category?.name || uncategorized;
    byCategory.set(key, (byCategory.get(key) || 0) + toVnd(t));
  }
  const costRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const typeBadge = (type: string) => (t.has(`detail.typeBadge.${type}`) ? t(`detail.typeBadge.${type}`) : type);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/projects" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
            <ArrowLeft className="h-4 w-4" /> {t("page.title")}
          </Link>
          <h1 className="text-3xl font-serif font-bold text-primary">{project.name}</h1>
          <p className="text-muted-foreground mt-1">
            {project.client?.name || t("noClient")} · {t.has(`status.${project.status}`) ? t(`status.${project.status}`) : project.status}
            {dateRange && <> · {dateRange}</>}
          </p>
          {project.description && <p className="text-sm text-muted-foreground mt-2 max-w-2xl whitespace-pre-wrap">{project.description}</p>}
        </div>
        <EditProjectDialog
          project={{
            id: project.id, name: project.name, clientId: project.clientId, status: project.status,
            description: project.description, startDate: project.startDate ? iso(project.startDate) : null,
            endDate: project.endDate ? iso(project.endDate) : null,
          }}
          clients={clients}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("detail.income")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{vnd(income)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("detail.expenses")}</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{vnd(expense)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("detail.netProfit")}</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${net >= 0 ? "text-primary" : "text-red-600"}`}>{vnd(net)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.outstandingTitle")}</CardTitle>
          <CardDescription>{t("detail.outstandingDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectOutstanding items={outstanding} accounts={accounts} defaultUsdRate={usdRate} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.documentsTitle")}</CardTitle>
          <CardDescription>{t("detail.documentsDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectDocuments projectId={project.id} documents={documents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("detail.costBreakdown")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {costRows.map(([name, amt]) => (
            <div key={name} className="flex items-center justify-between text-sm">
              <span>{name}</span>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{expense > 0 ? Math.round((amt / expense) * 100) : 0}%</span>
                <span className="font-semibold text-red-600">{vnd(amt)}</span>
              </div>
            </div>
          ))}
          {costRows.length === 0 && <p className="text-sm text-muted-foreground">{t("detail.noCosts")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("detail.transactions")}</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>{t("detail.table.date")}</TableHead>
                <TableHead>{t("detail.table.type")}</TableHead>
                <TableHead>{t("detail.table.category")}</TableHead>
                <TableHead>{t("detail.table.vendor")}</TableHead>
                <TableHead>{t("detail.table.description")}</TableHead>
                <TableHead className="text-right">{t("detail.table.amountVnd")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(t.date, locale)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.type === "INCOME" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{typeBadge(t.type)}</span>
                  </TableCell>
                  <TableCell>{t.category?.name || "—"}</TableCell>
                  <TableCell>{t.vendor?.name || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={t.description || ""}>{t.description || "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${t.type === "INCOME" ? "text-green-600" : ""}`}>
                    {isMoneyIn(t) ? "+" : "−"}{new Intl.NumberFormat("vi-VN").format(Math.round(Math.abs(toVnd(t))))}
                  </TableCell>
                </TableRow>
              ))}
              {txns.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("detail.noTransactions")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
