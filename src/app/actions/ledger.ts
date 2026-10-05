"use server";

import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { persistUploads, removeUploadFile } from "@/lib/uploads";
import { resolveFx } from "@/lib/fx";
import { CURRENCIES, EPS } from "@/lib/money";
import { refreshInvoiceStatus, invoicesOf } from "@/lib/invoice-status";
import { reviewProblem, type ReviewProblem } from "@/lib/review";
import { getT } from "@/i18n/server";
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

// A review problem as a message in the user's language.
async function problemText(problem: ReviewProblem) {
  return (await getT("common"))(`review.problem.${problem}`);
}

// Shared parsing for the income/expense form. Other movement kinds (transfers,
// capital, loans) are recorded on the Accounts page.
type Booked = { currency: string; amount: number; exchangeRate: number; vndAmount: number | null; rateSource: string | null };

// Changes that alter the books. A note, an invoice number, evidence or the
// tax-review fields never take a reviewed entry out of the balances.
const BOOKS_FIELDS = new Set(["type", "date", "amount", "currency", "exchangeRate", "vndAmount", "rateSource", "accountId", "loanId", "categoryId", "projectId", "vendorId"]);

// The VND value an entry was booked at stays when it is edited in the same
// currency: notes, category, project or files never re-price it, and a changed
// amount is valued at the booked rate. Only revalueEntry changes the rate.
function keptFx(booked: Booked, amount: number) {
  return {
    ok: true as const,
    exchangeRate: booked.exchangeRate,
    rateSource: booked.rateSource,
    vndAmount: booked.vndAmount === null ? null : Math.abs(amount - booked.amount) <= EPS ? booked.vndAmount : Math.round(amount * booked.exchangeRate),
  };
}

