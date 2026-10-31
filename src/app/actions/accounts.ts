"use server";

import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { defaultUsdRate } from "@/lib/fx";
import { bankLinkProblem } from "@/lib/bank-match";
import { EPS } from "@/lib/money";
import { diff, record, snapshot } from "@/lib/history";
import { getT, type Translate } from "@/i18n/server";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return { name: session.user.name ?? null, isAdmin: session.user.role === "ADMIN" };
}

// The owner's entries count as reviewed; anyone else's wait for review.
const startStatus = (me: { isAdmin: boolean }) => (me.isAdmin ? "REVIEWED" : "DRAFT");
// A reviewed entry changed by anyone but the owner goes back to draft.
// Anyone but the owner changing a reviewed or rejected movement sends it (back) for review.
const nextStatus = (me: { isAdmin: boolean }, status: string) => (!me.isAdmin && (status === "REVIEWED" || status === "REJECTED") ? "DRAFT" : status);
const reasonOf = (fd: FormData) => ((fd.get("reason") as string) || "").trim() || null;

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
}

function revalidateAll() {
  revalidatePath("/accounts");
  revalidatePath("/ledger");
  revalidatePath("/bank");
  revalidatePath("/");
}

// A movement matched to a bank statement line must still fit that line.
async function stillFits(leg: { id: string; bankLineId: string | null }, data: Parameters<typeof bankLinkProblem>[1][number]) {
  if (!leg.bankLineId) return null;
  const problem = await bankLinkProblem(leg.bankLineId, [data], [leg.id]);
  if (!problem) return null;
  const t = await getT("accounts");
  return t("errors.bankMatched", { problem });
}

const ACCOUNT_TYPES = ["BANK", "CASH", "OWNER", "TERM_DEPOSIT"];
const MOVEMENT_TYPES = ["CAPITAL_IN", "LOAN_IN", "LOAN_REPAY", "OTHER_IN", "OTHER_OUT"];
const LOAN_TYPES = ["LOAN_IN", "LOAN_REPAY"];

// ---- Accounts (admin) -------------------------------------------------------

export async function saveAccount(id: string | null, formData: FormData) {
  await requireAdmin();
  const t = await getT("accounts");
  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const currency = formData.get("currency") === "USD" ? "USD" : "VND";
  const openingBalance = parseFloat((formData.get("openingBalance") as string) || "0");
  const openingStr = formData.get("openingDate") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return { success: false, message: t("errors.nameRequired") };
  if (!ACCOUNT_TYPES.includes(type)) return { success: false, message: t("errors.chooseType") };
  if (isNaN(openingBalance)) return { success: false, message: t("errors.invalidOpeningBalance") };

  const data = {
    name, type, currency, openingBalance, notes,
    openingDate: openingStr ? new Date(openingStr) : null,
    isActive: formData.get("isActive") !== "false",
  };

  if (id) {
    const existing = await prisma.account.findUnique({ where: { id }, include: { _count: { select: { transactions: true, bankLines: true } } } });
    if (!existing) return { success: false, message: (await getT("common"))("errors.notFound") };
    if (existing.currency !== currency && existing._count.transactions + existing._count.bankLines > 0) {
      return { success: false, message: t("errors.currencyLocked") };
    }
    await prisma.account.update({ where: { id }, data });
  } else {
    await prisma.account.create({ data });
  }
  revalidateAll();
  return { success: true };
}

// ---- Loans ------------------------------------------------------------------

export async function createLoan(formData: FormData) {
  await requireUser();
  const t = await getT("accounts");
  const lender = (formData.get("lender") as string)?.trim();
  const currency = formData.get("currency") === "USD" ? "USD" : "VND";
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!lender) return { success: false, message: t("errors.lenderRequired") };

  await prisma.loan.create({ data: { lender, currency, notes } });
  revalidateAll();
  return { success: true };
}

// ---- Capital, loan and unclassified movements -------------------------------

