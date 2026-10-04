import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import { TYPE_LABEL, RATE_SOURCE_LABEL, isPnl, toVnd } from "@/lib/money";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const vnd = (amount: number, rate: number) => Math.round(amount * rate);

// Build a worksheet from rows, with simple column widths derived from headers.
function sheet(rows: Record<string, unknown>[], headers: string[]) {
  const ws = xlsx.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
  return ws;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const type = url.searchParams.get("type"); // "entries" | "invoices"
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return new Response("Invalid date range", { status: 400 });
  if (type !== "entries" && type !== "invoices") return new Response("Invalid type", { status: 400 });

  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1); // make `to` inclusive

  const wb = xlsx.utils.book_new();
  let filename = "";

  if (type === "entries") {
    const txns = await prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      include: { category: true, project: true, vendor: true, account: true, _count: { select: { attachments: true } } },
    });

    const headers = ["Date", "Type", "Account", "Description", "Category", "Project", "Vendor", "Invoice #", "Currency", "Amount", "Rate", "Rate source", "Amount (VND)", "Attachments"];
    const rows: Record<string, unknown>[] = txns.map((t) => ({
      "Date": iso(t.date),
      "Type": TYPE_LABEL[t.type] ?? t.type,
      "Account": t.account?.name ?? "",
      "Description": t.description ?? "",
      "Category": isPnl(t.type) ? t.category?.name ?? "Uncategorized" : "",
      "Project": t.project?.name ?? "",
      "Vendor": t.vendor?.name ?? "",
      "Invoice #": t.invoiceNumber ?? "",
      "Currency": t.currency,
      "Amount": t.amount,
      "Rate": t.exchangeRate,
      "Rate source": t.rateSource ? RATE_SOURCE_LABEL[t.rateSource] ?? t.rateSource : "",
      "Amount (VND)": Math.round(toVnd(t)),
      "Attachments": t._count.attachments,
    }));

    // Totals are profit & loss only — transfers, capital and loans are listed but not summed.
    const totalIncome = txns.filter((t) => t.type === "INCOME").reduce((a, t) => a + Math.round(toVnd(t)), 0);
    const totalExpense = txns.filter((t) => t.type === "EXPENSE").reduce((a, t) => a + Math.round(toVnd(t)), 0);
    const blank = Object.fromEntries(headers.map((h) => [h, ""]));
    rows.push({ ...blank });
    rows.push({ ...blank, "Type": "TOTAL Income", "Amount (VND)": totalIncome });
    rows.push({ ...blank, "Type": "TOTAL Expense", "Amount (VND)": totalExpense });
    rows.push({ ...blank, "Type": "NET", "Amount (VND)": totalIncome - totalExpense });

    xlsx.utils.book_append_sheet(wb, sheet(rows, headers), "Ledger Entries");
    filename = `wf-ledger_${from}_${to}.xlsx`;
  } else {
    const invoices = await prisma.invoice.findMany({
      where: { issueDate: { gte: start, lt: end } },
      orderBy: { issueDate: "asc" },
      include: { client: true, vendor: true, project: true, category: true },
    });

    const headers = ["Issue Date", "Due Date", "Direction", "Number", "Party", "Project", "Category", "Currency", "Amount", "Rate", "Amount (VND)", "Status", "Paid Date", "Notes"];
    const rows = invoices.map((i) => ({
      "Issue Date": iso(i.issueDate),
      "Due Date": iso(i.dueDate),
      "Direction": i.direction === "RECEIVABLE" ? "Receivable (AR)" : "Payable (AP)",
      "Number": i.number ?? "",
      "Party": i.direction === "RECEIVABLE" ? (i.client?.name ?? "") : (i.vendor?.name ?? ""),
      "Project": i.project?.name ?? "",
      "Category": i.category?.name ?? "",
      "Currency": i.currency,
      "Amount": i.amount,
      "Rate": i.exchangeRate,
      "Amount (VND)": vnd(i.amount, i.exchangeRate),
      "Status": i.status,
      "Paid Date": iso(i.paidDate),
      "Notes": i.notes ?? "",
    }));

    const arOpen = invoices.filter((i) => i.direction === "RECEIVABLE" && i.status === "OPEN").reduce((a, i) => a + vnd(i.amount, i.exchangeRate), 0);
    const apOpen = invoices.filter((i) => i.direction === "PAYABLE" && i.status === "OPEN").reduce((a, i) => a + vnd(i.amount, i.exchangeRate), 0);
    const blank = Object.fromEntries(headers.map((h) => [h, ""])) as Record<string, unknown>;
    rows.push({ ...blank } as never);
    rows.push({ ...blank, "Direction": "Open AR (owed to you)", "Amount (VND)": arOpen } as never);
    rows.push({ ...blank, "Direction": "Open AP (you owe)", "Amount (VND)": apOpen } as never);

    xlsx.utils.book_append_sheet(wb, sheet(rows, headers), "Invoices & Bills");
    filename = `wf-invoices_${from}_${to}.xlsx`;
  }

  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
