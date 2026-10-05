"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { defaultUsdRate, resolveFx } from "@/lib/fx";
import { EPS, fmtMoney, settlement } from "@/lib/money";
import { refreshInvoiceStatus } from "@/lib/invoice-status";
import { diff, record, snapshot, type Change } from "@/lib/history";
import { getT } from "@/i18n/server";

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
  const t = await getT("invoices");

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

  if (isNaN(amount) || amount <= 0) return { success: false, message: t("errors.invalidAmount") };
  if (!issueStr || !dueStr) return { success: false, message: t("errors.datesRequired") };

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
  const t = await getT("invoices");
  const inv = await prisma.invoice.findUnique({
    where: { id },
    include: { allocations: { include: { transaction: { include: { _count: { select: { allocations: true } } } } } } },
  });
  if (!inv) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (inv.status === "VOID") return { success: false, message: t("errors.invoiceVoided") };

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

  if (isNaN(amount) || amount <= 0) return { success: false, message: t("errors.invalidAmount") };
  if (!issueStr || !dueStr) return { success: false, message: t("errors.datesRequired") };
  if (currency !== inv.currency && inv.allocations.length > 0) {
    return { success: false, message: t("errors.currencyLocked") };
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
    const carried = {
      invoiceNumber: number,
      projectId: projectId || null,
      categoryId: categoryId || null,
      vendorId: isReceivable ? null : (vendorId || null),
    };
    const changes = diff(a.transactionId, a.transaction, carried, "Invoice details changed");
    if (changes.length === 0) continue; // notes, dates or the amount alone leave payments as they are
    // A reviewed payment whose classification anyone but the owner changes goes
    // back to draft; a new invoice number alone keeps it booked.
    const reclassified = changes.some((c) => c.field !== "invoiceNumber");
    const data = { ...carried, status: !isAdmin && reclassified && a.transaction.status === "REVIEWED" ? "DRAFT" : a.transaction.status };
    await prisma.transaction.update({ where: { id: a.transactionId }, data });
    const all = diff(a.transactionId, a.transaction, data, "Invoice details changed");
    // A bank fee withheld from the payment follows its project, number and status.
    const fee = await prisma.transaction.findUnique({ where: { deductedFromId: a.transactionId } });
    if (fee) {
      const follow = { invoiceNumber: number, projectId: projectId || null, status: data.status === "DRAFT" && fee.status === "REVIEWED" ? "DRAFT" : fee.status };
      await prisma.transaction.update({ where: { id: fee.id }, data: follow });
      all.push(...diff(fee.id, fee, follow, "Invoice details changed"));
    }
    await record(all, session.user?.name);
  }

  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

// Record a payment (part or all of what's still open) as a new ledger entry
// in the chosen account, allocated to this invoice/bill.
//
// A bank fee withheld from a receipt is booked with it: income for the amount
// the payment settles, and a fee expense for what the bank kept, both in the
// account it arrived in — so the account moves by the net the bank credited
// and the invoice is settled by the full amount. The fee is only what the user
// enters; a shortfall is never assumed to be one. A retried save (same
// requestId) records nothing twice.
class StillOpen extends Error { constructor(public open: number) { super("still open"); } }

