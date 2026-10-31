import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { navItem, type NavKey } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

// The opener of every screen: the section's number and group as a mono kicker, the
// title (the screen's only h1), one line of lead, status chips and the actions
// (at most one primary).
export function PageHeader({
  section,
  kicker,
  title,
  description,
  meta,
  actions,
  className,
}: {
  section?: NavKey;
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common.nav.groups");
  const item = section ? navItem(section) : null;
  const group = kicker ?? (item ? t(item.group) : null);

  return (
    <header className={cn("wf-page-header", className)}>
      <div className="wf-page-header__main">
        {group && (
          <p className="wf-kicker">
            {item && <span className="wf-kicker__n">{item.index}</span>}
            <span>{group}</span>
          </p>
        )}
        <h1 className="wf-page-header__title">{title}</h1>
        {description && <p className="wf-page-header__lead">{description}</p>}
        {meta && <div className="wf-page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="wf-page-header__actions">{actions}</div>}
    </header>
  );
}
