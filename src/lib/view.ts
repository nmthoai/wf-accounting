import { prisma } from "@/lib/prisma";
import { defaultUsdRate } from "@/lib/fx";
import { VND_VIEW, type View } from "@/lib/money";

// The signed-in user's summary currency, with the Settings USD rate for the
// USD view.
export async function getView(userId: string): Promise<View> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayCurrency: true } });
  return user?.displayCurrency === "USD" ? { currency: "USD", rate: await defaultUsdRate() } : VND_VIEW;
}
