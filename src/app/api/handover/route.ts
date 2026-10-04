import { auth } from "@/auth";
import { collect, pack } from "@/lib/handover";

// GET /api/handover?month=YYYY-MM — the month's package for the accountant (ZIP).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new Response("Invalid month", { status: 400 });

  const zip = await pack(await collect(month), session.user.name ?? null);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="WF-handover-${month}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
