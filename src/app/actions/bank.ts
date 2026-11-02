"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { parseStatement, dedupeKeys, type ParsedStatement } from "@/lib/bank-statement";
import { bankLinkProblem, tolerance } from "@/lib/bank-match";
import { fmtMoney } from "@/lib/money";
import { record } from "@/lib/history";
import { parseAmount } from "@/lib/amount";
import { MAX_STATEMENT_BYTES, MAX_STATEMENT_MB } from "@/lib/statement-limit";
import { getT, type Translate } from "@/i18n/server";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const DAY = 86_400_000;

// An entry changed between the checks and the write; nothing was written.
class Changed extends Error {}
// A check repeated inside the write failed; `message` says why.
class Refused extends Error {}

function revalidateAll() {
  revalidatePath("/bank");
  revalidatePath("/ledger");
  revalidatePath("/accounts");
}

// Read the uploaded statement and find which of its lines are already imported.
async function readUpload(fd: FormData) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const t = await getT("bank");
  const file = fd.get("file");
  const accountId = fd.get("accountId") as string;
  if (!(file instanceof File) || file.size === 0) return { error: t("errors.chooseFile") };
  if (file.size > MAX_STATEMENT_BYTES) return { error: t("errors.fileTooBig", { mb: (file.size / 1048576).toFixed(1), max: MAX_STATEMENT_MB }) };
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { error: t("errors.chooseAccount") };
  if (account.type !== "BANK") return { error: t("errors.notBank", { account: account.name }) };

  const parsed = parseStatement(Buffer.from(await file.arrayBuffer()), t);
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.currency && parsed.currency !== account.currency) {
    return { error: t("errors.wrongCurrency", { statementCurrency: parsed.currency, account: account.name, accountCurrency: account.currency }) };
  }
  const keys = dedupeKeys(parsed.lines);
  const existing = new Set(
    (await prisma.bankLine.findMany({ where: { accountId, dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((l) => l.dedupeKey),
  );
  const inflows = parsed.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outflows = -parsed.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  return { user: session.user.name ?? null, fileName: file.name, account, parsed, keys, existing, inflows, outflows };
}

const periodFrom = (p: ParsedStatement) => p.periodFrom ?? p.lines[0].txnDate;

// A statement ending the day before this one starts closed at this one's
// opening balance (one of `openings`, the first shown in the message). Gaps and
// overlaps aren't checked: a gap may hold movements no imported statement
// shows, and overlapping lines are deduped.
async function continuityProblem(account: { id: string; currency: string }, from: Date, openings: number[], t: Translate) {
  if (openings.length === 0) return null;
  const prev = await prisma.bankStatement.findFirst({
    where: { accountId: account.id, periodTo: new Date(+from - DAY) }, orderBy: { createdAt: "desc" },
  });
  if (!prev || openings.some((n) => Math.abs(prev.closingBalance - n) <= tolerance(account.currency))) return null;
  return t("errors.openingNotPrevious", {
    opening: fmtMoney(openings[0], account.currency), previous: fmtMoney(prev.closingBalance, account.currency), date: iso(prev.periodTo),
  });
}

export async function previewStatement(fd: FormData) {
  const r = await readUpload(fd);
  if ("error" in r) return { success: false as const, message: r.error };
  const { parsed, keys, existing, inflows, outflows } = r;
  // Shown now, so the wrong file or account is caught before the balances are typed.
  const gap = await continuityProblem(r.account, periodFrom(parsed), parsed.shown.opening, await getT("bank"));
  if (gap) return { success: false as const, message: gap };
  return {
    success: true as const,
    preview: {
      sheet: parsed.sheet,
      columns: parsed.columns,
      count: parsed.lines.length,
      duplicates: keys.filter((k) => existing.has(k)).length,
      periodFrom: iso(parsed.periodFrom ?? parsed.lines[0].txnDate),
      periodTo: iso(parsed.periodTo ?? parsed.lines[parsed.lines.length - 1].txnDate),
      inflows,
      outflows,
      opening: parsed.opening,
      closing: parsed.closing,
      warnings: parsed.warnings,
      sample: parsed.lines.slice(0, 5).map((l) => ({
        date: iso(l.txnDate), reference: l.reference, amount: l.amount, details: l.counterparty ?? l.description,
      })),
    },
  };
}

export async function importStatement(fd: FormData) {
  const r = await readUpload(fd);
  if ("error" in r) return { success: false, message: r.error };
  const { account, parsed, keys, existing, inflows, outflows } = r;
  const t = await getT("bank");
  const opening = parseAmount(fd.get("opening"));
  const closing = parseAmount(fd.get("closing"));
  if (!Number.isFinite(opening) || !Number.isFinite(closing)) return { success: false, message: t("errors.enterBalances") };
  const f = (n: number) => fmtMoney(n, account.currency);
  const tol = tolerance(account.currency);

  // Typed balances are the ones the file shows, when it shows any.
  const differs = (typed: number, shown: number[]) => shown.length > 0 && shown.every((n) => Math.abs(n - typed) > tol);
  if (differs(opening, parsed.shown.opening)) return { success: false, message: t("errors.openingNotFile", { typed: f(opening), file: f(parsed.opening!) }) };
  if (differs(closing, parsed.shown.closing)) return { success: false, message: t("errors.closingNotFile", { typed: f(closing), file: f(parsed.closing!) }) };
  const gap = await continuityProblem(account, periodFrom(parsed), [opening], t);
  if (gap) return { success: false, message: gap };

  // The file must add up before anything is saved.
  const expected = opening + inflows - outflows;
  if (Math.abs(expected - closing) > tol) {
    return {
      success: false,
      message: t("errors.doesNotAddUp", { opening: f(opening), inflows: f(inflows), outflows: f(outflows), expected: f(expected), closing: f(closing) }),
    };
  }

  const fresh = parsed.lines.map((l, i) => ({ l, key: keys[i] })).filter(({ key }) => !existing.has(key));
  if (fresh.length === 0) return { success: true, added: 0, skipped: parsed.lines.length };

  await prisma.$transaction(async (tx) => {
    const st = await tx.bankStatement.create({
      data: {
        accountId: account.id,
        fileName: r.fileName,
        periodFrom: periodFrom(parsed),
        periodTo: parsed.periodTo ?? parsed.lines[parsed.lines.length - 1].txnDate,
        openingBalance: opening,
        closingBalance: closing,
        inflows,
        outflows,
        lineCount: parsed.lines.length,
        importedBy: r.user,
      },
    });
    await tx.bankLine.createMany({
      data: fresh.map(({ l, key }) => ({
        accountId: account.id,
        statementId: st.id,
        txnDate: l.txnDate,
        postingDate: l.postingDate,
        reference: l.reference,
        amount: l.amount,
        balance: l.balance,
        counterparty: l.counterparty,
        description: l.description,
        locator: `${r.fileName} · ${parsed.sheet} · row ${l.row}`,
        dedupeKey: key,
      })),
    });
  });
  revalidateAll();
  return { success: true, added: fresh.length, skipped: parsed.lines.length - fresh.length };
}

// Reconcile a bank line to one or more ledger entries (their total can't exceed the line).
export async function matchLine(lineId: string, transactionIds: string[]) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const t = await getT("bank");
  if (transactionIds.length === 0) return { success: false, message: t("errors.chooseEntry") };
  // A receipt and the bank fee withheld from it reach the bank as one net line.
  const picked = await prisma.transaction.findMany({
    where: { id: { in: transactionIds } }, select: { deductedFromId: true, deductedFee: { select: { id: true } } },
  });
  const partners = picked.flatMap((p) => [p.deductedFromId, p.deductedFee?.id]).filter((x): x is string => !!x);
  const ids = [...new Set([...transactionIds, ...partners])];

  const isAdmin = session.user.role === "ADMIN";
  const entries = await prisma.transaction.findMany({ where: { id: { in: ids } }, include: { reversedBy: { select: { id: true } } } });
  if (entries.length !== ids.length) return { success: false, message: t("errors.entryGone") };
  const blocked = unmatchable(entries, lineId, t, isAdmin);
  if (blocked) return { success: false, message: blocked };
  const problem = await bankLinkProblem(lineId, entries.filter((e) => e.bankLineId !== lineId));
  if (problem) return { success: false, message: problem };

  // Matched only while every entry is still matchable: one rejected, reversed,
  // posted (for staff) or matched elsewhere since the checks above, or another
  // match filling the line meanwhile, leaves everything as it was.
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: {
          id: { in: ids }, status: { not: "REJECTED" }, reversedBy: { is: null }, OR: [{ bankLineId: null }, { bankLineId: lineId }],
          ...(isAdmin ? {} : { AND: [{ OR: [{ status: { not: "POSTED" } }, { bankLineId: lineId }] }] }),
        },
        data: { bankLineId: lineId },
      });
      if (count !== ids.length) throw new Changed();
      // Everything now on the line, this match included, must still fit it.
      const over = await bankLinkProblem(lineId, [], [], tx);
      if (over) throw new Refused(over);
      await record(entries.filter((e) => e.bankLineId !== lineId).map((e) => ({ entityId: e.id, action: "MATCH", field: "bankLineId", newValue: lineId })), session.user.name, tx);
    });
  } catch (e) {
    if (e instanceof Refused) return { success: false, message: e.message };
    if (!(e instanceof Changed)) throw e;
    const now = await prisma.transaction.findMany({ where: { id: { in: ids } }, include: { reversedBy: { select: { id: true } } } });
    const message = now.length !== ids.length ? t("errors.entryGone") : unmatchable(now, lineId, t, isAdmin);
    return { success: false, message: message ?? (await getT("common"))("errors.somethingWrong") };
  }
  revalidateAll();
  return { success: true };
}