async function parseMovement(formData: FormData, t: Translate) {
  const type = formData.get("type") as string;
  const accountId = formData.get("accountId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const dateStr = formData.get("date") as string;
  const loanId = (formData.get("loanId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;

  if (!MOVEMENT_TYPES.includes(type)) return { error: t("errors.chooseMovementKind") };
  if (!(amount > 0) || !dateStr) return { error: t("errors.invalidAmountDate") };
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { error: t("errors.chooseAccount") };

  const isLoan = LOAN_TYPES.includes(type);
  if (isLoan) {
    const loan = loanId ? await prisma.loan.findUnique({ where: { id: loanId } }) : null;
    if (!loan) return { error: t("errors.chooseLoan") };
    if (loan.currency !== account.currency) return { error: t("errors.loanCurrency", { currency: loan.currency }) };
  }

  // Financing movements stay in the account's own currency (USD valued at the default rate).
  const usd = account.currency === "USD";
  return {
    data: {
      type, amount, accountId, description,
      date: new Date(dateStr),
      currency: account.currency,
      exchangeRate: usd ? await defaultUsdRate() : 1,
      vndAmount: null,
      rateSource: usd ? "DEFAULT" : null,
      loanId: isLoan ? loanId : null,
    },
  };
}

export async function recordMovement(formData: FormData) {
  const me = await requireUser();
  const parsed = await parseMovement(formData, await getT("accounts"));
  if ("error" in parsed) return { success: false, message: parsed.error };
  // The entry and its history are saved together, or neither is.
  await prisma.$transaction(async (tx) => {
    const t = await tx.transaction.create({ data: { ...parsed.data, status: startStatus(me), createdBy: me.name } });
    await record([{ entityId: t.id, action: "CREATE", newValue: snapshot(t) }], me.name, tx);
  });
  revalidateAll();
  return { success: true };
}

// What to say when a guarded write found an entry changed: posted means
// locked; rejected, reviewed or deleted meanwhile means reload and try again.
async function changedText(ids: string[], locked: string) {
  const posted = await prisma.transaction.count({ where: { id: { in: ids }, status: "POSTED" } });
  return posted > 0 ? locked : (await getT("common"))("errors.somethingWrong");
}

export async function updateMovement(id: string, formData: FormData) {
  const me = await requireUser();
  const t = await getT("accounts");
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing || !MOVEMENT_TYPES.includes(existing.type)) return { success: false, message: (await getT("common"))("errors.notFound") };
  if (existing.status === "POSTED") return { success: false, message: t("errors.locked") };
  const parsed = await parseMovement(formData, t);
  if ("error" in parsed) return { success: false, message: parsed.error };
  // Editing never re-prices a movement at today's default: in the same
  // currency it keeps the rate it was booked at (revalueEntry changes it).
  if (parsed.data.currency === existing.currency && existing.currency !== "VND") {
    Object.assign(parsed.data, {
      exchangeRate: existing.exchangeRate, rateSource: existing.rateSource,
      vndAmount: existing.vndAmount === null ? null : Math.abs(parsed.data.amount - existing.amount) <= EPS ? existing.vndAmount : Math.round(parsed.data.amount * existing.exchangeRate),
    });
  }
  const problem = await stillFits(existing, parsed.data);
  if (problem) return { success: false, message: problem };
  const data = { ...parsed.data, status: nextStatus(me, existing.status) };
  // Saved only if the entry is still in the status it was read in: one posted
  // meanwhile stays as posted. The change and its history are saved together.
  const saved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.transaction.updateMany({ where: { id, status: existing.status }, data });
    if (count === 0) return false;
    await record(diff(id, existing, data, reasonOf(formData)), me.name, tx);
    return true;
  });
  if (!saved) return { success: false, message: await changedText([id], t("errors.locked")) };
  revalidateAll();
  return { success: true };
}

// ---- Internal transfers (two linked legs) -----------------------------------

