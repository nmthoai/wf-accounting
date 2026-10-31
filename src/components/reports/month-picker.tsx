"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthPicker({ month, basePath = "/reports" }: { month: string; basePath?: string }) {
  const t = useTranslations("reports.monthPicker");
  const router = useRouter();
  const go = (m: string) => router.push(`${basePath}?month=${m}`);

  const shift = (delta: number) => {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label={t("previous")}>
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Input
        type="month"
        value={month}
        onChange={(e) => e.target.value && go(e.target.value)}
        aria-label={t("month")}
        className="wf-num w-44"
      />
      <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label={t("next")}>
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}
