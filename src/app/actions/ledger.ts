"use server";

import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { resolveFx } from "@/lib/fx";
import { CURRENCIES, EPS } from "@/lib/money";
import { refreshInvoiceStatus, invoicesOf } from "@/lib/invoice-status";
import { reviewProblem } from "@/lib/review";
import { bankLinkProblem } from "@/lib/bank-match";
import { diff, record, snapshot, type Change } from "@/lib/history";
import { costItemProblem, convertCostItem, CostItemTaken } from "@/lib/cost-items";

type Decisions = { purposeStatus: string; citStatus: string; vatStatus: string };

async function currentUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return { name: session.user.name ?? null, isAdmin: session.user.role === "ADMIN" };
}

function revalidateAll(id?: string) {
  for (const p of ["/ledger", "/accounts", "/bank", "/invoices", "/reports", "/"]) revalidatePath(p);
  if (id) revalidatePath(`/entry/${id}`);
}

// Evidence anyone may record. Business use, CIT and VAT are decisions the
// owner records (from the accountant's review); other roles keep what is set.
function parseReview(formData: FormData, type: string, amount: number, isAdmin: boolean, prev?: Decisions) {
  const str = (k: string) => ((formData.get(k) as string) || "").trim();
  const expense = type === "EXPENSE";
  const decide = (k: keyof Decisions) => (!expense ? "PENDING" : isAdmin ? str(k) || "PENDING" : prev?.[k] ?? "PENDING");
  const review = {
    docStatus: str("docStatus") || "PENDING",
    purposeStatus: decide("purposeStatus"),
    citStatus: decide("citStatus"),
    vatStatus: decide("vatStatus"),
    vatAmount: expense && str("vatAmount") ? parseFloat(str("vatAmount")) : null,
    reviewNote: str("reviewNote") || null,
  };
  const problem = reviewProblem({ type, amount, ...review });
  return problem ? { error: problem } : { review };
}

// Shared parsing for the income/expense form. Other movement kinds (transfers,
// capital, loans) are recorded on the Accounts page.
async function parseEntry(formData: FormData, isAdmin: boolean, prev?: Decisions) {
  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = (formData.get("currency") as string) || "VND";
  const dateStr = formData.get("date") as string;
  const accountId = formData.get("accountId") as string;

  if (type !== "INCOME" && type !== "EXPENSE") return { error: "Invalid entry type." };
  if (!(amount > 0) || !dateStr) return { error: "Enter a valid amount and date." };
  if (!CURRENCIES.includes(currency)) return { error: "Unsupported currency." };
  if (!accountId) return { error: "Choose the account the money moved through." };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { error: "Unknown account." };
  // A USD account only holds USD; a VND account can settle VND or USD amounts.
  if (account.currency === "USD" && currency !== "USD") return { error: `${account.name} is a USD account — enter the amount in USD.` };

  const fx = await resolveFx(currency, amount, formData);
  if (!fx.ok) return { error: fx.message };

  const r = parseReview(formData, type, amount, isAdmin, prev);
  if ("error" in r) return { error: r.error };

  const description = formData.get("description") as string;
  const invoiceNumber = formData.get("invoiceNumber") as string;
  const categoryId = formData.get("categoryId") as string;
  const projectId = formData.get("projectId") as string;
  const vendorId = formData.get("vendorId") as string;

  return {
    data: {
      type,
      amount,
      currency,
      exchangeRate: fx.exchangeRate,
      vndAmount: fx.vndAmount,
      rateSource: fx.rateSource,
      accountId,
      date: new Date(dateStr),
      description: description || null,
      invoiceNumber: invoiceNumber || null,
      categoryId: categoryId || null,
      projectId: projectId || null,
      vendorId: vendorId || null,
      ...r.review,
    },
  };
}