async function parseTransfer(formData: FormData, t: Translate) {
  const fromId = formData.get("fromAccountId") as string;
  const toId = formData.get("toAccountId") as string;
  const amountOut = parseFloat(formData.get("amountOut") as string);
  const dateStr = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim() || null;

  if (!fromId || !toId || fromId === toId) return { error: t("errors.chooseTwoAccounts") };
  const [from, to] = await Promise.all([
    prisma.account.findUnique({ where: { id: fromId } }),
    prisma.account.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to) return { error: t("errors.unknownAccount") };
  if (!(amountOut > 0) || !dateStr) return { error: t("errors.invalidAmountDate") };

  const sameCurrency = from.currency === to.currency;
  const amountIn = sameCurrency ? amountOut : parseFloat(formData.get("amountIn") as string);
  if (!(amountIn > 0)) return { error: t("errors.amountArrived", { currency: to.currency }) };

  // A cross-currency transfer carries its own rate, implied by the two sides
  // (e.g. 1,100 USD → 28,374,500 VND = 25,795 VND/USD), never the global default.
  let rate = 1;
  let vnd: number | null = null;
  let source: string | null = null;
  if (!sameCurrency) {
    const usdAmt = from.currency === "USD" ? amountOut : amountIn;
    vnd = from.currency === "USD" ? amountIn : amountOut;
    rate = vnd / usdAmt;
    source = "BANK";
  } else if (from.currency === "USD") {
    rate = await defaultUsdRate();
    source = "DEFAULT";
  }

  const date = new Date(dateStr);
  const leg = (acc: { id: string; currency: string }, type: string, amount: number) => ({
    type, amount, date, description,
    accountId: acc.id,
    currency: acc.currency,
    exchangeRate: acc.currency === "USD" ? rate : 1,
    vndAmount: acc.currency === "USD" ? vnd : null,
    rateSource: acc.currency === "USD" ? source : null,
  });
  return { out: leg(from, "TRANSFER_OUT", amountOut), in: leg(to, "TRANSFER_IN", amountIn) };
}

export async function createTransfer(formData: FormData) {
  const me = await requireUser();
  const t = await getT("accounts");
  const parsed = await parseTransfer(formData, t);
  if ("error" in parsed) return { success: false, message: parsed.error };
  const transferId = randomUUID();
  const extra = { transferId, status: startStatus(me), createdBy: me.name };
  // Both legs and their history are saved together, or nothing is.
  await prisma.$transaction(async (tx) => {
    const legs = [
      await tx.transaction.create({ data: { ...parsed.out, ...extra } }),
      await tx.transaction.create({ data: { ...parsed.in, ...extra } }),
    ];
    await record(legs.map((t) => ({ entityId: t.id, action: "CREATE", newValue: snapshot(t) })), me.name, tx);
  });
  revalidateAll();
  return { success: true };
}

// A leg's status changed between reading and saving it (e.g. it was posted).
class ChangedMeanwhile extends Error {}

export async function updateTransfer(transferId: string, formData: FormData) {
  const me = await requireUser();
  const t = await getT("accounts");
  const legs = await prisma.transaction.findMany({ where: { transferId } });
  const outLeg = legs.find((l) => l.type === "TRANSFER_OUT");
  const inLeg = legs.find((l) => l.type === "TRANSFER_IN");
  if (!outLeg || !inLeg) return { success: false, message: t("errors.transferNotFound") };
  if (outLeg.status === "POSTED" || inLeg.status === "POSTED") return { success: false, message: t("errors.locked") };

  const parsed = await parseTransfer(formData, t);
  if ("error" in parsed) return { success: false, message: parsed.error };
  // A same-currency USD transfer was valued at the default rate of its day:
  // editing it keeps that rate rather than re-pricing it at today's.
  for (const [leg, next] of [[outLeg, parsed.out], [inLeg, parsed.in]] as const) {
    if (leg.currency === next.currency && next.rateSource === "DEFAULT" && leg.rateSource === "DEFAULT") next.exchangeRate = leg.exchangeRate;
  }
  const problem = (await stillFits(outLeg, parsed.out)) ?? (await stillFits(inLeg, parsed.in));
  if (problem) return { success: false, message: problem };
  const out = { ...parsed.out, status: nextStatus(me, outLeg.status) };
  const inn = { ...parsed.in, status: nextStatus(me, inLeg.status) };
  // Each leg is saved only if it is still in the status it was read in; if
  // either was posted meanwhile, nothing is saved. History goes with the change.
  try {
    await prisma.$transaction(async (tx) => {
      for (const [leg, data] of [[outLeg, out], [inLeg, inn]] as const) {
        const { count } = await tx.transaction.updateMany({ where: { id: leg.id, status: leg.status }, data });
        if (count === 0) throw new ChangedMeanwhile();
      }
      await record([...diff(outLeg.id, outLeg, out, reasonOf(formData)), ...diff(inLeg.id, inLeg, inn, reasonOf(formData))], me.name, tx);
    });
  } catch (e) {
    if (e instanceof ChangedMeanwhile) return { success: false, message: await changedText([outLeg.id, inLeg.id], t("errors.locked")) };
    throw e;
  }
  revalidateAll();
  return { success: true };
}
