"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { defaultUsdRate, resolveFx } from "@/lib/fx";
import { EPS, fmtMoney, settlement } from "@/lib/money";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { diff, record, snapshot } from "@/lib/history";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

function revalidateAll() {
  revalidatePath("/invoices");
  revalidatePath("/ledger");
  revalidatePath("/projects");
  revalidatePath("/accounts");
  revalidatePath("/bank");
  revalidatePath("/");
}

const linkNote = (inv: { number: string | null; direction: string }, kind: string, amount: number) =>
  `${inv.direction === "PAYABLE" ? "bill" : "invoice"} ${inv.number ?? "(no number)"} · ${kind} ${amount}`;

// Create a receivable (client owes you) or payable (you owe a vendor).
export async function createInvoice(formData: FormData) {
  await requireUser();

  const direction = (formData.get("direction") as string) === "PAYABLE" ? "PAYABLE" : "RECEIVABLE";
  const number = (formData.get("number") as string)?.trim() || null;
  const clientId = (formData.get("clientId") as string) || null;
  const vendorId = (formData.get("vendorId") as string) || null;
  const projectId = (formData.get("projectId") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const issueStr = formData.get("issueDate") as string;
  const dueStr = formData.get("dueDate") as string;
  const currency = (formData.get("currency") as string) || "VND";
  const amount = parseFloat(formData.get("amount") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (isNaN(amount) || amount <= 0) return { success: false, message: "Enter a valid amount." };
  if (!issueStr || !dueStr) return { success: false, message: "Issue and due dates are required." };

  let exchangeRate = 1.0;
  if (currency === "USD") {
    exchangeRate = await defaultUsdRate();
  }

  const invoice = await prisma.invoice.create({
    data: {
      number,
      direction,
      clientId: direction === "RECEIVABLE" ? clientId : null,
      vendorId: direction === "PAYABLE" ? vendorId : null,
      projectId: projectId || null,
      categoryId: categoryId || null,
      issueDate: new Date(issueStr),
      dueDate: new Date(dueStr),
      currency,
      exchangeRate,
      amount,
      status: "OPEN",
      notes,
    },
  });

  // Attach the externally-issued PDF, if provided.
  await persistUploads(formData.getAll("files") as File[], { invoiceId: invoice.id });

  revalidateAll();
  return { success: true };
}

// Edit an existing invoice/bill. Direction is fixed (receivable vs payable);
// everything else is editable. Recorded payments are facts and keep their
// amounts; the status is recalculated against the new gross.
export async function updateInvoice(id: string, formData: FormData) {
  const session = await requireUser();
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { allocations: { include: { transaction: { include: { _count: { select: { allocations: true } } } } } } },
  });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "VOID") return { success: false, message: "This invoice is voided." };

  const number = (formData.get("number") as string)?.trim() || null;
  const clientId = (formData.get("clientId") as string) || null;
  const vendorId = (formData.get("vendorId") as string) || null;
  const projectId = (formData.get("projectId") as string) || null;
  const categoryId = (formData.get("categoryId") as string) || null;
  const issueStr = formData.get("issueDate") as string;
  const dueStr = formData.get("dueDate") as string;
  const currency = (formData.get("currency") as string) || inv.currency;
  const amount = parseFloat(formData.get("amount") as string);
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (isNaN(amount) || amount <= 0) return { success: false, message: "Enter a valid amount." };
  if (!issueStr || !dueStr) return { success: false, message: "Issue and due dates are required." };
  if (currency !== inv.currency && inv.allocations.length > 0) {
    return { success: false, message: "Payments are linked in the current currency — unlink them before changing it." };
  }

  const isReceivable = inv.direction === "RECEIVABLE";

  // Recompute the rate only if the currency changed.
  let exchangeRate = inv.exchangeRate;
  if (currency !== inv.currency) {
    if (currency === "USD") {
      exchangeRate = await defaultUsdRate();
    } else {
      exchangeRate = 1.0;
    }
  }

  await prisma.invoice.update({
    where: { id },
    data: {
      number,
      clientId: isReceivable ? (clientId || null) : null,
      vendorId: isReceivable ? null : (vendorId || null),
      projectId: projectId || null,
      categoryId: categoryId || null,
      issueDate: new Date(issueStr),
      dueDate: new Date(dueStr),
      currency,
      exchangeRate,
      amount,
      notes,
    },
  });

  // Payments that settle only this invoice carry its descriptive fields along
  // (number, project, category, vendor). Amounts are never rewritten, and
  // posted entries stay as they are.
  const own = inv.allocations.filter((a) => a.kind === "PAYMENT" && a.transaction._count.allocations === 1 && a.transaction.status !== "POSTED");
  const isAdmin = session.user?.role === "ADMIN";
  for (const a of own) {
    const data = {
      invoiceNumber: number,
      projectId: projectId || null,
      categoryId: categoryId || null,
      vendorId: isReceivable ? null : (vendorId || null),
      // A reviewed entry changed by anyone but the owner goes back to draft.
      status: !isAdmin && a.transaction.status === "REVIEWED" ? "DRAFT" : a.transaction.status,
    };
    await prisma.transaction.update({ where: { id: a.transactionId }, data });
    await record(diff(a.transactionId, a.transaction, data, "Invoice details changed"), session.user?.name);
  }

  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

