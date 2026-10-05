"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Settings,
  FileText,
  Briefcase,
  Users,
  Wallet,
  Landmark,
  ReceiptText,
  PackageCheck,
  BarChart3
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export const navigation = [
  // key: the label under common "nav"
  { key: "dashboard", href: "/", icon: LayoutDashboard },
  { key: "ledger", href: "/ledger", icon: BookOpen },
  { key: "invoices", href: "/invoices", icon: FileText },
  { key: "projects", href: "/projects", icon: Briefcase },
  { key: "contacts", href: "/contacts", icon: Users },
  { key: "accounts", href: "/accounts", icon: Wallet },
  { key: "bank", href: "/bank", icon: Landmark },
  { key: "costs", href: "/costs", icon: ReceiptText },
  { key: "reports", href: "/reports", icon: BarChart3 },
  { key: "handover", href: "/handover", icon: PackageCheck },
  { key: "settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("common.nav");
  const tApp = useTranslations("common.app");

  return (
    <div className="hidden md:flex md:w-72 md:flex-col border-r bg-card shadow-sm z-20 relative">
      <div className="flex min-h-[4rem] py-4 shrink-0 items-center px-6 border-b">
        <Link href="/" className="flex items-center gap-3 font-serif text-3xl font-black text-primary tracking-tight">
          <img src="/logo.svg" alt={tApp("logoAlt")} className="w-10 h-10 object-contain" />
          <span>WorkFactory</span>
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                )}
              >
                <item.icon
                  className={cn(
                    isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    "h-5 w-5 shrink-0"
                  )}
                  aria-hidden="true"
                />
                {t(item.key)}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
