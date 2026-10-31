import { writeFile, mkdir, unlink } from "fs/promises";
import { join, basename } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploads";

// A tax declaration's files (the filed PDF, the XML, the accountant's lists) are kept
// apart from the books' attachments: their own table and their own folder, served only
// to the owner by /api/tax/files/[id]. The shared /api/uploads route can't reach them.
export const TAX_FILE_DIR = join(UPLOAD_DIR, "tax");

export async function saveTaxFiles(files: File[], taxReturnId: string) {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length === 0) return [];
  await mkdir(TAX_FILE_DIR, { recursive: true });
  const saved = [];
  for (const file of real) {
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const filePath = `${randomUUID()}.${ext}`;
    await writeFile(join(TAX_FILE_DIR, filePath), Buffer.from(await file.arrayBuffer()));
    saved.push(await prisma.taxReturnFile.create({
      data: { taxReturnId, fileName: file.name.slice(0, 200), fileType: file.type || null, filePath, size: file.size },
    }));
  }
  return saved;
}

export async function removeTaxFile(filePath: string) {
  try {
    await unlink(join(TAX_FILE_DIR, basename(filePath)));
  } catch {
    // already gone — ignore
  }
}