export async function createTransaction(formData: FormData) {
  const me = await currentUser();
  const parsed = await parseEntry(formData, me.isAdmin);
  if ("error" in parsed) return { success: false, message: parsed.error };

  // Created from a bank statement line: it must fit that line.
  const bankLineId = (formData.get("bankLineId") as string) || null;
  if (bankLineId) {
    const problem = await bankLinkProblem(bankLineId, [parsed.data]);
    if (problem) return { success: false, message: problem };
  }
  // Converted from a cost register item: once only.
  const costItemId = (formData.get("costItemId") as string) || null;
  if (costItemId) {
    if (parsed.data.type !== "EXPENSE") return { success: false, message: "A register item becomes an expense." };
    const problem = await costItemProblem(costItemId);
    if (problem) return { success: false, message: problem };
  }
  // Re-entered in place of a reversed posted entry.
  const correctionOfId = (formData.get("correctionOfId") as string) || null;
  if (correctionOfId) {
    const orig = await prisma.transaction.findUnique({ where: { id: correctionOfId }, include: { reversedBy: true } });
    if (!orig?.reversedBy) return { success: false, message: "Only a reversed entry can be re-entered as a correction." };
  }

  // The owner's entries count as reviewed; anyone else's wait for review.
  // Creating the expense and converting its register item happen together, so
  // two submits can't both turn the same receipt into an expense.
  let transaction;
  try {
    transaction = await prisma.$transaction(async (tx) => {
      const t = await tx.transaction.create({
        data: { ...parsed.data, bankLineId, correctionOfId, status: me.isAdmin ? "REVIEWED" : "DRAFT", createdBy: me.name },
      });
      await record([{ entityId: t.id, action: "CREATE", newValue: snapshot(t), reason: correctionOfId ? "Correction of a reversed entry" : null }], me.name, tx);
      if (costItemId) await convertCostItem(costItemId, t.id, me.name, tx);
      return t;
    });
  } catch (e) {
    if (e instanceof CostItemTaken) return { success: false, message: "That register item is already in the ledger or dismissed." };
    throw e;
  }

  await persistUploads(formData.getAll("files") as File[], { transactionId: transaction.id });
  revalidateAll();
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");

  // A transfer is two linked legs — delete both so money can't vanish from one side.
  const t = await prisma.transaction.findUnique({ where: { id } });
  if (!t) return;
  const legs = t.transferId ? await prisma.transaction.findMany({ where: { transferId: t.transferId } }) : [t];
  // Posted entries are corrected by reversal, never deleted.
  if (legs.some((l) => l.status === "POSTED")) throw new Error("Posted entries can't be deleted — reverse them instead.");
  const ids = legs.map((l) => l.id);

  // A register item that became this expense goes back to pending, keeping its receipts.
  await prisma.costItem.updateMany({ where: { transactionId: { in: ids } }, data: { status: "PENDING", transactionId: null } });
  await prisma.attachment.updateMany({ where: { transactionId: { in: ids }, costItemId: { not: null } }, data: { transactionId: null } });
  // Cascade-delete removes the Attachment rows; also remove the files from disk.
  const attachments = await prisma.attachment.findMany({ where: { transactionId: { in: ids } } });
  const invoices = await invoicesOf(ids); // payments being removed — their invoices reopen

  await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
  await record(legs.map((l) => ({ entityId: l.id, action: "DELETE", oldValue: snapshot(l) })), me.name);

  for (const a of attachments) await removeUploadFile(a.filePath);
  await refreshInvoiceStatus(invoices);
  revalidateAll();
}

