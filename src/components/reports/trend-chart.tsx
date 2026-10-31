"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { chartTicks } from "@/lib/pnl";

// Revenue and costs per month as paired columns, profit as a line, all on one
// VND axis. Hover or focus a month for its figures; the table below the chart
// carries every number, so nothing here depends on colour alone.

type Props = { labels: string[]; revenue: number[]; cost: number[]; net: number[]; locale: string };

const H = 300;
const M = { top: 16, right: 16, bottom: 32, left: 64 };
const BAR = 24; // max column width
const GAP = 2;  // surface gap between the paired columns
const TIP = 208; // tooltip width

export function TrendChart({ labels, revenue, cost, net, locale }: Props) {
  const t = useTranslations("reports.trend");
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState<number | null>(null); // measured before the first draw
  const [hover, setHover] = useState<number | null>(null);
  const empty = [...revenue, ...cost].every((v) => Math.abs(v) < 0.5);
  // Re-measure when the chart reappears: the page keeps this component across period changes.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);

  const n = labels.length;
  if (empty) return <p className="text-sm text-muted-foreground">{t("empty")}</p>;

  const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }); // as everywhere in the app
  const short = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
  const all = [...revenue, ...cost, ...net];
  const tk = chartTicks(Math.min(...all), Math.max(...all));
  const lo = tk[0], hi = tk[tk.length - 1];
  const width = w ?? 0;
  const iw = width - M.left - M.right, ih = H - M.top - M.bottom;
  const y = (v: number) => M.top + ih - ((v - lo) / (hi - lo)) * ih;
  const band = iw / Math.max(n, 1);
  // Columns never cover the next month: narrow bands get narrower columns.
  const bw = band < 10 ? Math.max(1, (band - 2 * GAP) / 2) : Math.min(BAR, (band * 0.7 - GAP) / 2);
  const cx = (i: number) => M.left + band * i + band / 2;
  const y0 = y(0);
  // Rounded data end, square at the baseline; downward for negative values.
  const col = (x: number, v: number) => {
    const top = y(Math.max(v, 0)), bot = y(Math.min(v, 0)), h = Math.max(bot - top, 0);
    if (h < 1) return "";
    const r = Math.min(4, h, bw / 2);
    return v >= 0
      ? `M${x},${bot} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${bot} Z`
      : `M${x},${top} V${bot - r} Q${x},${bot} ${x + r},${bot} H${x + bw - r} Q${x + bw},${bot} ${x + bw},${bot - r} V${top} Z`;
  };
  const every = Math.ceil(n / Math.max(1, Math.floor(iw / 64))); // thin out month labels when crowded
  const line = net.map((v, i) => `${i ? "L" : "M"}${cx(i)},${y(v)}`).join(" ");
  // Beside the hovered month, never on top of it.
  const tipX = hover === null ? 0 : cx(hover) + band / 2 + 8 + TIP <= width ? cx(hover) + band / 2 + 8 : Math.max(0, cx(hover) - band / 2 - 8 - TIP);
  const series = [["revenue", "var(--chart-revenue)"], ["cost", "var(--chart-cost)"], ["net", "var(--chart-net)"]] as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {series.slice(0, 2).map(([k, c]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm" style={{ background: c }} />{t(k)}</span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden><line x1="0" y1="5" x2="18" y2="5" stroke="var(--chart-net)" strokeWidth="2" /><circle cx="9" cy="5" r="3" fill="var(--chart-net)" /></svg>
          {t("net")}
        </span>
      </div>
      <div ref={box} className="relative w-full" style={{ height: H }}>
        {w !== null && (
          <svg width={width} height={H} role="group" aria-label={t("aria", { from: labels[0] ?? "", to: labels[n - 1] ?? "" })} className="block">
            {tk.map((v) => (
              <g key={v} aria-hidden>
                <line x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth={1} />
                <text x={M.left - 8} y={y(v)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">{short.format(v)}</text>
              </g>
            ))}
            {labels.map((l, i) => (
              <g key={l} aria-hidden>
                {hover === i && <rect x={M.left + band * i} y={M.top} width={band} height={ih} className="fill-muted" />}
                {i % every === 0 && <text x={cx(i)} y={H - M.bottom + 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">{l}</text>}
              </g>
            ))}
            {labels.map((l, i) => (
              <g key={`c${l}`} aria-hidden>
                <path d={col(cx(i) - bw - GAP / 2, revenue[i])} fill="var(--chart-revenue)" />
                <path d={col(cx(i) + GAP / 2, cost[i])} fill="var(--chart-cost)" />
              </g>
            ))}
            <line x1={M.left} x2={width - M.right} y1={y0} y2={y0} stroke="var(--muted-foreground)" strokeWidth={1} opacity={0.6} aria-hidden />
            {n > 1 && <path d={line} fill="none" stroke="var(--chart-net)" strokeWidth={2} strokeLinejoin="round" aria-hidden />}
            {net.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r={4} fill="var(--chart-net)" stroke="var(--card)" strokeWidth={2} aria-hidden />
            ))}
            {labels.map((l, i) => (
              <rect key={`h${l}`} x={M.left + band * i} y={M.top} width={band} height={ih} fill="transparent" tabIndex={0} role="img"
                aria-label={`${l}: ${t("revenue")} ${money.format(revenue[i])}, ${t("cost")} ${money.format(cost[i])}, ${t("net")} ${money.format(net[i])}`}
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}
                className="outline-none focus-visible:stroke-ring focus-visible:[stroke-width:2]" />
            ))}
          </svg>
        )}
        {w !== null && hover !== null && (
          <div className="pointer-events-none absolute z-10 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-md" style={{ left: tipX, top: M.top, width: TIP }} aria-hidden>
            <p className="mb-2 font-medium">{labels[hover]}</p>
            {series.map(([k, c]) => {
              const v = k === "revenue" ? revenue[hover] : k === "cost" ? cost[hover] : net[hover];
              return (
                <div key={k} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{t(k)}</span>
                  <span className="tabular-nums font-medium">{money.format(v)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
