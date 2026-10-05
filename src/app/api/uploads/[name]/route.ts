import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { join, basename } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  zip: "application/zip",
};

// Receipts are financial documents — only signed-in users may view them.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { name } = await params;
  // basename() strips any path-traversal attempts (../, absolute paths)
  const safe = basename(name);
  if (!safe || safe !== name) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await readFile(join(UPLOAD_DIR, safe));
    const ext = safe.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";

    // Serve with the original filename so downloads (e.g. an e-invoice ZIP)
    // are recognizable instead of a random UUID. "inline" lets viewable types
    // (PDF/images) still open in the browser; others download.
    const att = await prisma.attachment.findFirst({ where: { filePath: safe }, select: { fileName: true } });
    // Images and PDFs open in the browser; anything else downloads. Either way
    // the file can't run script in the app's origin.
    const viewable = contentType.startsWith("image/") || contentType === "application/pdf";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${viewable ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att?.fileName ?? safe)}`,
    };
    // Downloads are also sandboxed (a sandbox would break the browser's PDF viewer).
    if (!viewable) headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
    return new Response(new Uint8Array(file), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