export async function recordPayment(id: string, formData: FormData) {
  const session = await requireUser();
  const t = await getT("invoices");
  const me = session.user?.name ?? null;
  const requestId = ((formData.get("requestId") as string) || "").trim().slice(0, 100) || null;
  const files = (formData.getAll("files") as File[]).filter((f) => f && f.size > 0);
  // The same save arriving again: finish what the first one may not have (its
  // evidence, the invoice's status) and report it saved.
  const already = async (): Promise<{ success: boolean; message?: string } | null> => {
    const done = requestId ? await prisma.transaction.findUnique({ where: { requestId }, select: { id: true, _count: { select: { attachments: true } } } }) : null;
    if (!done) return null;
    if (files.length && done._count.attachments === 0) await persistUploads(files, { transactionId: done.id });
    await refreshInvoiceStatus([id]);
    revalidateAll();
    return { success: true };
  };
  const repeat = await already();
  if (repeat) return repeat;

  const inv = await prisma.invoice.findUnique({ where: { id }, include: { allocations: true } });
  if (!inv) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (inv.status === "VOID") return { success: false, message: t("errors.voided") };

  const open = settlement(inv.amount, inv.allocations).difference;
  if (open <= EPS) return { success: false, message: t("errors.nothingToSettle") };

  const amount = parseFloat(formData.get("amount") as string);
  if (!(amount > 0)) return { success: false, message: t("errors.enterAmountPaid") };
  if (amount > open + EPS) {
    return { success: false, message: t("errors.moreThanOpen", { amount: fmtMoney(open, inv.currency) }) };
  }

  const feeRaw = ((formData.get("feeDeducted") as string) || "").trim();
  const fee = feeRaw ? parseFloat(feeRaw) : 0;
  if (!(fee >= 0)) return { success: false, message: t("errors.feeInvalid") };
  if (fee > 0 && inv.direction !== "RECEIVABLE") return { success: false, message: t("errors.feeReceiptsOnly") };
  if (fee > 0 && fee >= amount - EPS) return { success: false, message: t("errors.feeTooLarge") };
  const net = amount - fee;
  const feeCategory = fee > 0
    ? await prisma.category.findFirst({ where: { id: (formData.get("feeCategoryId") as string) || "", type: "EXPENSE" } })
    : null;
  if (fee > 0 && !feeCategory) return { success: false, message: t("errors.feeCategory") };

  const dateStr = formData.get("paidDate") as string;
  const accountId = formData.get("accountId") as string;
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { success: false, message: t("errors.chooseAccount") };
  if (account.currency === "USD" && inv.currency !== "USD") {
    return { success: false, message: t("errors.usdAccount", { account: account.name, currency: inv.currency }) };
  }
  // The bank's VND figure, when given, is what it credited — the net.
  const fx = await resolveFx(inv.currency, net, formData);
  if (!fx.ok) return { success: false, message: fx.message };
  const payVnd = fx.vndAmount === null ? null : fee > 0 ? Math.round(amount * fx.exchangeRate) : fx.vndAmount;
  const feeVnd = payVnd === null || fx.vndAmount === null ? null : payVnd - fx.vndAmount;

  const isReceivable = inv.direction === "RECEIVABLE";
  const description = isReceivable
    ? (inv.number ? t("payment.descReceivedNo", { number: inv.number }) : t("payment.descReceived"))
    : (inv.number ? t("payment.descPaidNo", { number: inv.number }) : t("payment.descPaid"));
  const date = dateStr ? new Date(dateStr) : new Date();
  // The owner's entries count as reviewed; anyone else's wait for review.
  const status = session.user?.role === "ADMIN" ? "REVIEWED" : "DRAFT";
  const common = {
    currency: inv.currency, exchangeRate: fx.exchangeRate, rateSource: fx.rateSource, accountId: account.id, date,
    invoiceNumber: inv.number, projectId: inv.projectId, status, createdBy: me,
  };

  let paymentId: string;
  try {
    paymentId = await prisma.$transaction(async (tx) => {
      // Checked again inside the write: two saves can't both settle the same open amount.
      const now = await tx.paymentAllocation.findMany({ where: { invoiceId: inv.id }, select: { kind: true, amount: true } });
      const stillOpen = settlement(inv.amount, now).difference;
      if (amount > stillOpen + EPS) throw new StillOpen(stillOpen);

      const p = await tx.transaction.create({
        data: {
          ...common, type: isReceivable ? "INCOME" : "EXPENSE", amount, vndAmount: payVnd, description,
          categoryId: inv.categoryId, vendorId: isReceivable ? null : inv.vendorId, requestId,
        },
      });
      await tx.paymentAllocation.create({ data: { invoiceId: inv.id, transactionId: p.id, kind: "PAYMENT", amount } });
      const changes: Change[] = [
        { entityId: p.id, action: "CREATE", newValue: snapshot(p) },
        { entityId: p.id, action: "LINK", field: "invoice", newValue: linkNote(inv, "PAYMENT", amount) },
      ];
      if (fee > 0) {
        const f = await tx.transaction.create({
          data: {
            ...common, type: "EXPENSE", amount: fee, vndAmount: feeVnd, categoryId: feeCategory!.id,
            description: inv.number ? t("payment.feeDescNo", { number: inv.number }) : t("payment.feeDesc"),
            requestId: requestId ? `${requestId}:fee` : null, deductedFromId: p.id,
          },
        });
        changes.push(
          { entityId: f.id, action: "CREATE", newValue: snapshot(f) },
          { entityId: p.id, action: "LINK", field: "deductedFee", newValue: `${fee} ${inv.currency} · ${f.id}` },
        );
      }
      // The settlement as the user confirmed it, for the audit trail — on the
      // invoice and on the entry, so the entry's history shows it too.
      const summary = [
        `settled ${amount} ${inv.currency}`, `fee deducted ${fee}`, `net ${Math.round(net * 100) / 100} into ${account.name}`,
        `paid ${date.toISOString().slice(0, 10)}`, `entry ${p.id}`,
        `evidence: ${files.length ? files.map((x) => x.name).join(", ") : "none"}`,
      ].join(" · ");
      changes.push(
        { entity: "Invoice", entityId: inv.id, action: "PAYMENT", field: "settlement", newValue: summary },
        { entityId: p.id, action: "LINK", field: "settlement", newValue: summary },
      );
      await record(changes, me, tx);
      return p.id;
    });
  } catch (e) {
    // The same save arriving twice at once: the first one recorded it.
    const repeat = await already();
    if (repeat) return repeat;
    if (e instanceof StillOpen) {
      return { success: false, message: e.open <= EPS ? t("errors.nothingToSettle") : t("errors.moreThanOpen", { amount: fmtMoney(e.open, inv.currency) }) };
    }
    throw e;
  }

  if (files.length) await persistUploads(files, { transactionId: paymentId });
  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

// Allocate an existing ledger entry to this invoice — a payment (e.g. one bank
// transfer that covers several invoices) or a separately evidenced fee.
export async function linkToInvoice(id: string, formData: FormData) {
  const session = await requireUser();
  const tr = await getT("invoices");
  const inv = await prisma.invoice.findUnique({ where: { id } });
  if (!inv) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (inv.status === "VOID") return { success: false, message: tr("errors.voided") };

  const kind = formData.get("kind") === "FEE" ? "FEE" : "PAYMENT";
  const transactionId = formData.get("transactionId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  if (!(amount > 0)) return { success: false, message: tr("errors.enterAllocation") };

  const t = transactionId
    ? await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: { allocations: true, reversedBy: { select: { id: true } }, _count: { select: { attachments: true } } },
      })
    : null;
  if (!t) return { success: false, message: tr("errors.chooseEntry") };
  if (t.reversalOfId || t.reversedBy) return { success: false, message: tr("errors.entryReversed") };
  if (t.deductedFromId) return { success: false, message: tr("errors.withheldFee") };
  if (t.currency !== inv.currency) {
    return { success: false, message: tr("errors.currencyMismatch", { entryCurrency: t.currency, currency: inv.currency }) };
  }

  if (kind === "PAYMENT") {
    const expected = inv.direction === "RECEIVABLE" ? "INCOME" : "EXPENSE";
    if (t.type !== expected) {
      return { success: false, message: inv.direction === "RECEIVABLE" ? tr("errors.receivableNeedsIncome") : tr("errors.billNeedsExpense") };
    }
  } else {
    // A fee only counts when it is evidenced — never inferred from a difference.
    if (t.type !== "EXPENSE") return { success: false, message: tr("errors.feeMustBeExpense") };
    if (t._count.attachments === 0) {
      return { success: false, message: tr("errors.feeNeedsEvidence") };
    }
  }

  if (t.allocations.some((a) => a.invoiceId === id)) return { success: false, message: tr("errors.alreadyLinked") };
  const free = t.amount - t.allocations.reduce((s, a) => s + a.amount, 0);
  if (amount > free + EPS) {
    return { success: false, message: tr("errors.notEnoughFree", { amount: fmtMoney(Math.max(0, free), t.currency) }) };
  }
  // Never more than the invoice still has open — a fee or payment can't overpay it.
  const open = settlement(inv.amount, await prisma.paymentAllocation.findMany({ where: { invoiceId: id } })).difference;
  if (amount > open + EPS) {
    return { success: false, message: open <= EPS ? tr("errors.nothingToSettle") : tr("errors.moreThanOpen", { amount: fmtMoney(open, inv.currency) }) };
  }

  await prisma.paymentAllocation.create({ data: { invoiceId: id, transactionId: t.id, kind, amount } });
  await record([{ entityId: t.id, action: "LINK", field: "invoice", newValue: linkNote(inv, kind, amount) }], session.user?.name);
  await refreshInvoiceStatus([id]);
  revalidateAll();
  return { success: true };
}

