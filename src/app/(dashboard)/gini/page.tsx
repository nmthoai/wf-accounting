import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { GiniBadge } from "@/components/gini/gini-avatar";
import { GiniChat } from "@/components/gini/gini-chat";

export default async function GiniPage() {
  const session = await requirePageSession(); // second line behind the proxy
  const t = await getTranslations("gini");
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true, displayName: true } });

  return (
    <div>
      <header className="wf-page-header">
        <div className="flex min-w-0 items-center gap-5">
          <GiniBadge className="size-16" />
          <div className="wf-page-header__main gap-2">
            <p className="wf-kicker"><span>AI</span><span>{t("page.kicker")}</span></p>
            <h1 className="wf-page-header__title">
              {t("page.title")}
              <span className="ml-2 align-baseline text-[17px] font-semibold tracking-normal text-text-secondary">· {t("page.titleSub")}</span>
            </h1>
            <p className="wf-page-header__lead">{t("page.lead")}</p>
          </div>
        </div>
        <div className="wf-page-header__actions">
          <span className="wf-chip wf-chip--pos h-7 gap-2 px-3 text-[12.5px]">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("page.trust")}
          </span>
        </div>
      </header>
      <GiniChat name={me?.displayName || me?.username || ""} />
    </div>
  );
}
