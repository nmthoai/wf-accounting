import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { BrandLockup } from "@/components/wf/brand";
import { ThemeMenu } from "@/components/wf/theme-menu";
import { LanguageSwitcher } from "@/components/language-switcher";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

// The screens before the app shell (sign-in, onboarding): the large lockup with the
// language switch and theme menu, the headline and its lead beside the panel, and
// the mono foot. No background of its own, so the full-strength grid shows through.
export async function AuthShell({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        {/* The large lockup doesn't fit beside the controls on a phone. */}
        <BrandLockup size="lg" href={null} product={tc("app.product")} logoAlt={tc("app.logoAlt")} className="hidden sm:flex" />
        <BrandLockup href={null} product={tc("app.product")} logoAlt={tc("app.logoAlt")} className="sm:hidden" />
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <ThemeMenu initial={theme} />
        </div>
      </header>

      <main className="flex flex-1 items-center py-10 lg:py-12">
        <div className="wf-rise mx-auto grid w-full max-w-[1200px] items-center gap-10 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-12 lg:px-8">
          <div>
            <p className="wf-kicker">
              <span className="wf-kicker__n">00</span>
              <span>{tc("app.title")}</span>
            </p>
            <h1 className="mt-6 text-[42px] leading-[1.02] font-extrabold tracking-[-0.032em] text-foreground sm:text-[64px] xl:text-[74px]">
              {t.rich("headline", { proof: (chunks) => <span className="block text-primary">{chunks}</span> })}
            </h1>
            <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-text-secondary">{lead}</p>
          </div>
          {children}
        </div>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 sm:px-6 lg:px-8">
        <p className="wf-label">{t("footer")}</p>
        <p className="wf-label">{tc("nav.tagline")}</p>
      </footer>
    </div>
  );
}
