import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import { EPS, BOOKED_ALLOCATIONS, isPnl, isBooked, settlement, toVnd } from "@/lib/money";
import { resolveLocale } from "@/i18n/locale";
import { translator } from "@/i18n/server";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// Build a worksheet from rows, with simple column widths derived from headers.
function sheet(rows: Record<string, unknown>[], headers: string[]) {
  const ws = xlsx.utils.json_to_sheet(rows, { header: headers });
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, Math.min(40, h.length + 4)) }));
  return ws;
}

export async function GET(req: Request) {
  const session = await getSession();
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

  // Sheet names, headers and labels follow the user's language.
  const locale = await resolveLocale();
  const tr = translator(locale, "reports");
  const tc = translator(locale, "common");
  // A stored value we have a label for is shown translated; anything else as stored.
  const known = tc as typeof tc & { has: (key: string) => boolean };
  const label = (group: string, value: string) => (known.has(`${group}.${value}`) ? tc(`${group}.${value}`) : value);

  const wb = xlsx.utils.book_new();
  let filename = "";

  if (type === "entries") {
    const txns = await prisma.transaction.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
      include: { category: true, project: true, vendor: true, account: true, _count: { select: { attachments: true } } },
    });

    const col = (key: string) => tr(`export.entries.columns.${key}`);
    const c = {
      date: col("date"), status: col("status"), type: col("type"), account: col("account"), description: col("description"),
      category: col("category"), project: col("project"), vendor: col("vendor"), invoiceNumber: col("invoiceNumber"),
      currency: col("currency"), amount: col("amount"), rate: col("rate"), rateSource: col("rateSource"), amountVnd: col("amountVnd"),
      attachments: col("attachments"), document: col("document"), purpose: col("purpose"), cit: col("cit"), inputVat: col("inputVat"),
      vatAmount: col("vatAmount"), reviewNote: col("reviewNote"),
    };
    const headers = [c.date, c.status, c.type, c.account, c.description, c.category, c.project, c.vendor, c.invoiceNumber, c.currency, c.amount, c.rate, c.rateSource, c.amountVnd, c.attachments,
      c.document, c.purpose, c.cit, c.inputVat, c.vatAmount, c.reviewNote];
    const expense = (t: { type: string }) => t.type === "EXPENSE";
    const rows: Record<string, unknown>[] = txns.map((t) => ({
      [c.date]: iso(t.date),
      [c.status]: t.reversalOfId ? tr("export.entries.reversal", { status: label("status", t.status) }) : label("status", t.status),
      [c.type]: label("type", t.type),
      [c.account]: t.account?.name ?? "",
      [c.description]: t.description ?? "",
      [c.category]: isPnl(t.type) ? t.category?.name ?? tr("uncategorized") : "",
      [c.project]: t.project?.name ?? "",
      [c.vendor]: t.vendor?.name ?? "",
      [c.invoiceNumber]: t.invoiceNumber ?? "",
      [c.currency]: t.currency,
      [c.amount]: t.amount,
      [c.rate]: t.exchangeRate,
      [c.rateSource]: t.rateSource ? label("rateSource", t.rateSource) : "",
      [c.amountVnd]: Math.round(toVnd(t)),
      [c.attachments]: t._count.attachments,
      // Review status sits beside the bookkeeping, never folded into it.
      [c.document]: isPnl(t.type) ? label("review.doc", t.docStatus) : "",
      [c.purpose]: expense(t) ? label("review.purpose", t.purposeStatus) : "",
      [c.cit]: expense(t) ? label("review.cit", t.citStatus) : "",
      [c.inputVat]: expense(t) ? label("review.vat", t.vatStatus) : "",
      [c.vatAmount]: expense(t) && t.vatAmount != null ? t.vatAmount : "",
      [c.reviewNote]: t.reviewNote ?? "",
    }));

    // Totals are profit & loss only — transfers, capital and loans are listed but
    // not summed — and count reviewed and posted entries; drafts are listed only.
    const totalIncome = txns.filter((t) => t.type === "INCOME" && isBooked(t)).reduce((a, t) => a + Math.round(toVnd(t)), 0);
    const totalExpense = txns.filter((t) => t.type === "EXPENSE" && isBooked(t)).reduce((a, t) => a + Math.round(toVnd(t)), 0);
    const blank = Object.fromEntries(headers.map((h) => [h, ""]));
    rows.push({ ...blank });
    rows.push({ ...blank, [c.type]: tr("export.entries.totalIncome"), [c.amountVnd]: totalIncome });
    rows.push({ ...blank, [c.type]: tr("export.entries.totalExpense"), [c.amountVnd]: totalExpense });
    rows.push({ ...blank, [c.type]: tr("export.entries.net"), [c.amountVnd]: totalIncome - totalExpense });

    xlsx.utils.book_append_sheet(wb, sheet(rows, headers), tr("export.entries.sheet"));
    filename = `wf-ledger_${from}_${to}.xlsx`;
  } else {
    const invoices = await prisma.invoice.findMany({
      where: { issueDate: { gte: start, lt: end } },
      orderBy: { issueDate: "asc" },
      include: { client: true, vendor: true, project: true, category: true, allocations: BOOKED_ALLOCATIONS },
    });

    const col = (key: string) => tr(`export.invoices.columns.${key}`);
    const c = {
      issueDate: col("issueDate"), dueDate: col("dueDate"), direction: col("direction"), number: col("number"), party: col("party"),
      project: col("project"), category: col("category"), currency: col("currency"), gross: col("gross"), received: col("received"),
      fees: col("fees"), difference: col("difference"), status: col("status"), paidDate: col("paidDate"), notes: col("notes"),
    };
    const headers = [c.issueDate, c.dueDate, c.direction, c.number, c.party, c.project, c.category, c.currency,
      c.gross, c.received, c.fees, c.difference, c.status, c.paidDate, c.notes];
    const open: Record<string, Record<string, number>> = { RECEIVABLE: {}, PAYABLE: {} };
    const rows: Record<string, unknown>[] = invoices.map((i) => {
      const s = settlement(i.amount, i.allocations);
      if ((i.status === "OPEN" || i.status === "PARTIAL") && s.difference > EPS) {
        open[i.direction][i.currency] = (open[i.direction][i.currency] ?? 0) + s.difference;
      }
      return {
        [c.issueDate]: iso(i.issueDate),
        [c.dueDate]: iso(i.dueDate),
        [c.direction]: i.direction === "RECEIVABLE" ? tr("export.invoices.receivable") : tr("export.invoices.payable"),
        [c.number]: i.number ?? "",
        [c.party]: i.direction === "RECEIVABLE" ? (i.client?.name ?? "") : (i.vendor?.name ?? ""),
        [c.project]: i.project?.name ?? "",
        [c.category]: i.category?.name ?? "",
        [c.currency]: i.currency,
        [c.gross]: i.amount,
        [c.received]: s.received,
        [c.fees]: s.fees,
        [c.difference]: Math.abs(s.difference) > EPS ? s.difference : 0,
        [c.status]: tc(`invoiceStatus.${i.status}`),
        [c.paidDate]: iso(i.paidDate),
        [c.notes]: i.notes ?? "",
      };
    });

    // Open totals per currency — currencies are never added together.
    const blank = Object.fromEntries(headers.map((h) => [h, ""]));
    rows.push({ ...blank });
    for (const [dir, openLabel] of [["RECEIVABLE", tr("export.invoices.openAr")], ["PAYABLE", tr("export.invoices.openAp")]] as const) {
      const lines = Object.entries(open[dir]);
      if (lines.length === 0) rows.push({ ...blank, [c.direction]: openLabel, [c.difference]: 0 });
      for (const [cur, v] of lines) rows.push({ ...blank, [c.direction]: openLabel, [c.currency]: cur, [c.difference]: v });
    }

    xlsx.utils.book_append_sheet(wb, sheet(rows, headers), tr("export.invoices.sheet"));
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
