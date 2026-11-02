"use client";

import { useEffect } from "react";
import "./globals.css";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme } from "@/lib/theme";

// The root layout itself failed, so there is no language provider here: one
// short line in each language. Renders its own document (and theme).
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // Rendered on the client the <head> script doesn't run: apply the theme here too.
  useEffect(() => {
    const choice = parseTheme(document.cookie.match(new RegExp(`(?:^|; )${THEME_COOKIE}=([^;]*)`))?.[1]);
    const light = choice === "light" || (choice === "system" && matchMedia("(prefers-color-scheme: light)").matches);
    document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
    document.documentElement.classList.toggle("dark", !light);
  }, []);

  return (
    <html lang="en" data-theme="dark" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col items-center justify-center bg-background px-4 font-sans text-foreground">
        <title>Accounting · Kế toán</title>
        <Card className="w-full max-w-[440px]">
          <CardContent className="p-6 sm:p-8">
            <h1 className="text-[26px] leading-tight font-extrabold tracking-[-0.025em] text-foreground">Couldn&apos;t load the app</h1>
            <p className="mt-1 text-[19px] leading-snug font-semibold text-text-secondary" lang="vi">Không tải được ứng dụng</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the root layout failed: a full page load, not client navigation */}
              <a href="/" className={buttonVariants({ variant: "outline", className: "h-11" })}>
                Dashboard · <span lang="vi">Tổng quan</span>
              </a>
              <Button className="h-11" onClick={() => retry()}>
                Try again · <span lang="vi">Thử lại</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </body>
    </html>
  );
}