// Record a payment (part or all of what's still open) as a new ledger entry
// in the chosen account, allocated to this invoice/bill.
export async function recordPayment(id: string, formData: FormData) {
  const session = await requireUser();
  const me = session.user?.name ?? null;
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { allocations: true } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "VOID") return { success: false, message: "This is voided." };

  const open = settlement(inv.amount, inv.allocations).difference;
  if (open <= EPS) return { success: false, message: "Nothing left to settle." };

  const amount = parseFloat(formData.get("amount") as string);
  if (!(amount > 0)) return { success: false, message: "Enter the amount paid." };
  if (amount > open + EPS) {
    return { success: false, message: `That's more than what's still open (${fmtMoney(open, inv.currency)}).` };
  }

  const dateStr = formData.get("paidDate") as string;
  const accountId = formData.get("accountId") as string;
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { success: false, message: "Choose the account the money moved through." };
  if (account.currency === "USD" && inv.currency !== "USD") {
    return { success: false, message: `${account.name} is a USD account — this invoice is in ${inv.currency}.` };
  }
  const fx = await resolveFx(inv.currency, amount, formData);
  if (!fx.ok) return { success: false, message: fx.message };

  const isReceivable = inv.direction === "RECEIVABLE";
  await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({
      data: {
        type: isReceivable ? "INCOME" : "EXPENSE",
        amount,
        currency: inv.currency,
        exchangeRate: fx.exchangeRate,
        vndAmount: fx.vndAmount,
        rateSource: fx.rateSource,
        accountId: account.id,
        date: dateStr ? new Date(dateStr) : new Date(),
        description: isReceivable
          ? `Payment received${inv.number ? ` — Invoice ${inv.number}` : ""}`
          : `Vendor payment${inv.number ? ` — Bill ${inv.number}` : ""}`,
        invoiceNumber: inv.number,
        projectId: inv.projectId,
        categoryId: inv.categoryId,
        vendorId: isReceivable ? null : inv.vendorId,
        // The owner's entries count as reviewed; anyone else's wait for review.
        status: session.user?.role === "ADMIN" ? "REVIEWED" : "DRAFT",
        createdBy: me,
      },
    });
    await tx.paymentAllocation.create({ data: { invoiceId: inv.id, transactionId: t.id, kind: "PAYMENT", amount } });
    await record([
      { entityId: t.id, action: "CREATE", newValue: snapshot(t) },
      { entityId: t.id, action: "LINK", field: "invoice", newValue: linkNote(inv, "PAYMENT", amount) },
    ], me, tx);
  });

  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

