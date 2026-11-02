"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Home, RotateCw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/wf/page-header";

// A page that failed to render, inside the app shell: try again, or go home.
export default function DashboardError({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("common.errorPage");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageHeader
      title={t("title")}
      description={t("body")}
      actions={
        <>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            <Home aria-hidden="true" />
            {t("home")}
          </Link>
          <Button onClick={() => retry()}>
            <RotateCw aria-hidden="true" />
            {t("retry")}
          </Button>
        </>
      }
    />
  );
}
