import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Briefcase,
  Users,
  Wallet,
  Landmark,
  ReceiptText,
  ChartColumn,
  Scale,
  PackageCheck,
  Settings,
  type LucideIcon,
} from "lucide-react";

// The sections, grouped the way the month runs. Each has a two-digit number that
// repeats in its page kicker; Gini's mark is "AI". Numbers are counted over the whole
// list, so they stay the same for every role (Tax is owner-only).
export type NavGroup = "overview" | "assistant" | "books" | "work" | "cash" | "monthEnd" | "system";
export type NavKey =
  | "dashboard" | "gini" | "ledger" | "invoices" | "projects" | "contacts"
  | "accounts" | "bank" | "costs" | "reports" | "tax" | "handover" | "settings";

export type NavItem = {
  key: NavKey; // the label under common "nav"
  href: string;
  group: NavGroup;
  icon?: LucideIcon; // Gini shows her face instead
  ownerOnly?: boolean;
  index: string; // "01" … or "AI"
  /** Other paths that belong to this section (the new-entry form is part of the ledger). */
  also?: string[];
};

const ITEMS: Omit<NavItem, "index">[] = [
  { key: "dashboard", href: "/", icon: LayoutDashboard, group: "overview" },
  { key: "gini", href: "/gini", group: "assistant" },
  { key: "ledger", href: "/ledger", icon: BookOpen, group: "books", also: ["/entry"] },
  { key: "invoices", href: "/invoices", icon: FileText, group: "books" },
  { key: "projects", href: "/projects", icon: Briefcase, group: "work" },
  { key: "contacts", href: "/contacts", icon: Users, group: "work" },
  { key: "accounts", href: "/accounts", icon: Wallet, group: "cash" },
  { key: "bank", href: "/bank", icon: Landmark, group: "cash" },
  { key: "costs", href: "/costs", icon: ReceiptText, group: "cash" },
  { key: "reports", href: "/reports", icon: ChartColumn, group: "monthEnd" },
  { key: "tax", href: "/tax", icon: Scale, group: "monthEnd", ownerOnly: true },
  { key: "handover", href: "/handover", icon: PackageCheck, group: "monthEnd" },
  { key: "settings", href: "/settings", icon: Settings, group: "system" },
];

let n = 0;
export const NAV: NavItem[] = ITEMS.map((item) => ({
  ...item,
  index: item.key === "gini" ? "AI" : String(++n).padStart(2, "0"),
}));

export const NAV_GROUPS: NavGroup[] = ["overview", "assistant", "books", "work", "cash", "monthEnd", "system"];

// Owner-only pages (Tax) are left out for everyone else.
export const visibleNav = (isAdmin: boolean) => NAV.filter((item) => isAdmin || !item.ownerOnly);

export const navItem = (key: NavKey) => NAV.find((item) => item.key === key)!;

export function isCurrent(item: NavItem, pathname: string) {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.also ?? [])].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const currentNav = (pathname: string) => NAV.find((item) => isCurrent(item, pathname));