// Why these entries can't be matched to the line, or null. Only the owner
// matches posted entries — only the owner can unmatch them.
function unmatchable(
  entries: { reversalOfId: string | null; reversedBy: unknown; status: string; bankLineId: string | null; description: string | null }[],
  lineId: string, t: Translate, isAdmin: boolean,
) {
  if (entries.some((e) => e.reversalOfId || e.reversedBy)) return t("errors.reversed");
  if (entries.some((e) => e.status === "REJECTED")) return t("errors.rejected");
  const taken = entries.find((e) => e.bankLineId && e.bankLineId !== lineId);
  if (taken) return taken.description !== null ? t("errors.alreadyMatched", { name: taken.description }) : t("errors.alreadyMatchedUnnamed");
  if (!isAdmin && entries.some((e) => e.status === "POSTED" && e.bankLineId !== lineId)) return t("errors.postedMatch");
  return null;
}

export async function unmatchEntry(transactionId: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const tb = await getT("bank");
  const t = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { deductedFee: true, deductedFrom: true } });
  if (!t?.bankLineId) { revalidateAll(); return { success: true }; } // already unmatched: show the page as it is
  // A receipt and its withheld fee leave the line together.
  const unit = [t, t.deductedFee, t.deductedFrom].filter((x): x is NonNullable<typeof x> => !!x && x.bankLineId === t.bankLineId);
  const isAdmin = session.user.role === "ADMIN";
  if (unit.some((x) => x.status === "POSTED") && !isAdmin) return { success: false, message: tb("errors.postedUnmatch") };
  // Cleared only while still on that line and, for staff, not posted since the check above.
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.transaction.updateMany({
        where: { id: { in: unit.map((x) => x.id) }, bankLineId: t.bankLineId, ...(isAdmin ? {} : { status: { not: "POSTED" } }) },
        data: { bankLineId: null },
      });
      if (count !== unit.length) throw new Changed();
      await record(unit.map((x) => ({ entityId: x.id, action: "UNMATCH", field: "bankLineId", oldValue: x.bankLineId })), session.user.name, tx);
    });
  } catch (e) {
    if (!(e instanceof Changed)) throw e;
    const posted = !isAdmin && (await prisma.transaction.count({ where: { id: { in: unit.map((x) => x.id) }, status: "POSTED" } })) > 0;
    return { success: false, message: posted ? tb("errors.postedUnmatch") : (await getT("common"))("errors.somethingWrong") };
  }
  revalidateAll();
  return { success: true };
}

// Undo an import (admin) — only while none of its lines are matched.
export async function deleteStatement(id: string) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const t = await getT("bank");
  const matched = await prisma.transaction.count({ where: { bankLine: { statementId: id } } });
  if (matched > 0) return { success: false, message: t("errors.statementMatched") };
  // Lines belong to the import that brought them in first; a later, overlapping
  // statement skipped them as duplicates and would lose them.
  const st = await prisma.bankStatement.findUnique({ where: { id } });
  if (!st) { revalidateAll(); return { success: true }; } // already gone
  const overlap = await prisma.bankStatement.count({ where: { id: { not: id }, accountId: st.accountId, periodFrom: { lte: st.periodTo }, periodTo: { gte: st.periodFrom } } });
  if (overlap > 0) return { success: false, message: t("errors.statementOverlaps") };
  await prisma.bankStatement.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