async function parseEntry(formData: FormData, isAdmin: boolean, prev?: Decisions, booked?: Booked) {
  const type = formData.get("type") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const currency = (formData.get("currency") as string) || "VND";
  const dateStr = formData.get("date") as string;
  const accountId = formData.get("accountId") as string;
  const t = await getT("ledger");

  if (type !== "INCOME" && type !== "EXPENSE") return { error: t("errors.invalidType") };
  if (!(amount > 0) || !dateStr) return { error: t("errors.amountDate") };
  if (!CURRENCIES.includes(currency)) return { error: t("errors.currency") };
  if (!accountId) return { error: t("errors.chooseAccount") };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return { error: t("errors.unknownAccount") };
  // A USD account only holds USD; a VND account can settle VND or USD amounts.
  if (account.currency === "USD" && currency !== "USD") return { error: t("errors.usdAccount", { name: account.name }) };

  const fx = booked && booked.currency === currency && currency !== "VND" ? keptFx(booked, amount) : await resolveFx(currency, amount, formData);
  if (!fx.ok) return { error: fx.message };

  const r = parseReview(formData, type, amount, isAdmin, prev);
  if ("error" in r) return { error: await problemText(r.error as ReviewProblem) };

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
  const t = await getT("ledger");

  // Created from a bank statement line: it must fit that line.
  const bankLineId = (formData.get("bankLineId") as string) || null;
  if (bankLineId) {
    const problem = await bankLinkProblem(bankLineId, [parsed.data]);
    if (problem) return { success: false, message: problem };
  }
  // Converted from a cost register item: once only.
  const costItemId = (formData.get("costItemId") as string) || null;
  if (costItemId) {
    if (parsed.data.type !== "EXPENSE") return { success: false, message: t("errors.registerItemExpense") };
    const problem = await costItemProblem(costItemId);
    if (problem) return { success: false, message: problem };
  }
  // Re-entered in place of a reversed posted entry.
  const correctionOfId = (formData.get("correctionOfId") as string) || null;
  if (correctionOfId) {
    const orig = await prisma.transaction.findUnique({ where: { id: correctionOfId }, include: { reversedBy: true } });
    if (!orig?.reversedBy) return { success: false, message: t("errors.correctionNeedsReversal") };
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
    if (e instanceof CostItemTaken) return { success: false, message: t("errors.registerItemTaken") };
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
  // A receipt takes the bank fee withheld from it along; a fee alone can go.
  legs.push(...(await prisma.transaction.findMany({ where: { deductedFromId: { in: legs.map((l) => l.id) } } })));
  // Posted entries are corrected by reversal, never deleted.
  if (legs.some((l) => l.status === "POSTED")) throw new Error("Posted entries can't be deleted — reverse them instead.");
  const ids = legs.map((l) => l.id);

  // A register item that became this expense goes back to pending, keeping its receipts.
  await prisma.costItem.updateMany({ where: { transactionId: { in: ids } }, data: { status: "PENDING", transactionId: null } });
  await prisma.attachment.updateMany({ where: { transactionId: { in: ids }, costItemId: { not: null } }, data: { transactionId: null } });
  // Cascade-delete removes the Attachment rows; also remove the files from disk.
  const attachments = await prisma.attachment.findMany({ where: { transactionId: { in: ids } } });
  const invoices = await invoicesOf(ids); // payments being removed — their invoices reopen

  // A line that no longer adds up without them (a receipt left behind by its
  // deleted fee) loses its remaining matches too, so it shows as open again.
  const unmatch: Change[] = [];
  for (const lineId of new Set(legs.map((l) => l.bankLineId).filter((x): x is string => !!x))) {
    if (await bankLinkProblem(lineId, [], ids)) {
      const rest = await prisma.transaction.findMany({ where: { bankLineId: lineId, id: { notIn: ids } }, select: { id: true } });
      await prisma.transaction.updateMany({ where: { id: { in: rest.map((r) => r.id) } }, data: { bankLineId: null } });
      unmatch.push(...rest.map((r) => ({ entityId: r.id, action: "UNMATCH", field: "bankLineId", oldValue: lineId, reason: "matched entry deleted" })));
    }
  }

  await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
  await record([...legs.map((l) => ({ entityId: l.id, action: "DELETE", oldValue: snapshot(l) })), ...unmatch], me.name);

  for (const a of attachments) await removeUploadFile(a.filePath);
  await refreshInvoiceStatus(invoices);
  revalidateAll();
}

export async function editTransaction(id: string, formData: FormData) {
  const me = await currentUser();
  const existing = await prisma.transaction.findUnique({
    where: { id },
    include: {
      reversedBy: { select: { id: true } }, deductedFee: { select: { id: true } },
      allocations: { include: { invoice: { select: { direction: true, currency: true } } } },
    },
  });
  if (!existing) {
    const tc = await getT("common");
    return { success: false, message: tc("errors.notFound") };
  }
  const t = await getT("ledger");
  if (existing.type !== "INCOME" && existing.type !== "EXPENSE") {
    return { success: false, message: t("errors.editOnAccounts") };
  }
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  // Posted: the money and classification are locked — only the evidence and
  // tax review (often decided after handover) and new attachments can change.
  if (existing.status === "POSTED") {
    // A reversal and the entry it cancels must keep mirroring each other.
    if (existing.reversalOfId || existing.reversedBy) return { success: false, message: t("errors.reversedLocked") };
    const r = parseReview(formData, existing.type, existing.amount, me.isAdmin, existing);
    if ("error" in r) return { success: false, message: await problemText(r.error as ReviewProblem) };
    // The VAT on a posted expense feeds the accountant's figures — the owner's to change.
    const review = me.isAdmin ? r.review : { ...r.review, vatAmount: existing.vatAmount };
    const problem = reviewProblem({ type: existing.type, amount: existing.amount, ...review });
    if (problem) return { success: false, message: await problemText(problem) };
    await prisma.transaction.update({ where: { id }, data: review });
    await record(diff(id, existing, review, reason), me.name);
    await persistUploads(formData.getAll("files") as File[], { transactionId: id });
    revalidateAll(id);
    return { success: true };
  }

  const parsed = await parseEntry(formData, me.isAdmin, existing, existing);
  if ("error" in parsed) return { success: false, message: parsed.error };
  // Payments linked to invoices must still fit them.
  if (existing.allocations.length) {
    const d = parsed.data;
    const allocated = existing.allocations.reduce((sum, a) => sum + a.amount, 0);
    const fits = allocated <= d.amount + EPS && existing.allocations.every((a) =>
      d.currency === a.invoice.currency && d.type === (a.kind === "FEE" || a.invoice.direction === "PAYABLE" ? "EXPENSE" : "INCOME"));
    if (!fits) return { success: false, message: t("errors.settlesInvoice") };
  }
  // A receipt and the fee withheld from it stay one type each, in one account
  // and currency; the fee keeps its receipt's date and project, and both
  // keep a positive net.
  const fee = existing.deductedFee ? await prisma.transaction.findUnique({ where: { id: existing.deductedFee.id } }) : null;
  const receipt = existing.deductedFromId ? await prisma.transaction.findUnique({ where: { id: existing.deductedFromId } }) : null;
  if ((fee || receipt) && (parsed.data.accountId !== existing.accountId || parsed.data.currency !== existing.currency || parsed.data.type !== existing.type
    || (receipt && (+parsed.data.date !== +receipt.date || (parsed.data.projectId || null) !== receipt.projectId)))) {
    return { success: false, message: t("errors.feePairLocked") };
  }
  if ((fee && parsed.data.amount <= fee.amount + EPS) || (receipt && parsed.data.amount >= receipt.amount - EPS)) {
    return { success: false, message: t("errors.feeExceedsReceipt") };
  }
  if (existing.bankLineId) {
    const problem = await bankLinkProblem(existing.bankLineId, [{ ...parsed.data, id, deductedFromId: existing.deductedFromId }], [id]);
    if (problem) return { success: false, message: t("errors.bankLineMatched", { problem }) };
  }

  // A reviewed entry whose money or classification anyone but the owner
  // changes goes back to draft; a note or evidence alone keeps it booked.
  const booksChanged = diff(id, existing, parsed.data).some((c) => BOOKS_FIELDS.has(c.field!));
  const data = { ...parsed.data, status: !me.isAdmin && booksChanged && existing.status === "REVIEWED" ? "DRAFT" : existing.status };
  await prisma.transaction.update({ where: { id }, data });
  const changes = diff(id, existing, data, reason);
  // The partner moves with it: a fee takes its receipt's date, project and status.
  const partner = fee ?? receipt;
  if (partner) {
    const follow = { ...(fee ? { date: data.date, projectId: data.projectId ?? null } : {}), status: data.status === "DRAFT" && partner.status === "REVIEWED" ? "DRAFT" : partner.status };
    await prisma.transaction.update({ where: { id: partner.id }, data: follow });
    changes.push(...diff(partner.id, partner, follow, reason));
  }
  await record(changes, me.name);
  await refreshInvoiceStatus(await invoicesOf([id, ...(partner ? [partner.id] : [])]));

  // Append any newly attached receipts
  await persistUploads(formData.getAll("files") as File[], { transactionId: id });
  revalidateAll(id);
  return { success: true };
}

// Entries that move together: the two legs of a transfer, and a receipt with
// the bank fee withheld from it.
async function withLegs(ids: string[]) {
  const picked = await prisma.transaction.findMany({ where: { id: { in: ids } }, select: { transferId: true, deductedFromId: true } });
  const transferIds = picked.map((t) => t.transferId).filter((x): x is string => !!x);
  const receipts = [...ids, ...picked.map((t) => t.deductedFromId).filter((x): x is string => !!x)];
  return prisma.transaction.findMany({
    where: { OR: [{ id: { in: receipts } }, { transferId: { in: transferIds } }, { deductedFromId: { in: receipts } }] },
  });
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
    if (!through || !/^\d{4}-\d{2}-\d{2}$/.test(through)) {
      const t = await getT("ledger");
      return { success: false, message: t("errors.postThroughDate"), count: 0 };
    }
    const end = new Date(`${through}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    entries = await prisma.transaction.findMany({ where: { status: "REVIEWED", date: { lt: end } } });
  }
  // A receipt and the fee withheld from it are posted together or not at all.
  const posting = new Set(entries.map((t) => t.id));
  const partners = await prisma.transaction.findMany({
    where: { OR: [{ id: { in: entries.map((t) => t.deductedFromId).filter((x): x is string => !!x) } }, { deductedFromId: { in: [...posting] } }] },
    select: { id: true, status: true, deductedFromId: true },
  });
  entries = entries.filter((t) => {
    const p = partners.find((x) => (t.deductedFromId ? x.id === t.deductedFromId : x.deductedFromId === t.id));
    return !p || posting.has(p.id) || p.status === "POSTED";
  });
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
  const tl = await getT("ledger"); // `t` is the entry below
  const why = reason?.trim();
  if (!why) return { success: false, message: tl("errors.reasonRequired") };
  const t = await prisma.transaction.findUnique({ where: { id }, include: { reversedBy: true } });
  if (!t || t.status !== "POSTED") return { success: false, message: tl("errors.onlyPostedReversed") };
  if (t.reversalOfId) return { success: false, message: tl("errors.isReversal") };
  if (t.reversedBy) return { success: false, message: tl("errors.alreadyReversed") };

  // A receipt and its withheld fee are reversed together, receipt first.
  const legs = (await withLegs([id])).sort((a, b) => Number(!!a.deductedFromId) - Number(!!b.deductedFromId));
  const reversed = await prisma.transaction.count({ where: { reversalOfId: { in: legs.map((l) => l.id) } } });
  if (legs.some((l) => l.status !== "POSTED" || l.reversalOfId) || reversed > 0) return { success: false, message: tl("errors.pairNotPosted") };
  const invoices = await invoicesOf(legs.map((l) => l.id));
  const transferId = t.transferId ? randomUUID() : null;
  const reversalOf = new Map<string, string>(); // original id → its reversal

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
          description: tl("reverse.descPrefix", { description: l.description ?? "" }).trim(),
          docStatus: l.docStatus, purposeStatus: l.purposeStatus, citStatus: l.citStatus, vatStatus: l.vatStatus,
          vatAmount: l.vatAmount === null ? null : -l.vatAmount, reviewNote: why,
          status: "POSTED", createdBy: me.name, reversalOfId: l.id,
          deductedFromId: l.deductedFromId ? reversalOf.get(l.deductedFromId) ?? null : null,
        },
      });
      reversalOf.set(l.id, rev.id);
      changes.push({ entityId: l.id, action: "REVERSE", newValue: rev.id, reason: why }, { entityId: rev.id, action: "CREATE", newValue: snapshot(rev), reason: why });
    }
    await record(changes, me.name, tx);
  });
  await refreshInvoiceStatus(invoices);
  revalidateAll(id);
  return { success: true };
}

// Admin: revalue a recorded foreign-currency entry — the only way its VND
// value changes after it was booked. Needs a reason; the old and new VND value
// go into the change history. A receipt is revalued with the fee withheld from
// it (the bank's VND figure is then what it credited, the net). Posted entries
// are corrected by reversal instead; a transfer keeps the rate its two sides imply.
export async function revalueEntry(id: string, formData: FormData) {
  const me = await currentUser();
  if (!me.isAdmin) throw new Error("Unauthorized");
  const t = await getT("ledger");
  const reason = ((formData.get("reason") as string) || "").trim();
  if (!reason) return { success: false, message: t("errors.reasonRequired") };
  const e = await prisma.transaction.findUnique({ where: { id }, include: { deductedFee: true, reversedBy: { select: { id: true } } } });
  if (!e) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (e.currency === "VND") return { success: false, message: t("revalue.errors.vnd") };
  if (e.status === "POSTED") return { success: false, message: t("revalue.errors.posted") };
  if (e.reversalOfId || e.reversedBy) return { success: false, message: t("errors.reversedLocked") };
  if (e.transferId) return { success: false, message: t("revalue.errors.transfer") };
  if (e.deductedFromId) return { success: false, message: t("revalue.errors.fee") };

  const fee = e.deductedFee;
  if (fee && (fee.status === "POSTED" || fee.reversalOfId)) return { success: false, message: t("revalue.errors.posted") };
  // In an account kept in another currency (a USD receipt in a VND account), the
  // VND value is the bank movement itself: unmatch it before revaluing.
  if (e.bankLineId || fee?.bankLineId) {
    const acc = e.accountId ? await prisma.account.findUnique({ where: { id: e.accountId }, select: { currency: true } }) : null;
    if (acc && acc.currency !== e.currency) return { success: false, message: t("revalue.errors.matched") };
  }
  const net = e.amount - (fee?.amount ?? 0);
  const fx = await resolveFx(e.currency, net, formData);
  if (!fx.ok) return { success: false, message: fx.message };
  const vnd = fx.vndAmount === null ? null : fee ? Math.round(e.amount * fx.exchangeRate) : fx.vndAmount;
  const next = { exchangeRate: fx.exchangeRate, rateSource: fx.rateSource, vndAmount: vnd };
  const feeNext = fee ? { exchangeRate: fx.exchangeRate, rateSource: fx.rateSource, vndAmount: vnd === null || fx.vndAmount === null ? null : vnd - fx.vndAmount } : null;
  const value = (x: { amount: number; exchangeRate: number; vndAmount: number | null }) => Math.round(x.vndAmount ?? x.amount * x.exchangeRate);
  const before = value(e), after = value({ amount: e.amount, ...next });
  if (before === after && e.rateSource === next.rateSource) return { success: false, message: t("revalue.errors.unchanged") };
  if (e.bankLineId) {
    const problem = await bankLinkProblem(e.bankLineId, [{ ...e, ...next }, ...(fee && fee.bankLineId === e.bankLineId ? [{ ...fee, ...feeNext! }] : [])], [e.id, ...(fee ? [fee.id] : [])]);
    if (problem) return { success: false, message: t("errors.bankLineMatched", { problem }) };
  }

  await prisma.$transaction(async (tx) => {
    await tx.transaction.update({ where: { id: e.id }, data: next });
    const changes: Change[] = [
      ...diff(e.id, e, next, reason),
      { entityId: e.id, action: "REVALUE", field: "vndValue", oldValue: String(before), newValue: String(after), reason },
    ];
    if (fee && feeNext) {
      await tx.transaction.update({ where: { id: fee.id }, data: feeNext });
      changes.push(...diff(fee.id, fee, feeNext, reason),
        { entityId: fee.id, action: "REVALUE", field: "vndValue", oldValue: String(value(fee)), newValue: String(value({ amount: fee.amount, ...feeNext })), reason });
    }
    await record(changes, me.name, tx);
  });
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
  const t = await getT("ledger");
  // Evidence on a posted entry stays; more can be added.
  if (att.transaction?.status === "POSTED") return { success: false, message: t("errors.attachmentPosted") };
  if (att.transactionId && att.costItemId) return { success: false, message: t("errors.attachmentCostItem") };
  // A fee only counts against an invoice while it's evidenced.
  if (att.transaction?.allocations.length && att.transaction._count.attachments <= 1) {
    return { success: false, message: t("errors.attachmentFeeEvidence") };
  }
  // Staff may tidy drafts and pending register receipts; other evidence is the owner's call.
  const staffMay = att.transaction ? att.transaction.status === "DRAFT" : att.costItem?.status === "PENDING";
  if (!me.isAdmin && !staffMay) return { success: false, message: t("errors.attachmentOwnerOnly") };

  await prisma.attachment.delete({ where: { id } });
  await removeUploadFile(att.filePath);
  if (att.transactionId) await record([{ entityId: att.transactionId, action: "UNLINK", field: "attachment", oldValue: att.fileName }], me.name);

  revalidatePath("/ledger");
  revalidatePath("/invoices");
  if (att.transactionId) revalidatePath(`/entry/${att.transactionId}`);
  if (att.projectId) revalidatePath(`/projects/${att.projectId}`);
  return { success: true };
}
