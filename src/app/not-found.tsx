import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { AuthShell } from "@/components/auth/auth-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// An unknown address (or a notFound()), on the same shell as the sign-in page.
export default async function NotFound() {
  const t = await getTranslations("common.notFoundPage");

  return (
    <AuthShell lead={t("body")}>
      <Card className="w-full max-w-[440px]">
        <CardContent className="p-6 sm:p-8">
          <p className="wf-label">404</p>
          <h2 className="mt-3 text-[26px] leading-tight font-extrabold tracking-[-0.025em] text-foreground">{t("title")}</h2>
          <Link href="/" className={cn(buttonVariants(), "mt-7 h-11 w-full")}>
            {t("home")}
            <ArrowRight aria-hidden="true" />
          </Link>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
