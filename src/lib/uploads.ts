import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

// Receipts/invoices live on the persistent data volume (survive redeploys),
// served only through the auth-protected /api/uploads route.
export const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");

// Persist uploaded files and create Attachment rows linked to a transaction or an invoice.
export async function persistUploads(
  files: File[],
  link: { transactionId?: string; invoiceId?: string; projectId?: string }
) {
  const real = files.filter((f) => f && f.size > 0);
  if (real.length === 0) return;

  try {
    await mkdir(UPLOAD_DIR, { recursive: true });
  } catch (e) {
    console.error("Failed to create uploads dir", e);
  }

  for (const file of real) {
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const ext = (file.name.split(".").pop() || "bin").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
    const safeName = `${randomUUID()}.${ext}`;
    await writeFile(join(UPLOAD_DIR, safeName), buffer);
    await prisma.attachment.create({
      data: {
        fileName: file.name,
        fileType: file.type,
        filePath: safeName, // bare key; served via /api/uploads/<key>
        transactionId: link.transactionId ?? null,
        invoiceId: link.invoiceId ?? null,
        projectId: link.projectId ?? null,
      },
    });
  }
}

// Delete the underlying file for an attachment (tolerates old "/uploads/x" paths).
export async function removeUploadFile(filePath: string) {
  const key = filePath.split("/").pop();
  if (!key) return;
  try {
    await unlink(join(UPLOAD_DIR, key));
  } catch {
    // already gone — ignore
  }
}
