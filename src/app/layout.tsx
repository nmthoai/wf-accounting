import type { Metadata } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale, getTranslations } from "next-intl/server";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { WaveGrid } from "@/components/wf/wave-grid";
import { THEME_COOKIE, THEME_SCRIPT, parseTheme, serverTheme } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.app");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  const locale = await getLocale();
  const shown = serverTheme(parseTheme((await cookies()).get(THEME_COOKIE)?.value));

  return (
    // THEME_SCRIPT may switch data-theme before hydration when the choice is System.
    <html lang={locale} data-theme={shown} className={shown === "dark" ? "dark" : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground">
        <WaveGrid />
        <NextIntlClientProvider messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
