"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { NAV_GROUPS, isCurrent, visibleNav } from "./nav";
import { BrandLockup } from "@/components/wf/brand";

// The nav itself: shared by the sidebar and the mobile sheet.
export function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  const items = visibleNav(isAdmin);

  return (
    <nav className="wf-nav" aria-label={t("menu")}>
      {NAV_GROUPS.map((group) => {
        const groupItems = items.filter((item) => item.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} className="wf-nav__group">
            {group !== "overview" && <p className="wf-label">{t(`groups.${group}`)}</p>}
            {groupItems.map((item) => {
              const current = isCurrent(item, pathname);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className="wf-nav__item"
                  aria-current={current ? "page" : undefined}
                  onClick={onNavigate}
                >
                  {item.icon ? (
                    <item.icon aria-hidden="true" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- Gini's 20px face
                    <img className="wf-nav__face" src="/gini/gini-face.webp" alt="" />
                  )}
                  <span className="wf-nav__name">{t(item.key)}</span>
                  <span className={item.key === "gini" ? "wf-nav__index wf-nav__index--ai" : "wf-nav__index"}>{item.index}</span>
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export function SidebarBrand() {
  const t = useTranslations("common.app");
  return (
    <div className="wf-sidebar__brand">
      <BrandLockup product={t("product")} logoAlt={t("logoAlt")} />
    </div>
  );
}

export function SidebarFoot() {
  const t = useTranslations("common.nav");
  return <div className="wf-sidebar__foot">{t("tagline")}</div>;
}

export function AppSidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  return (
    <aside className="wf-glass relative z-20 hidden w-(--size-sidebar) shrink-0 flex-col border-r border-border lg:flex">
      <SidebarBrand />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav isAdmin={isAdmin} />
      </div>
      <SidebarFoot />
    </aside>
  );
}
