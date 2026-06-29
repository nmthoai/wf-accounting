"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Download, FileSpreadsheet } from "lucide-react";

export function ReportDownloads({ defaultFrom, defaultTo }: { defaultFrom: string; defaultTo: string }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const valid = !!from && !!to && from <= to;
  const href = (type: "entries" | "invoices") =>
    `/api/reports/export?type=${type}&from=${from}&to=${to}`;

  const linkCls = (variant: "default" | "outline") =>
    cn(buttonVariants({ variant }), "gap-2", !valid && "pointer-events-none opacity-50");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-primary" /> Excel downloads</CardTitle>
        <CardDescription>Export raw data for a date range. Ledger uses the transaction date; invoices use the issue date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4 items-end flex-wrap">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-44" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-44" />
          </div>
        </div>
        {!valid && <p className="text-sm text-destructive">Pick a valid range (From must be on or before To).</p>}
        <div className="flex gap-3 flex-wrap">
          <a href={valid ? href("entries") : undefined} download aria-disabled={!valid} className={linkCls("default")}>
            <Download className="h-4 w-4" /> Ledger entries (.xlsx)
          </a>
          <a href={valid ? href("invoices") : undefined} download aria-disabled={!valid} className={linkCls("outline")}>
            <Download className="h-4 w-4" /> Invoices &amp; bills (.xlsx)
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