export async function unlinkAllocation(allocationId: string) {
  const session = await requireUser();
  const t = await getT("invoices");
  const a = await prisma.paymentAllocation.findUnique({ where: { id: allocationId }, include: { invoice: true, transaction: { select: { status: true } } } });
  if (!a) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (a.transaction.status === "POSTED" && session.user?.role !== "ADMIN") return { success: false, message: t("errors.postedUnlink") };
  await prisma.paymentAllocation.delete({ where: { id: allocationId } });
  await record([{ entityId: a.transactionId, action: "UNLINK", field: "invoice", oldValue: linkNote(a.invoice, a.kind, a.amount) }], session.user?.name);
  await refreshInvoiceStatus([a.invoiceId]);
  revalidateAll();
  return { success: true };
}

export async function voidInvoice(id: string) {
  const session = await requireUser();
  const t = await getT("invoices");
  if (session.user?.role !== "ADMIN") return { success: false, message: t("errors.ownerOnlyVoid") };
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { _count: { select: { allocations: true } } } });
  if (!inv) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (inv._count.allocations > 0) {
    return { success: false, message: t("errors.hasPayments") };
  }
  await prisma.invoice.update({ where: { id }, data: { status: "VOID" } });
  await record([{ entity: "Invoice", entityId: id, action: "UPDATE", field: "status", oldValue: inv.status, newValue: "VOID" }], session.user?.name);
  revalidateAll();
  return { success: true };
}

export async function deleteInvoice(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const t = await getT("invoices");
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { attachments: true, _count: { select: { allocations: true } } } });
  if (!inv) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (inv._count.allocations > 0) {
    return { success: false, message: t("errors.hasPayments") };
  }
  for (const a of inv.attachments) await removeUploadFile(a.filePath);
  await prisma.invoice.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
