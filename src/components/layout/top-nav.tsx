"use client";

import { useState } from "react";
import { LogOut, Menu, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "./app-sidebar";
import { signOutAction } from "@/app/actions/auth";

export function TopNav() {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="sticky top-0 z-10 flex min-h-[4rem] py-4 shrink-0 items-center justify-between border-b bg-card/80 backdrop-blur-md px-4 sm:px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <Sheet>
          <SheetTrigger className="md:hidden inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring hover:bg-accent hover:text-accent-foreground h-9 w-9">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Open sidebar</span>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0 flex flex-col">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <div className="flex h-16 shrink-0 items-center px-6 border-b">
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
          </SheetContent>
        </Sheet>
        <span className="font-serif text-xl sm:text-2xl md:text-3xl font-black text-primary tracking-tight">
          Accounting Entry Tracker
        </span>
      </div>

      <div className="flex items-center gap-4">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
            <LogOut className="h-4 w-4" />
            Sign Out
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign out?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              You&apos;ll need your password and 2FA code to sign back in.
            </p>
            <Button
              className="w-full gap-2"
              disabled={signingOut}
              onClick={async () => { setSigningOut(true); await signOutAction(); }}
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Yes, sign out
            </Button>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
}
