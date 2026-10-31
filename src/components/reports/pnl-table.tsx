"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Pnl, PnlSide } from "@/lib/pnl";
import { fmtMoney } from "@/lib/money";

// Month-by-month P&L: revenue and cost categories as rows, months as columns.
// A category opens to its entries, each in the column of its month.

export function PnlTable({ pnl, labels }: { pnl: Pnl; labels: string[] }) {
  const t = useTranslations("reports.detail");
  const [open, setOpen] = useState<Set<string>>(new Set());
  // VND written the way the rest of the app writes it (110.880.000), in either language.
  const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
  const num = (v: number) => (Math.abs(v) < 0.5 ? "–" : nf.format(Math.round(v)));
  const keys = [...pnl.revenue.categories.map((c) => `revenue:${c.name}`), ...pnl.cost.categories.map((c) => `cost:${c.name}`)];
  const allOpen = keys.length > 0 && keys.every((k) => open.has(k));
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const cols = pnl.months.length;
  const first = "sticky left-0 z-[1] border-r bg-card px-3 py-2 text-left";
  // A fixed width, so opening a category with long descriptions never pushes the months away.
  const label = "w-36 overflow-hidden sm:w-64";
  const cell = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

  const section = (key: "revenue" | "cost", s: PnlSide) => (
    <>
      <tr className="border-t-2 bg-muted/60 font-semibold">
        <th scope="row" className={`${first} bg-muted`}>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: key === "revenue" ? "var(--chart-revenue)" : "var(--chart-cost)" }} />
            {t(key)}
          </span>
        </th>
        {s.perMonth.map((v, i) => <td key={i} className={cell}>{num(v)}</td>)}
        <td className={`${cell} border-l`}>{num(s.total)}</td>
      </tr>
      {s.categories.map((c) => {
        const k = `${key}:${c.name}`;
        const isOpen = open.has(k);
        return (
          <Fragment key={k}>
            <tr className="border-t hover:bg-muted/30">
              <th scope="row" className={`${first} font-normal`}>
                <button type="button" onClick={() => toggle(k)} aria-expanded={isOpen} className={`${label} inline-flex items-center gap-1.5 text-left hover:underline`}>
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">{c.items.length}</span>
                </button>
              </th>
              {c.perMonth.map((v, i) => <td key={i} className={cell}>{num(v)}</td>)}
              <td className={`${cell} border-l font-medium`}>{num(c.total)}</td>
            </tr>
            {isOpen && c.items.map((it) => (
              <tr key={it.id} className="border-t border-dashed text-xs text-muted-foreground hover:bg-muted/30">
                <th scope="row" className={`${first} pl-8 font-normal`}>
                  <Link href={`/entry/${it.id}`} title={it.description || undefined} className={`${label} block hover:text-foreground hover:underline`}>
                    <span className="block truncate text-foreground">{it.description || t("noDescription")}</span>
                    <span className="block truncate">
                      {it.date}
                      {it.project ? ` · ${it.project}` : ""}
                      {it.currency !== "VND" ? ` · ${fmtMoney(it.amount, it.currency)}` : ""}
                      {it.provisional ? <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800" title={t("provisionalTitle")}>{t("provisional")}</span> : null}
                    </span>
                  </Link>
                </th>
                {pnl.months.map((m, i) => <td key={i} className={cell}>{m === it.month ? num(it.vnd) : ""}</td>)}
                <td className={`${cell} border-l`}>{num(it.vnd)}</td>
              </tr>
            ))}
          </Fragment>
        );
      })}
      {s.categories.length === 0 && (
        <tr className="border-t"><th scope="row" className={`${first} font-normal text-muted-foreground`}>{t("none")}</th><td colSpan={cols + 1} /></tr>
      )}
    </>
  );

  return (
    <div className="space-y-2">
      <div className="flex justify-end px-4 pt-4">
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={keys.length === 0} onClick={() => setOpen(allOpen ? new Set() : new Set(keys))}>
          {allOpen ? t("collapseAll") : t("expandAll")}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr className="bg-muted/50 text-xs text-muted-foreground">
              <th scope="col" className={`${first} bg-muted font-medium`}>{t("item")}</th>
              {labels.map((l) => <th key={l} scope="col" className={`${cell} font-medium`}>{l}</th>)}
              <th scope="col" className={`${cell} border-l font-medium`}>{t("total")}</th>
            </tr>
          </thead>
          <tbody>
            {section("revenue", pnl.revenue)}
            {section("cost", pnl.cost)}
            <tr className="border-t-2 font-semibold">
              <th scope="row" className={`${first} bg-card`}>
                <span className="inline-flex items-center gap-2"><span className="h-0.5 w-3 rounded" style={{ background: "var(--chart-net)" }} />{t("net")}</span>
              </th>
              {pnl.net.map((v, i) => <td key={i} className={`${cell} ${v < 0 ? "text-red-600" : ""}`}>{num(v)}</td>)}
              <td className={`${cell} border-l ${pnl.netTotal < 0 ? "text-red-600" : ""}`}>{num(pnl.netTotal)}</td>
            </tr>
            <tr className="border-t text-xs text-muted-foreground">
              <th scope="row" className={`${first} bg-card font-normal`}>{t("margin")}</th>
              {pnl.months.map((_, i) => {
                const r = pnl.revenue.perMonth[i];
                return <td key={i} className={cell}>{r > 0 ? `${Math.round((pnl.net[i] / r) * 100)}%` : "–"}</td>;
              })}
              <td className={`${cell} border-l`}>{pnl.revenue.total > 0 ? `${Math.round((pnl.netTotal / pnl.revenue.total) * 100)}%` : "–"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
