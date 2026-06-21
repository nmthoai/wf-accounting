import { auth } from "@/auth";
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
};

// Receipts are financial documents — only signed-in users may view them.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const session = await auth();
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
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
