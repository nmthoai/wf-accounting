import { getSession } from "@/lib/session";
import { collect, currentMonth, isFutureMonth, pack } from "@/lib/handover";
import { resolveLocale } from "@/i18n/locale";
import { translator } from "@/i18n/server";
import { fmtMonth } from "@/lib/format";

// GET /api/handover?month=YYYY-MM — the month's package for the accountant (ZIP),
// in the signed-in user's language.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const month = new URL(req.url).searchParams.get("month") || "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return new Response("Invalid month", { status: 400 });
  const locale = await resolveLocale();
  // A month that hasn't started would give an empty package that looks complete.
  if (isFutureMonth(month)) {
    const now = currentMonth();
    const th = translator(locale, "handover");
    return new Response(th("errors.futureMonth", { month: fmtMonth(month, locale), current: fmtMonth(now, locale) }), {
      status: 400,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const zip = await pack(await collect(month), session.user.name ?? null, locale);
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="WF-handover-${month}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
