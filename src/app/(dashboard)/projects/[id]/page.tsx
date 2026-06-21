import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { ProjectOutstanding } from "@/components/projects/project-outstanding";

const toVnd = (t: { amount: number; exchangeRate: number }) => t.amount * t.exchangeRate;
const vnd = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, openInvoices] = await Promise.all([
    prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        transactions: { orderBy: { date: "desc" }, include: { category: true, vendor: true, invoice: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { projectId: id, status: "OPEN" },
      orderBy: { dueDate: "asc" },
      include: { client: true, vendor: true },
    }),
  ]);
  if (!project) redirect("/projects");
  const now = new Date();
  const outstanding = openInvoices.map((i) => ({
    id: i.id,
    number: i.number,
    direction: i.direction,
    party: i.direction === "PAYABLE" ? (i.vendor?.name ?? null) : (i.client?.name ?? null),
    amount: i.amount,
    currency: i.currency,
    amountVnd: i.amount * i.exchangeRate,
    dueDate: iso(i.dueDate),
    overdue: i.dueDate < now,
  }));

  const txns = project.transactions;
  const income = txns.filter((t) => t.type === "INCOME").reduce((a, t) => a + toVnd(t), 0);
  const expense = txns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + toVnd(t), 0);
  const net = income - expense;

  // Cost breakdown by category (expenses only)
  const byCategory = new Map<string, number>();
  for (const t of txns.filter((x) => x.type === "EXPENSE")) {
    const key = t.category?.name || "Uncategorized";
    byCategory.set(key, (byCategory.get(key) || 0) + toVnd(t));
  }
  const costRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>
        <h1 className="text-3xl font-serif font-bold text-primary">{project.name}</h1>
        <p className="text-muted-foreground mt-1">{project.client?.name || "No client"} · {project.status}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Income</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{vnd(income)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Expenses</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{vnd(expense)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Net Profit</CardTitle></CardHeader>
          <CardContent><div className={`text-2xl font-bold ${net >= 0 ? "text-primary" : "text-red-600"}`}>{vnd(net)}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Outstanding (unpaid)</CardTitle>
          <CardDescription>Invoices &amp; bills on this project awaiting payment.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectOutstanding items={outstanding} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Cost breakdown by category</CardTitle></CardHeader>
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
          {costRows.length === 0 && <p className="text-sm text-muted-foreground">No costs tagged to this project yet.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount (VND)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {txns.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">{t.date.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.type === "INCOME" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                  </TableCell>
                  <TableCell>{t.category?.name || "—"}</TableCell>
                  <TableCell>{t.vendor?.name || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={t.description || ""}>{t.description || "—"}</TableCell>
                  <TableCell className={`text-right font-semibold ${t.type === "INCOME" ? "text-green-600" : ""}`}>
                    {t.type === "INCOME" ? "+" : "−"}{new Intl.NumberFormat("vi-VN").format(Math.round(toVnd(t)))}
                  </TableCell>
                </TableRow>
              ))}
              {txns.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No transactions tagged to this project yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
