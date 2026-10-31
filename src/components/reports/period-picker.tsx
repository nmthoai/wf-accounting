"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { MONTH, addMonths } from "@/lib/pnl";

// From–to months for the report, with the usual ranges one click away. Typed
// months apply on Enter or when leaving the field, and only when they are
// real months in range — typing a year doesn't jump the report around.
export function PeriodPicker({ from, to, thisMonth, earliest, latest, min, max }: {
  from: string; to: string; thisMonth: string; earliest: string; latest: string; min: string; max: string;
}) {
  const t = useTranslations("reports.period");
  const router = useRouter();
  const [draft, setDraft] = useState({ from, to, shown: `${from}_${to}` });
  // A new period from the server (a preset, back/forward) replaces the draft.
  if (draft.shown !== `${from}_${to}`) setDraft({ from, to, shown: `${from}_${to}` });
  const ok = (m: string) => MONTH.test(m) && m >= min && m <= max;
  const go = (f: string, tt: string) => {
    const [a, b] = f <= tt ? [f, tt] : [tt, f];
    if (a !== from || b !== to) router.push(`/reports?from=${a}&to=${b}`);
  };
  const apply = () => (ok(draft.from) && ok(draft.to) ? go(draft.from, draft.to) : setDraft({ from, to, shown: draft.shown }));
  const presets: [string, string, string][] = [
    [t("thisMonth"), thisMonth, thisMonth],
    [t("last3"), addMonths(thisMonth, -2), thisMonth],
    [t("last6"), addMonths(thisMonth, -5), thisMonth],
    [t("last12"), addMonths(thisMonth, -11), thisMonth],
    [t("ytd"), `${thisMonth.slice(0, 4)}-01`, thisMonth],
    [t("all"), earliest < thisMonth ? earliest : thisMonth, latest > thisMonth ? latest : thisMonth],
  ];
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") apply(); };

  return (
    <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
      {/* One row from xl, where the header has room; it never loses just its last button. */}
      <div className="wf-seg xl:flex-nowrap" role="group" aria-label={t("presets")}>
        {presets.map(([label, f, tt]) => (
          <button key={label} type="button" aria-pressed={f === from && tt === to} onClick={() => go(f, tt)}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="wf-label" htmlFor="period-from">{t("from")}</label>
        <Input id="period-from" type="month" value={draft.from} min={min} max={max} className="wf-num w-40"
          onChange={(e) => setDraft({ ...draft, from: e.target.value })} onBlur={apply} onKeyDown={onKey} />
        <label className="wf-label" htmlFor="period-to">{t("to")}</label>
        <Input id="period-to" type="month" value={draft.to} min={min} max={max} className="wf-num w-40"
          onChange={(e) => setDraft({ ...draft, to: e.target.value })} onBlur={apply} onKeyDown={onKey} />
      </div>
    </div>
  );
}
