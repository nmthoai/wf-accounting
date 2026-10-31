import { useTranslations } from "next-intl";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PanelHead } from "@/components/wf/ledger-ui";
import { GiniAvatar, GiniBadge } from "@/components/gini/gini-avatar";

const SUGGESTIONS = ["pnlThis", "pnlLast", "owed", "cash", "docs", "expenses", "close"] as const;

// Gini's tab as designed — the chat on the left, the report canvas on the right —
// before she is connected to the books: she greets and shows what she will build,
// and the composer stays off until her report skills are in.
export function GiniChat({ name }: { name: string }) {
  const t = useTranslations("gini");

  const suggestions = (
    <div className="wf-suggest">
      {SUGGESTIONS.map((key) => (
        <button key={key} type="button" disabled className="cursor-default!">
          {t(`suggest.${key}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="h-[38rem] lg:col-span-5 lg:h-[calc(100dvh-var(--size-topbar)-15rem)] lg:min-h-[34rem]">
        <PanelHead title={t("chat.title")} />
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="wf-msg">
            <GiniBadge className="size-9" />
            <div className="wf-msg__body">
              <p className="wf-msg__who">{t("chat.who")}</p>
              <div className="wf-bubble">{t("chat.greeting", { name })}</div>
              {suggestions}
            </div>
          </div>
        </div>
        <div className="border-t border-border px-5 py-4">
          <div className="wf-composer opacity-(--opacity-disabled)">
            <label htmlFor="gini-question" className="sr-only">{t("chat.label")}</label>
            <textarea id="gini-question" rows={2} disabled placeholder={t("chat.placeholder")} aria-describedby="gini-soon" />
            <Button type="button" size="icon-sm" aria-label={t("chat.send")} disabled>
              <ArrowUp />
            </Button>
          </div>
          <p id="gini-soon" className="mt-2 text-[13.5px] text-muted-foreground">{t("chat.soon")}</p>
        </div>
      </Card>

      <Card className="min-h-[38rem] lg:col-span-7 lg:h-[calc(100dvh-var(--size-topbar)-15rem)] lg:min-h-[34rem]">
        <PanelHead title={t("canvas.title")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-10 text-center">
          <span className="wf-gini-stage">
            <GiniAvatar variant="full" animated title={t("canvas.alt")} className="h-[300px] w-auto" />
          </span>
          <h3 className="mt-4 text-[22px] leading-normal font-extrabold tracking-[-0.02em] text-foreground">{t("canvas.emptyTitle")}</h3>
          <p className="max-w-md text-[17px] leading-relaxed text-text-secondary">{t("canvas.emptyBody")}</p>
          <div className="max-w-xl [&_.wf-suggest]:justify-center">{suggestions}</div>
        </div>
      </Card>
    </div>
  );
}
