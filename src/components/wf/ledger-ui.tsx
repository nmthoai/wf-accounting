import type { ComponentProps, ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The system's small parts: Chip, StatStrip/Stat, Notice and PanelHead, with the
// one place that maps the books' states to tones.

export type Tone = "neutral" | "pos" | "neg" | "warn" | "info" | "violet" | "agent";

export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-foreground",
  pos: "text-pos",
  neg: "text-neg",
  warn: "text-warn",
  info: "text-primary",
  violet: "text-violet",
  agent: "text-agent-text",
};

// Entries: DRAFT → REVIEWED → POSTED, or REJECTED.
export const ENTRY_STATUS_TONE: Record<string, Tone> = { DRAFT: "warn", REVIEWED: "info", POSTED: "neutral", REJECTED: "neg" };
export const INVOICE_STATUS_TONE: Record<string, Tone> = { OPEN: "warn", PARTIAL: "info", PAID: "pos", VOID: "neutral", OVERDUE: "neg" };
export const ENTRY_TYPE_TONE: Record<string, Tone> = {
  INCOME: "pos", EXPENSE: "neg", CAPITAL_IN: "violet", LOAN_IN: "info", LOAN_REPAY: "info",
  OTHER_IN: "warn", OTHER_OUT: "warn", TRANSFER: "neutral",
};
export const PROJECT_STATUS_TONE: Record<string, Tone> = { ACTIVE: "info", PENDING: "warn", DONE: "pos", COMPLETED: "pos" };
// Documents behind an entry.
export const DOC_TONE: Record<string, Tone> = { PENDING: "neutral", INVOICE: "pos", RECEIPT: "info", PAYMENT_ONLY: "warn", MISSING: "neg" };

export function Chip({
  tone = "neutral",
  mono = false,
  dot = false,
  solid = false,
  className,
  children,
  ...props
}: { tone?: Tone; mono?: boolean; dot?: boolean; solid?: boolean } & ComponentProps<"span">) {
  return (
    <span
      className={cn("wf-chip", `wf-chip--${tone}`, mono && "wf-chip--mono", dot && "wf-chip--dot", solid && "wf-chip--solid", className)}
      {...props}
    >
      {children}
    </span>
  );
}

/** Key figures side by side, ruled by 1px lines. Set the columns with a grid-cols class. */
export function StatStrip({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("wf-stats grid-cols-1 sm:grid-cols-2 sm:[&>:last-child:nth-child(odd)]:col-span-2 lg:[&>:last-child:nth-child(odd)]:col-span-1", className)}>{children}</div>;
}

export function Stat({
  label,
  icon: Icon,
  tone = "neutral",
  emphasis = false,
  sub,
  className,
  children,
}: {
  label: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  emphasis?: boolean;
  sub?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("wf-stat", emphasis && "wf-stat--emphasis", className)}>
      <div className="wf-stat__head">
        <p className="wf-label">{label}</p>
        {Icon && <Icon aria-hidden="true" />}
      </div>
      <div className={cn("wf-stat__value", TONE_TEXT[tone])}>{children}</div>
      {sub && <div className="wf-stat__sub">{sub}</div>}
    </div>
  );
}

const NOTICE_ICON = { info: Info, success: CircleCheck, warning: TriangleAlert, error: CircleAlert } as const;

export function Notice({
  tone = "info",
  title,
  icon,
  className,
  children,
}: {
  tone?: keyof typeof NOTICE_ICON;
  title?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  const Icon = icon ?? NOTICE_ICON[tone];
  return (
    <div className={cn("wf-notice", `wf-notice--${tone}`, className)} role={tone === "error" ? "alert" : undefined}>
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="wf-notice__title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** A panel's head: its name, an optional count and actions on the right. */
export function PanelHead({
  title,
  count,
  actions,
  as: Heading = "h2",
  className,
}: {
  title: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div className={cn("wf-panel__head", className)}>
      <Heading className="wf-panel__title">
        {title}
        {count !== undefined && count !== null && <span className="wf-panel__count">{count}</span>}
      </Heading>
      {actions && <div className="wf-panel__actions">{actions}</div>}
    </div>
  );
}

/** A share of a total as a 3px bar in the row's tone. */
export function Bar({ pct, tone }: { pct: number; tone?: "pos" | "neg" | "warn" | "info" }) {
  return (
    <div className={cn("wf-bar", tone && `wf-bar--${tone}`)} aria-hidden="true">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}