export async function editTransaction(id: string, formData: FormData) {
  const me = await currentUser();
  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: { reversedBy: { select: { id: true } }, allocations: { include: { invoice: { select: { direction: true, currency: true } } } } },
  });
  if (!existing) return { success: false, message: "Not found." };
  if (existing.type !== "INCOME" && existing.type !== "EXPENSE") {
    return { success: false, message: "Edit transfers, capital and loans on the Accounts page." };
  }
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  // Posted: the money and classification are locked — only the evidence and
  // tax review (often decided after handover) and new attachments can change.
  if (existing.status === "POSTED") {
    // A reversal and the entry it cancels must keep mirroring each other.
    if (existing.reversalOfId || existing.reversedBy) return { success: false, message: "A reversed entry and its reversal can't change." };
    const r = parseReview(formData, existing.type, existing.amount, me.isAdmin, existing);
    if ("error" in r) return { success: false, message: r.error };
    // The VAT on a posted expense feeds the accountant's figures — the owner's to change.
    const review = me.isAdmin ? r.review : { ...r.review, vatAmount: existing.vatAmount };
    const problem = reviewProblem({ type: existing.type, amount: existing.amount, ...review });
    if (problem) return { success: false, message: problem };
    await prisma.transaction.update({ where: { id }, data: review });
    await record(diff(id, existing, review, reason), me.name);
    await persistUploads(formData.getAll("files") as File[], { transactionId: id });
    revalidateAll(id);
    return { success: true };
  }

  const parsed = await parseEntry(formData, me.isAdmin, existing);
  if ("error" in parsed) return { success: false, message: parsed.error };
  // An entry at the default rate keeps the rate it was booked at — editing it
  // doesn't re-price it at today's default.
  if (parsed.data.rateSource === "DEFAULT" && existing.rateSource === "DEFAULT" && parsed.data.currency === existing.currency) {
    parsed.data.exchangeRate = existing.exchangeRate;
  }
  // Payments linked to invoices must still fit them.
  if (existing.allocations.length) {
    const d = parsed.data;
    const allocated = existing.allocations.reduce((sum, a) => sum + a.amount, 0);
    const fits = allocated <= d.amount + EPS && existing.allocations.every((a) =>
      d.currency === a.invoice.currency && d.type === (a.kind === "FEE" || a.invoice.direction === "PAYABLE" ? "EXPENSE" : "INCOME"));
    if (!fits) return { success: false, message: "This entry settles an invoice — unlink it on the Invoices page before changing its amount, currency or type." };
  }
  if (existing.bankLineId) {
    const problem = await bankLinkProblem(existing.bankLineId, [parsed.data], [id]);
    if (problem) return { success: false, message: `This entry is matched to a bank statement line. ${problem} Unmatch it on the Bank page first.` };
  }

  // A reviewed entry changed by anyone but the owner goes back to draft.
  const data = { ...parsed.data, status: !me.isAdmin && existing.status === "REVIEWED" ? "DRAFT" : existing.status };
  await prisma.transaction.update({ where: { id }, data });
  await record(diff(id, existing, data, reason), me.name);
  await refreshInvoiceStatus(await invoicesOf([id]));

  // Append any newly attached receipts
  await persistUploads(formData.getAll("files") as File[], { transactionId: id });
  revalidateAll(id);
  return { success: true };
}

// The ids plus the other leg of any transfer among them — legs move together.
async function withLegs(ids: string[]) {
  const picked = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: { transferId: true } });
  const transferIds = picked.map((t) => t.transferId).filter((x): x is string => !!x);
  return prisma.transaction.findMany({ where: { OR: [{ id: { in: ids } }, { transferId: { in: transferIds } }] } });
}

// Admin: approve drafts.
export async function reviewEntries(ids: string[]) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  const drafts = (await withLegs(ids)).filter((t) => t.status === "DRAFT");
  await prisma.transaction.updateMany({ where: { id: { in: drafts.map((t) => t.id) } }, data: { status: "REVIEWED" } });
  await record(drafts.map((t) => ({ entityId: t.id, action: "REVIEW", field: "status", oldValue: "DRAFT", newValue: "REVIEWED" })), me.name);
  await refreshInvoiceStatus(await invoicesOf(drafts.map((t) => t.id))); // reviewed payments now settle their invoices
  revalidateAll(ids.length === 1 ? ids[0] : undefined);
  return { success: true, count: drafts.length };
}

