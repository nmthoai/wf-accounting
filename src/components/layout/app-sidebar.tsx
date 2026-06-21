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
  Wallet
} from "lucide-react";
import { cn } from "@/lib/utils";

export const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Ledger", href: "/ledger", icon: BookOpen },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Projects", href: "/projects", icon: Briefcase },
  { name: "Clients & Vendors", href: "/contacts", icon: Users },
  { name: "Balance", href: "/balance", icon: Wallet },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden md:flex md:w-72 md:flex-col border-r bg-card shadow-sm z-20 relative">
      <div className="flex min-h-[4rem] py-4 shrink-0 items-center px-6 border-b">
        <Link href="/" className="flex items-center gap-3 font-serif text-3xl font-black text-primary tracking-tight">
          <img src="/logo.svg" alt="Logo" className="w-10 h-10 object-contain" />
          <span>WorkFactory</span>
        </Link>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-6">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
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
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
