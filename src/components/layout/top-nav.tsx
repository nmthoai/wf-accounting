"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { SidebarBrand, SidebarFoot, SidebarNav } from "./app-sidebar";
import { currentNav } from "./nav";
import { signOutAction } from "@/app/actions/auth";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeMenu } from "@/components/wf/theme-menu";
import type { Theme } from "@/lib/theme";

// The top bar: the breadcrumb (group / page), today's date, the language switch,
// the theme menu, the user and sign out. On glass over the waving grid.
export function TopNav({
  greeting,
  isAdmin = false,
  theme,
  today,
}: {
  greeting: string | null;
  isAdmin?: boolean;
  theme: Theme;
  today: string;
}) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = useTranslations("common");

  const section = currentNav(pathname);
  const group = section ? t(`nav.groups.${section.group}`) : t("nav.groups.account");
  const page = pathname === "/profile" ? t("header.profile") : section ? t(`nav.${section.key}`) : "";

  return (
    <header className="wf-glass sticky top-0 z-10 flex h-(--size-topbar) shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6 lg:px-8 print:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger className="wf-icon-btn lg:hidden" aria-label={t("nav.openSidebar")}>
            <Menu aria-hidden="true" />
          </SheetTrigger>
          <SheetContent side="left" className="wf-glass flex w-(--size-sidebar) flex-col gap-0 p-0">
            <SheetTitle className="sr-only">{t("nav.menu")}</SheetTitle>
            <SidebarBrand />
            <div className="flex-1 overflow-y-auto">
              <SidebarNav isAdmin={isAdmin} onNavigate={() => setMenuOpen(false)} />
            </div>
            <SidebarFoot />
          </SheetContent>
        </Sheet>
        <Link href="/" className="flex shrink-0 sm:hidden" aria-label={t("nav.dashboard")}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the fixed-size SVG mark */}
          <img src="/logo.svg" alt="" className="h-6 w-auto" />
        </Link>
        <p className="hidden min-w-0 items-center gap-2.5 sm:flex">
          <span className="wf-kicker text-muted-foreground">{group}</span>
          <span className="text-border-strong" aria-hidden="true">/</span>
          <span className="truncate text-[17px] font-semibold text-foreground" title={page}>{page}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span className="wf-num hidden text-[14px] text-muted-foreground lg:inline">{today}</span>
        <LanguageSwitcher />
        <ThemeMenu initial={theme} />
        {greeting && (
          <Link
            href="/profile"
            title={t("header.profile")}
            aria-current={pathname === "/profile" ? "page" : undefined}
            className="flex items-center gap-2.5 rounded-full py-1 pr-2 pl-1 text-[15px] text-text-secondary transition-colors hover:bg-secondary hover:text-foreground aria-[current=page]:bg-secondary"
          >
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-full border border-border-strong font-mono text-[12.5px] font-semibold text-primary uppercase"
            >
              {greeting.charAt(0)}
            </span>
            <span className="hidden max-w-[14rem] truncate sm:inline" title={greeting}>
              {t.rich("header.hello", { name: greeting, b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span> })}
            </span>
            <span className="sr-only sm:hidden">{t("header.profile")}</span>
          </Link>
        )}
        <Dialog>
          <DialogTrigger className="wf-icon-btn" aria-label={t("header.signOut")} title={t("header.signOut")}>
            <LogOut aria-hidden="true" />
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("header.signOutTitle")}</DialogTitle>
              <DialogDescription>{t("header.signOutBody")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>{t("actions.cancel")}</DialogClose>
              <Button
                disabled={signingOut}
                onClick={async () => { setSigningOut(true); await signOutAction(); }}
              >
                {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
                {t("header.signOutConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
