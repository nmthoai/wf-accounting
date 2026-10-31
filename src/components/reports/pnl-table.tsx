"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Pnl, PnlSide } from "@/lib/pnl";
import { fmtMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Chip, PanelHead } from "@/components/wf/ledger-ui";

// Month-by-month P&L: revenue and cost categories as rows, months as columns.
// A category opens to its entries, each in the column of its month.

export function PnlTable({ pnl, labels, className }: { pnl: Pnl; labels: string[]; className?: string }) {
  const t = useTranslations("reports.detail");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // VND written the way the rest of the app writes it (110.880.000), in either language.
  const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
  const num = (v: number) => (Math.abs(v) < 0.5 ? "–" : nf.format(Math.round(v)));
  const keys = [...pnl.revenue.categories.map((c) => `revenue:${c.name}`), ...pnl.cost.categories.map((c) => `cost:${c.name}`)];
  const allOpen = keys.length > 0 && keys.every((k) => open.has(k));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cols = pnl.months.length;
  const first = "sticky left-0 z-[1] border-r border-border bg-card py-2.5 pr-3 pl-5 text-left";
  // A fixed width, so opening a category with long descriptions never pushes the months away.
  const label = "w-36 overflow-hidden sm:w-64";
  const cell = "wf-num px-3 py-2.5 text-right last:pr-5";
  // The total stays in view on the right when many months scroll sideways.
  const total = "sticky right-0 z-[1] border-l border-border bg-card";
  const head = "h-9 font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase text-muted-foreground";
  // The sticky first column needs an opaque fill: the row's tint laid over the card.
  const tint = "bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]";
  const hoverTint = "group-hover:bg-[color-mix(in_oklab,var(--secondary)_45%,var(--card))]";

  const section = (key: "revenue" | "cost", s: PnlSide) => (
    <>
      <tr className="border-t border-border-strong bg-muted/40 font-semibold text-foreground">
        <th scope="row" className={cn(first, tint)}>
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-xs" style={{ background: key === "revenue" ? "var(--chart-revenue)" : "var(--chart-cost)" }} aria-hidden="true" />
            {t(key)}
          </span>
        </th>
        {s.perMonth.map((v, i) => <td key={i} className={cell}>{num(v)}</td>)}
        <td className={cn(cell, total, tint)}>{num(s.total)}</td>
      </tr>
      {s.categories.map((c) => {
        const k = `${key}:${c.name}`;
        const isOpen = open.has(k);
        return (
          <Fragment key={k}>
            <tr className="group border-t border-border text-text-secondary transition-colors duration-150 hover:bg-secondary/45">
              <th scope="row" className={cn(first, hoverTint, "font-normal")}>
                <button type="button" onClick={() => toggle(k)} aria-expanded={isOpen} className={cn(label, "inline-flex items-center gap-1.5 text-left text-foreground hover:text-primary")}>
                  {isOpen ? <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">{c.name}</span>
                  <span className="wf-num ml-auto pl-2 text-[11px] text-muted-foreground">{c.items.length}</span>
                </button>
              </th>
              {c.perMonth.map((v, i) => <td key={i} className={cell}>{num(v)}</td>)}
              <td className={cn(cell, total, hoverTint, "font-semibold text-foreground")}>{num(c.total)}</td>
            </tr>
            {isOpen && c.items.map((it) => (
              <tr key={it.id} className="group border-t border-dashed border-border text-[12px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/45">
                <th scope="row" className={cn(first, hoverTint, "pl-10 font-normal")}>
                  <Link href={`/entry/${it.id}`} title={it.description || undefined} className={cn(label, "block")}>
                    <span className="block truncate text-foreground hover:text-primary">{it.description || t("noDescription")}</span>
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="wf-num">{it.date}</span>
                      {it.project ? <span className="truncate">· {it.project}</span> : null}
                      {it.currency !== "VND" ? <span className="wf-num">· {fmtMoney(it.amount, it.currency)}</span> : null}
                      {it.provisional ? <Chip tone="warn" title={t("provisionalTitle")}>{t("provisional")}</Chip> : null}
                    </span>
                  </Link>
                </th>
                {pnl.months.map((m, i) => <td key={i} className={cell}>{m === it.month ? num(it.value) : ""}</td>)}
                <td className={cn(cell, total, hoverTint)}>{num(it.value)}</td>
              </tr>
            ))}
          </Fragment>
        );
      })}
      {s.categories.length === 0 && (
        <tr className="border-t border-border"><th scope="row" className={cn(first, "font-normal text-muted-foreground")}>{t("none")}</th><td colSpan={cols + 1} /></tr>
      )}
    </>
  );

  return (
    <Card className={className}>
      <PanelHead
        title={t("title")}
        actions={
          <Button size="sm" variant="outline" disabled={keys.length === 0} onClick={() => setOpen(allOpen ? new Set() : new Set(keys))}>
            {allOpen ? t("collapseAll") : t("expandAll")}
          </Button>
        }
      />
      <p className="border-b border-border px-5 py-3 text-[13px] text-muted-foreground">{t("subtitle")}</p>
      {pnl.provisional > 0 && (
        <p className="flex items-start gap-2 border-b border-border px-5 py-3 text-[13px] text-text-secondary">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden="true" />
          {t("provisionalNote", { count: pnl.provisional })}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13.5px]">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="bg-muted/40">
              <th scope="col" className={cn(first, head, tint, "py-0")}>{t("item")}</th>
              {labels.map((l) => <th key={l} scope="col" className={cn(cell, head, "py-0 tracking-[0.06em]")}>{l}</th>)}
              <th scope="col" className={cn(cell, head, total, tint, "py-0")}>{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {section("revenue", pnl.revenue)}
            {section("cost", pnl.cost)}
            <tr className="border-t-2 border-border-strong font-semibold text-foreground">
              <th scope="row" className={first}>
                <span className="inline-flex items-center gap-2"><span className="h-0.5 w-3 rounded-full" style={{ background: "var(--chart-net)" }} aria-hidden="true" />{t("net")}</span>
              </th>
              {pnl.net.map((v, i) => <td key={i} className={cn(cell, v < 0 && "text-neg")}>{num(v)}</td>)}
              <td className={cn(cell, total, pnl.netTotal < 0 && "text-neg")}>{num(pnl.netTotal)}</td>
            </tr>
            <tr className="border-t border-border text-[12px] text-muted-foreground">
              <th scope="row" className={cn(first, "font-normal")}>{t("margin")}</th>
              {pnl.months.map((_, i) => {
                const r = pnl.revenue.perMonth[i];
                return <td key={i} className={cell}>{r > 0 ? `${Math.round((pnl.net[i] / r) * 100)}%` : "–"}</td>;
              })}
              <td className={cn(cell, total)}>{pnl.revenue.total > 0 ? `${Math.round((pnl.netTotal / pnl.revenue.total) * 100)}%` : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
