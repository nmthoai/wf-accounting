import { readFile } from "fs/promises";
import { basename, join } from "path";
import * as xlsx from "xlsx";
import { zipSync } from "fflate";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";
import { TYPE_LABEL, RATE_SOURCE_LABEL, STATUS_LABEL, EPS, BOOKED, accountDelta, isPnl, isBooked, settlement, toVnd } from "@/lib/money";
import { DOC_STATUS, DOC_OPEN, PURPOSE_STATUS, CIT_STATUS, VAT_STATUS } from "@/lib/review";

// The monthly package for the accountant: ledger, invoices, bank
// reconciliation, missing documents, open questions and change history —
// each entry linked to its evidence files, which travel in the same ZIP.

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const safe = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").replace(/[^\w.-]+/g, "_").slice(0, 80);
const tol = (currency: string) => (currency === "VND" ? 0.5 : EPS);

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export async function collect(month: string) {
  const { start, end } = monthRange(month);
  const inMonth = { gte: start, lt: end };
  const [entries, allInvoices, accounts, lines, statements, costItems, untilEnd] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: inMonth },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      include: {
        account: true, category: true, project: true, vendor: true, attachments: true, bankLine: true,
        allocations: { include: { invoice: { include: { attachments: true } } } },
        reversedBy: { select: { id: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { issueDate: { lt: end } },
      orderBy: { issueDate: "asc" },
      include: { client: true, vendor: true, project: true, attachments: true, allocations: { include: { transaction: { select: { date: true, status: true } } } } },
    }),
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.bankLine.findMany({ where: { txnDate: { lt: end } }, orderBy: [{ txnDate: "asc" }, { createdAt: "asc" }], include: { entries: true } }),
    prisma.bankStatement.findMany({ orderBy: { periodFrom: "asc" } }),
    prisma.costItem.findMany({ where: { status: "PENDING", receiptDate: inMonth }, orderBy: { receiptDate: "asc" } }),
    prisma.transaction.findMany({ where: { date: { lt: end }, ...BOOKED } }),
  ]);
  const history = await prisma.changeLog.findMany({
    where: { entity: "Transaction", entityId: { in: entries.map((e) => e.id) } },
    orderBy: { createdAt: "asc" },
  });
  const booked = entries.filter(isBooked);

  // Invoices as they stood at month end: issued this month, settled during it,
  // or still open on its last day — counting reviewed payments made by then.
  const invoices = allInvoices.flatMap((i) => {
    const allocations = i.allocations.filter((a) => a.transaction.status !== "DRAFT" && a.transaction.date < end);
    const { received, fees } = settlement(i.amount, allocations);
    const status = i.status === "VOID" ? "VOID" : received + fees <= EPS ? "OPEN" : received + fees >= i.amount - EPS ? "PAID" : "PARTIAL";
    const issued = i.issueDate >= start;
    const settledNow = allocations.some((a) => a.transaction.date >= start);
    if (!issued && !settledNow && (status === "PAID" || status === "VOID")) return [];
    return [{ ...i, allocations, status, paidDate: i.paidDate && i.paidDate < end ? i.paidDate : null }];
  });
  const cancelled = (t: { reversalOfId: string | null; reversedBy: { id: string } | null }) => !!t.reversalOfId || !!t.reversedBy;

  // Evidence: each entry's own files and those of the invoices it settles.
  const files = new Map<string, { zipPath: string; filePath: string }>();
  const evidenceOf = new Map<string, string[]>();
  for (const t of booked) {
    const paths: string[] = [];
    for (const a of t.attachments) {
      const zipPath = `evidence/${iso(t.date)}_${t.id.slice(-6)}_${a.id.slice(-6)}_${safe(a.fileName)}`;
      files.set(a.id, { zipPath, filePath: a.filePath });
      paths.push(zipPath);
    }
    for (const al of t.allocations) {
      for (const a of al.invoice.attachments) {
        const zipPath = `evidence/invoices/${safe(al.invoice.number ?? al.invoice.id.slice(-6))}_${a.id.slice(-6)}_${safe(a.fileName)}`;
        files.set(a.id, { zipPath, filePath: a.filePath });
        paths.push(zipPath);
      }
    }
    evidenceOf.set(t.id, paths);
  }
  for (const inv of invoices) {
    for (const a of inv.attachments) {
      if (!files.has(a.id)) files.set(a.id, { zipPath: `evidence/invoices/${safe(inv.number ?? inv.id.slice(-6))}_${a.id.slice(-6)}_${safe(a.fileName)}`, filePath: a.filePath });
    }
  }

  // Bank, per account with an imported statement: the month's opening and
  // closing from the statement lines, against the app's balance at month end.
  const bank = accounts.filter((a) => statements.some((s) => s.accountId === a.id)).map((a) => {
    // Start from the latest statement that began by the month's first day (its
    // stated opening), so a statement never imported earlier doesn't skew it.
    const mine = statements.filter((s) => s.accountId === a.id);
    const base = mine.filter((s) => s.periodFrom <= start).pop() ?? mine[0];
    const own = lines.filter((l) => l.accountId === a.id);
    const opening = own.filter((l) => l.txnDate >= base.periodFrom && l.txnDate < start).reduce((s, l) => s + l.amount, base.openingBalance);
    const monthLines = own.filter((l) => l.txnDate >= start);
    const closing = monthLines.reduce((s, l) => s + l.amount, opening);
    const app = untilEnd
      .filter((t) => t.accountId === a.id && (!a.openingDate || t.date >= a.openingDate))
      .reduce((s, t) => s + accountDelta(t, a.currency), a.openingBalance);
    const covered = statements.some((s) => s.accountId === a.id && s.periodFrom < end && s.periodTo >= start);
    const status = (l: (typeof own)[number]) => {
      const matched = l.entries.reduce((s, t) => s + Math.abs(accountDelta(t, a.currency)), 0);
      return matched <= tol(a.currency) ? "Not in ledger" : Math.abs(l.amount) - matched > tol(a.currency) ? "Part matched" : "Matched";
    };
    return { account: a, covered, opening, closing, app, lines: monthLines.map((l) => ({ ...l, status: status(l) })) };
  });

  return { month, start, end, entries, booked, cancelled, invoices, bank, costItems, history, files, evidenceOf };
}

