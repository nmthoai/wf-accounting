"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleAlert, Download, FileSpreadsheet } from "lucide-react";
import { PanelHead } from "@/components/wf/ledger-ui";

export function ReportDownloads({ defaultFrom, defaultTo, className }: { defaultFrom: string; defaultTo: string; className?: string }) {
  const t = useTranslations("reports.downloads");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const valid = !!from && !!to && from <= to;
  const href = (type: "entries" | "invoices") =>
    `/api/reports/export?type=${type}&from=${from}&to=${to}`;

  // aria-disabled dims the link and stops clicks (see buttonVariants).
  const linkCls = (variant: "default" | "outline") => buttonVariants({ variant });

  return (
    <Card className={className}>
      <PanelHead title={<><FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{t("title")}</>} />
      <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("description")}</p>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="from">{t("from")}</Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="wf-num" aria-invalid={!valid || undefined} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="to">{t("to")}</Label>
            <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="wf-num" aria-invalid={!valid || undefined} />
          </div>
        </div>
        {!valid && (
          <p className="flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{t("invalidRange")}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <a href={valid ? href("entries") : undefined} download aria-disabled={!valid} className={linkCls("default")}>
            <Download aria-hidden="true" />{t("entries")}
          </a>
          <a href={valid ? href("invoices") : undefined} download aria-disabled={!valid} className={linkCls("outline")}>
            <Download aria-hidden="true" />{t("invoices")}
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
