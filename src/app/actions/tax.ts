"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { saveTaxFiles, removeTaxFile } from "@/lib/tax-files";
import { record, type Change } from "@/lib/history";
import { getT } from "@/i18n/server";
import type { TaxReturn } from "@prisma/client";
import { LINES, TEMPLATES, PERIOD, FLAG_KEY, isForm, parseFigure, parseLines } from "@/lib/tax";

// The declaration as filed (PDF, XML), the accountant's lists (Excel), or a ZIP of them.
const FILE_TYPES = /\.(pdf|xml|xls|xlsx|zip|png|jpe?g)$/i;

// Filed tax declarations are the owner's record, kept apart from the books: only the
// owner adds, changes or removes them, and every change is in the history.
async function requireAdmin() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") throw new Error("Unauthorized");
  return { name: session.user.name ?? null };
}

const str = (fd: FormData, k: string, max = 200) => ((fd.get(k) as string) || "").trim().slice(0, max);
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00.000Z`) : null);
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const snapshot = (r: { form: string; period: string; supplement: number }) => `${r.form} ${r.period}${r.supplement ? ` · supplement ${r.supplement}` : ""}`;

export async function saveTaxReturn(id: string | null, fd: FormData) {
  const me = await requireAdmin();
  const t = await getT("tax");

  const form = str(fd, "form");
  const period = str(fd, "period");
  const template = str(fd, "template") || TEMPLATES[0];
  const supplement = Number(str(fd, "supplement") || "0");
  if (!isForm(form)) return { success: false, message: t("errors.form") };
  if (!PERIOD.test(period)) return { success: false, message: t("errors.period") };
  if (!(TEMPLATES as readonly string[]).includes(template)) return { success: false, message: t("errors.template") };
  if (!Number.isInteger(supplement) || supplement < 0 || supplement > 20) return { success: false, message: t("errors.supplement") };

  // Figures as printed, whole numbers; only [36] of the VAT return can be negative.
  const lines: Record<string, number> = {};
  for (const l of LINES[form]) {
    const v = parseFigure(str(fd, `line_${l.code}`, 40));
    if (v === null || (v < 0 && !l.signed)) return { success: false, message: t("errors.figure", { code: l.code }), field: `line_${l.code}` };
    if (v !== 0) lines[l.code] = v;
  }
  const data = {
    form, period, template, supplement,
    filedDate: day(str(fd, "filedDate")), dueDate: day(str(fd, "dueDate")),
    submissionRef: str(fd, "submissionRef", 100) || null, preparedBy: str(fd, "preparedBy", 100) || null,
    lines: JSON.stringify(lines), notes: str(fd, "notes", 2000) || null,
  };

  const files = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0);
  const odd = files.find((f) => !FILE_TYPES.test(f.name));
  if (odd) return { success: false, message: t("errors.fileType", { name: odd.name.slice(0, 80) }) };

  const clash = await prisma.taxReturn.findFirst({ where: { form, period, supplement, ...(id ? { id: { not: id } } : {}) } });
  if (clash) return { success: false, message: t("errors.duplicate", { form, period }) };

  // The declaration and its history are saved together or not at all.
  let saved;
  if (id) {
    const before = await prisma.taxReturn.findUnique({ where: { id } });
    if (!before) return { success: false, message: t("errors.gone") };
    saved = await prisma.$transaction(async (tx) => {
      const after = await tx.taxReturn.update({ where: { id }, data });
      // One history row per changed field; changed figures listed by line code.
      const changes: Change[] = [];
      const show: Record<string, (r: TaxReturn) => string | null> = {
        form: (r) => r.form, period: (r) => r.period, template: (r) => r.template, supplement: (r) => String(r.supplement),
        filedDate: (r) => iso(r.filedDate), dueDate: (r) => iso(r.dueDate), submissionRef: (r) => r.submissionRef,
        preparedBy: (r) => r.preparedBy, notes: (r) => r.notes,
      };
      for (const [field, f] of Object.entries(show)) {
        if (f(before) !== f(after)) changes.push({ entity: "TaxReturn", entityId: id, action: "UPDATE", field, oldValue: f(before), newValue: f(after) });
      }
      const a = parseLines(before.lines), b = lines;
      for (const code of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if ((a[code] ?? 0) !== (b[code] ?? 0)) changes.push({ entity: "TaxReturn", entityId: id, action: "UPDATE", field: `[${code}]`, oldValue: String(a[code] ?? 0), newValue: String(b[code] ?? 0) });
      }
      await record(changes, me.name, tx);
      return after;
    });
  } else {
    saved = await prisma.$transaction(async (tx) => {
      const created = await tx.taxReturn.create({ data: { ...data, createdBy: me.name } });
      await record([{ entity: "TaxReturn", entityId: created.id, action: "CREATE", newValue: snapshot(created) }], me.name, tx);
      return created;
    });
  }

  await saveTaxFiles(files, saved.id);
  if (files.length) await record(files.map((f) => ({ entity: "TaxReturn", entityId: saved.id, action: "UPDATE", field: "file", newValue: f.name })), me.name);
  revalidatePath("/tax");
  return { success: true };
}

export async function deleteTaxReturn(id: string) {
  const me = await requireAdmin();
  const r = await prisma.taxReturn.findUnique({ where: { id }, include: { files: true } });
  if (!r) return { success: true };
  const files = r.files.map((f) => f.fileName).join(", ");
  await prisma.$transaction(async (tx) => {
    await tx.taxReturn.delete({ where: { id } });
    await record([{ entity: "TaxReturn", entityId: id, action: "DELETE", oldValue: `${snapshot(r)} · ${r.lines}${files ? ` · files deleted: ${files}` : ""}` }], me.name, tx);
  });
  // Files go only once the deletion is saved.
  for (const f of r.files) await removeTaxFile(f.filePath);
  revalidatePath("/tax");
  return { success: true };
}

// Delete one file of a declaration (e.g. the wrong PDF).
export async function deleteTaxReturnFile(fileId: string) {
  const me = await requireAdmin();
  const f = await prisma.taxReturnFile.findUnique({ where: { id: fileId } });
  if (!f) return { success: false };
  await prisma.$transaction(async (tx) => {
    await tx.taxReturnFile.delete({ where: { id: fileId } });
    await record([{ entity: "TaxReturn", entityId: f.taxReturnId, action: "UPDATE", field: "file", oldValue: f.fileName }], me.name, tx);
  });
  await removeTaxFile(f.filePath);
  revalidatePath("/tax");
  return { success: true };
}

// The owner marks a flag as known, with the reason; it stays on the page, set apart.
// `figure` is the flag's amount at the time: if it later moves, the flag comes back.
export async function setTaxFlagNote(key: string, note: string, figure?: number | null) {
  const me = await requireAdmin();
  const t = await getT("tax");
  const text = (note || "").trim().slice(0, 1000);
  if (!FLAG_KEY.test(key)) return { success: false, message: t("errors.gone") };
  if (!text) return { success: false, message: t("errors.noteRequired") };
  const before = await prisma.taxFlagNote.findUnique({ where: { key } });
  const fig = typeof figure === "number" && Number.isFinite(figure) ? figure : null;
  await prisma.$transaction(async (tx) => {
    await tx.taxFlagNote.upsert({ where: { key }, create: { key, note: text, user: me.name, figure: fig }, update: { note: text, user: me.name, figure: fig } });
    await record([{ entity: "TaxFlag", entityId: key, action: "NOTE", oldValue: before?.note ?? null, newValue: text }], me.name, tx);
  });
  revalidatePath("/tax");
  return { success: true };
}

export async function clearTaxFlagNote(key: string) {
  const me = await requireAdmin();
  const before = await prisma.taxFlagNote.findUnique({ where: { key } });
  if (!before) return { success: true };
  await prisma.$transaction(async (tx) => {
    await tx.taxFlagNote.delete({ where: { key } });
    await record([{ entity: "TaxFlag", entityId: key, action: "REOPEN", oldValue: before.note }], me.name, tx);
  });
  revalidatePath("/tax");
  return { success: true };
}