type Data = Awaited<ReturnType<typeof collect>>;

// Everything the accountant should look at or answer.
export function questions(d: Data) {
  const q: { area: string; item: string; detail: string; amount: string; ref: string }[] = [];
  const amt = (n: number, c: string) => `${Math.round(n * 100) / 100} ${c}`;
  for (const t of d.entries) {
    const what = `${iso(t.date)} · ${t.description ?? TYPE_LABEL[t.type] ?? t.type}`;
    if (t.status === "DRAFT") q.push({ area: "Not reviewed", item: what, detail: "Draft — excluded from this package's figures until the owner reviews it.", amount: amt(t.amount, t.currency), ref: t.id });
    if (!isBooked(t) || d.cancelled(t)) continue;
    if (t.status === "REVIEWED") q.push({ area: "Not posted", item: what, detail: "Reviewed but not yet posted (locked).", amount: amt(t.amount, t.currency), ref: t.id });
    if (t.type === "EXPENSE" && (t.citStatus === "PENDING" || t.vatStatus === "PENDING")) {
      q.push({ area: "Tax review", item: what, detail: `CIT: ${CIT_STATUS[t.citStatus]}; input VAT: ${VAT_STATUS[t.vatStatus]}.`, amount: amt(t.amount, t.currency), ref: t.id });
    }
    if (t.reviewNote) q.push({ area: "Note", item: what, detail: t.reviewNote, amount: amt(t.amount, t.currency), ref: t.id });
    if (t.account?.type === "BANK" && !t.bankLineId && d.bank.some((b) => b.account.id === t.accountId && b.covered)) {
      q.push({ area: "Bank", item: what, detail: "On a bank account but not matched to any bank statement line yet.", amount: amt(t.amount, t.currency), ref: t.id });
    }
  }
  for (const t of d.entries.filter((x) => x.reversalOfId)) {
    q.push({ area: "Correction", item: `${iso(t.date)} · ${t.description ?? ""}`, detail: `Reverses a posted entry: ${t.reviewNote ?? ""}`, amount: amt(t.amount, t.currency), ref: t.id });
  }
  for (const b of d.bank) {
    for (const l of b.lines.filter((x) => x.status !== "Matched")) {
      q.push({ area: "Bank", item: `${iso(l.txnDate)} · ${b.account.name} · ${l.reference ?? ""}`, detail: `${l.status}: ${l.counterparty ?? l.description ?? ""}`, amount: amt(l.amount, b.account.currency), ref: l.locator });
    }
    if (!b.covered) q.push({ area: "Bank", item: b.account.name, detail: "No bank statement imported for this month.", amount: "", ref: "" });
  }
  for (const i of d.invoices) {
    const s = settlement(i.amount, i.allocations);
    if (i.status !== "VOID" && Math.abs(s.difference) > EPS && (i.status === "PARTIAL" || s.received + s.fees > 0)) {
      q.push({ area: "Invoice", item: `${i.direction === "PAYABLE" ? "Bill" : "Invoice"} ${i.number ?? ""}`, detail: `Gross ${i.amount}, received ${s.received}, evidenced fees ${s.fees} — unmatched difference ${Math.round(s.difference * 100) / 100}.`, amount: amt(s.difference, i.currency), ref: i.id });
    }
  }
  for (const c of d.costItems) {
    q.push({ area: "Cost register", item: `${iso(c.receiptDate)} · ${c.provider}${c.ref ? ` (${c.ref})` : ""}`, detail: "Receipt pending review — not in the ledger yet.", amount: amt(c.amount, c.currency), ref: c.id });
  }
  return q;
}

