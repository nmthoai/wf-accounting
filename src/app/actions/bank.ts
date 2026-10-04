"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { parseStatement, dedupeKeys } from "@/lib/bank-statement";
import { bankLinkProblem, tolerance } from "@/lib/bank-match";
import { fmtMoney } from "@/lib/money";
import { record } from "@/lib/history";

const iso = (d: Date) => d.toISOString().slice(0, 10);

function revalidateAll() {
  revalidatePath("/bank");
  revalidatePath("/ledger");
  revalidatePath("/accounts");
}

// Read the uploaded statement and find which of its lines are already imported.
async function readUpload(fd: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const file = fd.get("file");
  const accountId = fd.get("accountId") as string;
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the statement file." };
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (!account) return { error: "Choose which account this statement is for." };

  const parsed = parseStatement(Buffer.from(await file.arrayBuffer()));
  if ("error" in parsed) return { error: parsed.error };
  if (parsed.currency && parsed.currency !== account.currency) {
    return { error: `This statement is in ${parsed.currency}, but ${account.name} is a ${account.currency} account.` };
  }
  const keys = dedupeKeys(parsed.lines);
  const existing = new Set(
    (await prisma.bankLine.findMany({ where: { accountId, dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((l) => l.dedupeKey),
  );
  const inflows = parsed.lines.filter((l) => l.amount > 0).reduce((a, l) => a + l.amount, 0);
  const outflows = -parsed.lines.filter((l) => l.amount < 0).reduce((a, l) => a + l.amount, 0);
  return { user: session.user.name ?? null, fileName: file.name, account, parsed, keys, existing, inflows, outflows };
}

export async function previewStatement(fd: FormData) {
  const r = await readUpload(fd);
  if ("error" in r) return { success: false as const, message: r.error };
  const { parsed, keys, existing, inflows, outflows } = r;
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
  const opening = parseFloat(fd.get("opening") as string);
  const closing = parseFloat(fd.get("closing") as string);
  if (!Number.isFinite(opening) || !Number.isFinite(closing)) return { success: false, message: "Enter the statement's opening and closing balance." };

  // The file must add up before anything is saved.
  const expected = opening + inflows - outflows;
  if (Math.abs(expected - closing) > tolerance(account.currency)) {
    const f = (n: number) => fmtMoney(n, account.currency);
    return {
      success: false,
      message: `The statement doesn't add up: opening ${f(opening)} + in ${f(inflows)} − out ${f(outflows)} = ${f(expected)}, but the closing balance is ${f(closing)}. Nothing was imported.`,
    };
  }

  const fresh = parsed.lines.map((l, i) => ({ l, key: keys[i] })).filter(({ key }) => !existing.has(key));
  if (fresh.length === 0) return { success: true, added: 0, skipped: parsed.lines.length };

  await prisma.$transaction(async (tx) => {
    const st = await tx.bankStatement.create({
      data: {
        accountId: account.id,
        fileName: r.fileName,
        periodFrom: parsed.periodFrom ?? parsed.lines[0].txnDate,
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
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const ids = [...new Set(transactionIds)];
  if (ids.length === 0) return { success: false, message: "Choose at least one ledger entry." };

  const entries = await prisma.transaction.findMany({ where: { id: { in: ids } }, include: { reversedBy: { select: { id: true } } } });
  if (entries.length !== ids.length) return { success: false, message: "An entry no longer exists — refresh the page." };
  if (entries.some((e) => e.reversalOfId || e.reversedBy)) return { success: false, message: "A reversed entry can't be matched — match its correction instead." };
  const taken = entries.find((e) => e.bankLineId && e.bankLineId !== lineId);
  if (taken) return { success: false, message: `"${taken.description ?? "That entry"}" is already matched to another bank line.` };
  const problem = await bankLinkProblem(lineId, entries.filter((e) => e.bankLineId !== lineId));
  if (problem) return { success: false, message: problem };

  await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { bankLineId: lineId } });
  await record(entries.filter((e) => e.bankLineId !== lineId).map((e) => ({ entityId: e.id, action: "MATCH", field: "bankLineId", newValue: lineId })), session.user.name);
  revalidateAll();
  return { success: true };
}

export async function unmatchEntry(transactionId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const t = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!t?.bankLineId) return { success: true };
  await prisma.transaction.update({ where: { id: transactionId }, data: { bankLineId: null } });
  await record([{ entityId: t.id, action: "UNMATCH", field: "bankLineId", oldValue: t.bankLineId }], session.user.name);
  revalidateAll();
  return { success: true };
}

// Undo an import (admin) — only while none of its lines are matched.
export async function deleteStatement(id: string) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  const matched = await prisma.transaction.count({ where: { bankLine: { statementId: id } } });
  if (matched > 0) return { success: false, message: "Some of its lines are matched to ledger entries — unmatch them first." };
  await prisma.bankStatement.delete({ where: { id } });
  revalidateAll();
  return { success: true };
}
