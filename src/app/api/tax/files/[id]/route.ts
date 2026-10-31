import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import { join, basename } from "path";
import { TAX_FILE_DIR } from "@/lib/tax-files";

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  pdf: "application/pdf",
  zip: "application/zip",
};

// A recorded tax declaration's file — the owner's alone. The row is looked up first and
// the file read by its stored key, so nothing is served without a matching record.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return new Response("Not found", { status: 404 });
  }

  const { id } = await params;
  const f = await prisma.taxReturnFile.findUnique({ where: { id } });
  if (!f) return new Response("Not found", { status: 404 });

  try {
    const file = await readFile(join(TAX_FILE_DIR, basename(f.filePath)));
    const ext = f.filePath.split(".").pop()?.toLowerCase() || "";
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    // PDFs and images open in the browser; anything else downloads, sandboxed.
    const viewable = contentType.startsWith("image/") || contentType === "application/pdf";
    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=0, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${viewable ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
    };
    if (!viewable) headers["Content-Security-Policy"] = "sandbox; default-src 'none'";
    return new Response(new Uint8Array(file), { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