export function summarize(d: Data) {
  const live = d.booked.filter((t) => isPnl(t.type));
  const sum = (type: string) => live.filter((t) => t.type === type).reduce((s, t) => s + toVnd(t), 0);
  return {
    entries: d.entries.length,
    drafts: d.entries.filter((t) => !isBooked(t)).length,
    reviewed: d.entries.filter((t) => t.status === "REVIEWED").length,
    posted: d.entries.filter((t) => t.status === "POSTED").length,
    income: sum("INCOME"),
    expense: sum("EXPENSE"),
    missingDocs: d.booked.filter((t) => isPnl(t.type) && !d.cancelled(t) && DOC_OPEN.includes(t.docStatus)).length,
    questions: questions(d).length,
    evidence: d.files.size,
    bank: d.bank.map((b) => ({
      name: b.account.name, currency: b.account.currency, covered: b.covered, closing: b.closing, app: b.app,
      agrees: Math.abs(b.app - b.closing) <= tol(b.account.currency), open: b.lines.filter((l) => l.status !== "Matched").length,
    })),
  };
}

// The ZIP: one workbook plus the evidence files it links to.
export async function pack(d: Data, user: string | null) {
  const s = summarize(d);
  const wb = xlsx.utils.book_new();
  const add = (name: string, aoa: unknown[][], widths: number[]) => {
    const ws = xlsx.utils.aoa_to_sheet(aoa);
    ws["!cols"] = widths.map((wch) => ({ wch }));
    xlsx.utils.book_append_sheet(wb, ws, name);
    return ws;
  };

  // Files first, so the workbook can say which evidence is missing on the server.
  const zip: Record<string, [Uint8Array, { level: 0 }]> = {};
  const missing: string[] = [];
  for (const f of d.files.values()) {
    try { zip[f.zipPath] = [new Uint8Array(await readFile(join(UPLOAD_DIR, basename(f.filePath)))), { level: 0 }]; }
    catch { missing.push(f.zipPath); }
  }

  add("Read me", [
    ["WorkFactory — accountant handover", ""],
    ["Month", d.month],
    ["Generated", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC${user ? ` by ${user}` : ""}`],
    [],
    ["Entries in the month", s.entries],
    ["— drafts (not reviewed; excluded from figures)", s.drafts],
    ["— reviewed, not yet posted", s.reviewed],
    ["— posted (locked)", s.posted],
    ["Income (VND, reviewed and posted)", Math.round(s.income)],
    ["Expenses (VND, reviewed and posted)", Math.round(s.expense)],
    ["Entries missing documents", s.missingDocs],
    ["Open questions", s.questions],
    ["Evidence files included", s.evidence - missing.length],
    ...(missing.length ? [["Evidence files missing on the server", missing.join(", ")]] : []),
    [],
    ...s.bank.map((b) => [`Bank ${b.name} (${b.currency})`, b.covered ? `statement closing ${Math.round(b.closing * 100) / 100} · app ${Math.round(b.app * 100) / 100} · ${b.agrees ? "agrees" : "DIFFERS"} · ${b.open} lines to reconcile` : "no statement imported for this month"]),
    [],
    ["Notes", "Amounts are in the original currency; VND values use each entry's own rate (bank-settled where known). Currencies are never added together. Recording an expense doesn't make it deductible or its VAT claimable — see the CIT / Input VAT columns. Evidence paths in the Ledger sheet point into the evidence folder of this ZIP."],
  ], [44, 110]);

  const head = ["Date", "Status", "Type", "Account", "Category", "Project", "Vendor", "Description", "Invoice #", "Currency", "Amount", "Rate", "Rate source", "Amount (VND)",
    "Document", "Business purpose", "CIT", "Input VAT", "VAT amount", "Review note", "Bank reference", "Settles", "Evidence", "Entered by", "Entry ID"];
  const ledgerRows = d.booked.map((t) => [
    iso(t.date), `${STATUS_LABEL[t.status] ?? t.status}${t.reversalOfId ? " (reversal)" : t.reversedBy ? " (reversed)" : ""}`,
    TYPE_LABEL[t.type] ?? t.type, t.account?.name ?? "", isPnl(t.type) ? t.category?.name ?? "" : "", t.project?.name ?? "", t.vendor?.name ?? "",
    t.description ?? "", t.invoiceNumber ?? "", t.currency, t.amount, t.exchangeRate, t.rateSource ? RATE_SOURCE_LABEL[t.rateSource] ?? t.rateSource : "",
    Math.round(toVnd(t)),
    isPnl(t.type) ? DOC_STATUS[t.docStatus] ?? t.docStatus : "",
    t.type === "EXPENSE" ? PURPOSE_STATUS[t.purposeStatus] : "", t.type === "EXPENSE" ? CIT_STATUS[t.citStatus] : "", t.type === "EXPENSE" ? VAT_STATUS[t.vatStatus] : "",
    t.vatAmount ?? "", t.reviewNote ?? "",
    t.bankLine ? `${iso(t.bankLine.txnDate)} ${t.bankLine.reference ?? ""}`.trim() : "",
    t.allocations.map((a) => `${a.kind === "FEE" ? "fee → " : ""}${a.invoice.number ?? "(no number)"} ${a.amount}`).join("; "),
    (d.evidenceOf.get(t.id) ?? []).join("; "), t.createdBy ?? "", t.id,
  ]);
  const ledger = add("Ledger", [head, ...ledgerRows], [11, 16, 14, 18, 18, 22, 18, 40, 12, 8, 14, 10, 10, 14, 18, 20, 16, 18, 10, 36, 26, 24, 50, 12, 26]);
  // Each entry's evidence cell opens its first file once the ZIP is extracted.
  const ev = head.indexOf("Evidence");
  d.booked.forEach((t, r) => {
    const first = d.evidenceOf.get(t.id)?.[0];
    const cell = ledger[xlsx.utils.encode_cell({ r: r + 1, c: ev })];
    if (first && cell) cell.l = { Target: first };
  });

  add("Invoices", [
    ["Direction", "Number", "Party", "Project", "Issue date", "Due date", "Currency", "Gross", "Received", "Evidenced fees", "Unmatched difference", "Status", "Paid date", "Evidence"],
    ...d.invoices.map((i) => {
      const st = settlement(i.amount, i.allocations);
      return [i.direction === "PAYABLE" ? "Bill (AP)" : "Invoice (AR)", i.number ?? "", (i.direction === "PAYABLE" ? i.vendor?.name : i.client?.name) ?? "",
        i.project?.name ?? "", iso(i.issueDate), iso(i.dueDate), i.currency, i.amount, st.received, st.fees,
        Math.abs(st.difference) > EPS ? Math.round(st.difference * 100) / 100 : 0, i.status, iso(i.paidDate),
        i.attachments.map((a) => d.files.get(a.id)?.zipPath ?? "").filter(Boolean).join("; ")];
    }),
  ], [12, 14, 26, 22, 11, 11, 8, 14, 14, 12, 16, 10, 11, 50]);

  add("Bank reconciliation", [
    ...d.bank.flatMap((b) => [
      [`${b.account.name} (${b.account.currency})`, b.covered ? "" : "No statement imported for this month"],
      ["Statement opening", Math.round(b.opening * 100) / 100, "Statement closing", Math.round(b.closing * 100) / 100, "App balance at month end", Math.round(b.app * 100) / 100, "Difference", Math.round((b.app - b.closing) * 100) / 100],
      [],
    ]),
    ["Account", "Date", "Posting date", "Reference", "Counterparty", "Details", "Amount", "Status", "Ledger entries"],
    ...d.bank.flatMap((b) => b.lines.map((l) => [b.account.name, iso(l.txnDate), iso(l.postingDate), l.reference ?? "", l.counterparty ?? "", l.description ?? "",
      l.amount, l.status, l.entries.map((t) => `${t.description ?? TYPE_LABEL[t.type]} (${t.id})`).join("; ")])),
  ], [22, 11, 11, 18, 32, 40, 14, 14, 50]);

  add("Missing documents", [
    ["Date", "Description", "Account", "Currency", "Amount", "Document", "Review note", "Entry ID"],
    ...d.booked.filter((t) => isPnl(t.type) && !d.cancelled(t) && DOC_OPEN.includes(t.docStatus)).map((t) => [
      iso(t.date), t.description ?? "", t.account?.name ?? "", t.currency, t.amount, DOC_STATUS[t.docStatus], t.reviewNote ?? "", t.id]),
  ], [11, 40, 18, 8, 14, 20, 40, 26]);

  add("Open questions", [["Area", "Item", "Question / detail", "Amount", "Reference"], ...questions(d).map((q) => [q.area, q.item, q.detail, q.amount, q.ref])], [14, 44, 70, 18, 28]);

  add("Change history", [
    ["When (UTC)", "Who", "Action", "Field", "From", "To", "Reason", "Entry ID"],
    ...d.history.map((h) => [h.createdAt.toISOString().slice(0, 16).replace("T", " "), h.user ?? "", h.action, h.field ?? "", h.oldValue ?? "", h.newValue ?? "", h.reason ?? "", h.entityId]),
  ], [17, 12, 10, 14, 30, 30, 40, 26]);

  const book = xlsx.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  zip[`WF-handover-${d.month}.xlsx`] = [new Uint8Array(book), { level: 0 }];
  return zipSync(zip);
}
