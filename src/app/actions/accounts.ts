"use server";

import { randomUUID } from "crypto";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { defaultUsdRate } from "@/lib/fx";
import { bankLinkProblem } from "@/lib/bank-match";

async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
}

async function requireAdmin() {
  const session = await auth();
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
  return problem ? `This is matched to a bank statement line. ${problem} Unmatch it on the Bank page first.` : null;
}

const ACCOUNT_TYPES = ["BANK", "CASH", "OWNER", "TERM_DEPOSIT"];
const MOVEMENT_TYPES = ["CAPITAL_IN", "LOAN_IN", "LOAN_REPAY", "OTHER_IN", "OTHER_OUT"];
const LOAN_TYPES = ["LOAN_IN", "LOAN_REPAY"];

// ---- Accounts (admin) -------------------------------------------------------

export async function saveAccount(id: string | null, formData: FormData) {
  await requireAdmin();
  const name = (formData.get("name") as string)?.trim();
  const type = formData.get("type") as string;
  const currency = formData.get("currency") === "USD" ? "USD" : "VND";
  const openingBalance = parseFloat((formData.get("openingBalance") as string) || "0");
  const openingStr = formData.get("openingDate") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!name) return { success: false, message: "Account name is required." };
  if (!ACCOUNT_TYPES.includes(type)) return { success: false, message: "Choose an account type." };
  if (isNaN(openingBalance)) return { success: false, message: "Enter a valid opening balance." };

  const data = {
    name, type, currency, openingBalance, notes,
    openingDate: openingStr ? new Date(openingStr) : null,
    isActive: formData.get("isActive") !== "false",
  };

  if (id) {
    const existing = await prisma.account.findUnique({ where: { id }, include: { _count: { select: { transactions: true } } } });
    if (!existing) return { success: false, message: "Not found." };
    if (existing.currency !== currency && existing._count.transactions > 0) {
      return { success: false, message: "This account already has movements, so its currency can't change." };
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
  const lender = (formData.get("lender") as string)?.trim();
  const currency = formData.get("currency") === "USD" ? "USD" : "VND";
  const notes = (formData.get("notes") as string)?.trim() || null;
  if (!lender) return { success: false, message: "Who is the lender?" };

  await prisma.loan.create({ data: { lender, currency, notes } });
  revalidateAll();
  return { success: true };
}

// ---- Capital, loan and unclassified movements -------------------------------

async function parseMovement(formData: FormData) {
  const type = formData.get("type") as string;
  const accountId = formData.get("accountId") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const dateStr = formData.get("date") as string;
  const loanId = (formData.get("loanId") as string) || null;
  const description = (formData.get("description") as string)?.trim() || null;

  if (!MOVEMENT_TYPES.includes(type)) return { error: "Choose what kind of movement this is." };
  if (!(amount > 0) || !dateStr) return { error: "Enter a valid amount and date." };
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { error: "Choose an account." };

  const isLoan = LOAN_TYPES.includes(type);
  if (isLoan) {
    const loan = loanId ? await prisma.loan.findUnique({ where: { id: loanId } }) : null;
    if (!loan) return { error: "Choose which loan this belongs to." };
    if (loan.currency !== account.currency) return { error: `That loan is in ${loan.currency} — use a ${loan.currency} account.` };
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
  await requireUser();
  const parsed = await parseMovement(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };
  await prisma.transaction.create({ data: parsed.data });
  revalidateAll();
  return { success: true };
}

export async function updateMovement(id: string, formData: FormData) {
  await requireUser();
  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing || !MOVEMENT_TYPES.includes(existing.type)) return { success: false, message: "Not found." };
  const parsed = await parseMovement(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };
  const problem = await stillFits(existing, parsed.data);
  if (problem) return { success: false, message: problem };
  await prisma.transaction.update({ where: { id }, data: parsed.data });
  revalidateAll();
  return { success: true };
}

// ---- Internal transfers (two linked legs) -----------------------------------

async function parseTransfer(formData: FormData) {
  const fromId = formData.get("fromAccountId") as string;
  const toId = formData.get("toAccountId") as string;
  const amountOut = parseFloat(formData.get("amountOut") as string);
  const dateStr = formData.get("date") as string;
  const description = (formData.get("description") as string)?.trim() || null;

  if (!fromId || !toId || fromId === toId) return { error: "Choose two different accounts." };
  const [from, to] = await Promise.all([
    prisma.account.findUnique({ where: { id: fromId } }),
    prisma.account.findUnique({ where: { id: toId } }),
  ]);
  if (!from || !to) return { error: "Unknown account." };
  if (!(amountOut > 0) || !dateStr) return { error: "Enter a valid amount and date." };

  const sameCurrency = from.currency === to.currency;
  const amountIn = sameCurrency ? amountOut : parseFloat(formData.get("amountIn") as string);
  if (!(amountIn > 0)) return { error: `Enter the ${to.currency} amount that arrived.` };

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
  await requireUser();
  const parsed = await parseTransfer(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };
  const transferId = randomUUID();
  await prisma.$transaction([
    prisma.transaction.create({ data: { ...parsed.out, transferId } }),
    prisma.transaction.create({ data: { ...parsed.in, transferId } }),
  ]);
  revalidateAll();
  return { success: true };
}

export async function updateTransfer(transferId: string, formData: FormData) {
  await requireUser();
  const legs = await prisma.transaction.findMany({ where: { transferId } });
  const outLeg = legs.find((l) => l.type === "TRANSFER_OUT");
  const inLeg = legs.find((l) => l.type === "TRANSFER_IN");
  if (!outLeg || !inLeg) return { success: false, message: "Transfer not found." };

  const parsed = await parseTransfer(formData);
  if ("error" in parsed) return { success: false, message: parsed.error };
  const problem = (await stillFits(outLeg, parsed.out)) ?? (await stillFits(inLeg, parsed.in));
  if (problem) return { success: false, message: problem };
  await prisma.$transaction([
    prisma.transaction.update({ where: { id: outLeg.id }, data: parsed.out }),
    prisma.transaction.update({ where: { id: inLeg.id }, data: parsed.in }),
  ]);
  revalidateAll();
  return { success: true };
}