// Allocate an existing ledger entry to this invoice — a payment (e.g. one bank
// transfer that covers several invoices) or a separately evidenced fee.
export async function linkToInvoice(id: string, formData: FormData) {
  const session = await requireUser();
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv.status === "VOID") return { success: false, message: "This is voided." };

  const kind = formData.get("kind") === "FEE" ? "FEE" : "PAYMENT";
  const transactionId = formData.get("transactionId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  if (!(amount > 0)) return { success: false, message: "Enter the amount to allocate." };

  const t = transactionId
    ? await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { allocations: true, reversedBy: { select: { id: true } }, _count: { select: { attachments: true } } },
      })
    : null;
  if (!t) return { success: false, message: "Choose a ledger entry." };
  if (t.reversalOfId || t.reversedBy) return { success: false, message: "That entry has been reversed — link its correction instead." };
  if (t.currency !== inv.currency) {
    return { success: false, message: `That entry is in ${t.currency}; this invoice is in ${inv.currency}.` };
  }

  if (kind === "PAYMENT") {
    const expected = inv.direction === "RECEIVABLE" ? "INCOME" : "EXPENSE";
    if (t.type !== expected) {
      return { success: false, message: inv.direction === "RECEIVABLE" ? "A receivable is settled by income." : "A bill is settled by an expense." };
    }
  } else {
    // A fee only counts when it is evidenced — never inferred from a difference.
    if (t.type !== "EXPENSE") return { success: false, message: "A fee must be an expense entry." };
    if (t._count.attachments === 0) {
      return { success: false, message: "Attach the fee evidence (bank advice or receipt) to that ledger entry first." };
    }
  }

  if (t.allocations.some((a) => a.invoiceId === id)) return { success: false, message: "Already linked to this invoice." };
  const free = t.amount - t.allocations.reduce((s, a) => s + a.amount, 0);
  if (amount > free + EPS) {
    return { success: false, message: `That entry only has ${fmtMoney(Math.max(0, free), t.currency)} left to allocate.` };
  }

  await prisma.paymentAllocation.create({ data: { invoiceId: id, transactionId: t.id, kind, amount } });
  await record([{ entityId: t.id, action: "LINK", field: "invoice", newValue: linkNote(inv, kind, amount) }], session.user?.name);
  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

export async function unlinkAllocation(allocationId: string) {
  const session = await requireUser();
  const a = await prisma.paymentAllocation.findUnique({ where: { id: allocationId }, include: { invoice: true, transaction: { select: { status: true } } } });
  if (!a) return { success: false, message: "Not found." };
  if (a.transaction.status === "POSTED" && session.user?.role !== "ADMIN") return { success: false, message: "That payment is posted — only the owner can unlink it." };
  await prisma.paymentAllocation.delete({ where: { id: allocationId } });
  await record([{ entityId: a.transactionId, action: "UNLINK", field: "invoice", oldValue: linkNote(a.invoice, a.kind, a.amount) }], session.user?.name);
  await refreshInvoiceStatus([a.invoiceId]);
  revalidateAll();
  return { success: true };
}

export async function voidInvoice(id: string) {
  const session = await requireUser();
  if (session.user?.role !== "ADMIN") return { success: false, message: "Only the owner can void an invoice." };
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { _count: { select: { allocations: true } } } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv._count.allocations > 0) {
    return { success: false, message: "It has payments linked — unlink them first." };
  }
  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  await record([{ entity: "Invoice", entityId: id, action: "UPDATE", field: "status", oldValue: inv.status, newValue: "VOID" }], session.user?.name);
  revalidateAll();
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { attachments: true, _count: { select: { allocations: true } } } });
  if (!inv) return { success: false, message: "Not found." };
  if (inv._count.allocations > 0) {
    return { success: false, message: "It has payments linked — unlink them first." };
  }
  for (const a of inv.attachments) await removeUploadFile(a.filePath);
  await prisma.invoice.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