// Admin: post (lock) reviewed entries — the chosen ones, or every reviewed
// entry dated up to and including `through` (e.g. a month end).
export async function postEntries(ids: string[] | null, through?: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  let entries;
  if (ids) entries = (await withLegs(ids)).filter((t) => t.status === "REVIEWED");
  else {
    if (!through || !/^\d{4}-\d{2}-\d{2}$/.test(through)) return { success: false, message: "Choose the date to post through.", count: 0 };
    const end = new Date(`${through}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    entries = await prisma.transaction.findMany({ where: { status: "REVIEWED", date: { lt: end } } });
  }
  await prisma.transaction.updateMany({ where: { id: { in: entries.map((t) => t.id) } }, data: { status: "POSTED" } });
  await record(entries.map((t) => ({ entityId: t.id, action: "POST", field: "status", oldValue: "REVIEWED", newValue: "POSTED" })), me.name);
  revalidateAll(ids?.length === 1 ? ids[0] : undefined);
  return { success: true, count: entries.length };
}

// Admin: correct a posted entry by cancelling it with a posted mirror image.
// Both stay on record; the corrected entry is then entered afresh.
export async function reverseEntry(id: string, reason: string) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  const why = reason?.trim();
  if (!why) return { success: false, message: "Give the reason for the correction." };
  const t = await prisma.transaction.findUnique({ where: { id }, include: { reversedBy: true } });
  if (!t || t.status !== "POSTED") return { success: false, message: "Only posted entries are reversed — change drafts and reviewed entries directly." };
  if (t.reversalOfId) return { success: false, message: "This is itself a reversal." };
  if (t.reversedBy) return { success: false, message: "This entry has already been reversed." };

  const legs = t.transferId ? await prisma.transaction.findMany({ where: { transferId: t.transferId } }) : [t];
  const invoices = await invoicesOf(legs.map((l) => l.id));
  const transferId = t.transferId ? randomUUID() : null;

  await prisma.$transaction(async (tx) => {
    const changes: Change[] = [];
    for (const l of legs) {
      // Its bank match and invoice links no longer hold — the corrected entry takes them.
      if (l.bankLineId) changes.push({ entityId: l.id, action: "UNMATCH", field: "bankLineId", oldValue: l.bankLineId, reason: why });
      for (const a of await tx.paymentAllocation.findMany({ where: { transactionId: l.id } })) {
        changes.push({ entityId: l.id, action: "UNLINK", field: "invoice", oldValue: `${a.invoiceId} ${a.kind} ${a.amount}`, reason: why });
      }
      await tx.paymentAllocation.deleteMany({ where: { transactionId: l.id } });
      await tx.transaction.update({ where: { id: l.id }, data: { bankLineId: null } });
      // A register item this expense came from is pending again, for the correction.
      const item = await tx.costItem.findUnique({ where: { transactionId: l.id } });
      if (item) {
        await tx.costItem.update({ where: { id: item.id }, data: { status: "PENDING", transactionId: null } });
        await tx.attachment.updateMany({ where: { costItemId: item.id, transactionId: l.id }, data: { transactionId: null } });
        changes.push({ entityId: l.id, action: "UNLINK", field: "costItem", oldValue: item.id, reason: why });
      }
      const rev = await tx.transaction.create({
        data: {
          type: l.type, date: l.date, currency: l.currency, exchangeRate: l.exchangeRate, rateSource: l.rateSource,
          amount: -l.amount, vndAmount: l.vndAmount === null ? null : -l.vndAmount,
          accountId: l.accountId, loanId: l.loanId, categoryId: l.categoryId, projectId: l.projectId, vendorId: l.vendorId,
          invoiceNumber: l.invoiceNumber, transferId,
          description: `Reversal: ${l.description ?? ""}`.trim(),
          docStatus: l.docStatus, purposeStatus: l.purposeStatus, citStatus: l.citStatus, vatStatus: l.vatStatus,
          vatAmount: l.vatAmount === null ? null : -l.vatAmount, reviewNote: why,
          status: "POSTED", createdBy: me.name, reversalOfId: l.id,
        },
      });
      changes.push({ entityId: l.id, action: "REVERSE", newValue: rev.id, reason: why }, { entityId: rev.id, action: "CREATE", newValue: snapshot(rev), reason: why });
    }
    await record(changes, me.name, tx);
  });
  await refreshInvoiceStatus(invoices);
  revalidateAll(id);
  return { success: true };
}

export async function deleteAttachment(id: string) {
  const me = await currentUser();
  const att = await prisma.attachment.findUnique({
    where: { id },
    include: {
      transaction: { select: { status: true, _count: { select: { attachments: true } }, allocations: { where: { kind: "FEE" }, select: { id: true } } } },
      costItem: { select: { status: true } },
    },
  });
  if (!att) return { success: true };
  // Evidence on a posted entry stays; more can be added.
  if (att.transaction?.status === "POSTED") return { success: false, message: "This entry is posted — its attachments are kept." };
  if (att.transactionId && att.costItemId) return { success: false, message: "This receipt belongs to a cost register item — it stays with the expense." };
  // A fee only counts against an invoice while it's evidenced.
  if (att.transaction?.allocations.length && att.transaction._count.attachments <= 1) {
    return { success: false, message: "This is the evidence for a fee on an invoice — unlink the fee first." };
  }
  // Staff may tidy drafts and pending register receipts; other evidence is the owner's call.
  const staffMay = att.transaction ? att.transaction.status === "DRAFT" : att.costItem?.status === "PENDING";
  if (!me.isAdmin && !staffMay) return { success: false, message: "Only the owner can remove this document." };

  await prisma.attachment.delete({ where: { id } });
  await removeUploadFile(att.filePath);
  if (att.transactionId) await record([{ entityId: att.transactionId, action: "UNLINK", field: "attachment", oldValue: att.fileName }], me.name);

  revalidatePath("/ledger");
  revalidatePath("/invoices");
  if (att.transactionId) revalidatePath(`/entry/${att.transactionId}`);
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  return { success: true };
}
