"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify, notifyResult } from "@/components/ui/toast";
import { revalueEntry } from "@/app/actions/ledger";
import { fmtMoney } from "@/lib/money";

type Entry = {
  id: string; currency: string; amount: number; exchangeRate: number; vndAmount: number | null; rateSource: string | null;
  transferId?: string | null; deductedFromId?: string | null; deductedFee?: { amount: number } | null;
};

const vndFmt = new Intl.NumberFormat("vi-VN");
const rateFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

// A recorded foreign-currency entry keeps the VND value it was booked at.
// Changing it is an explicit revaluation: admin only, with a preview of the old
// and new value and a reason that goes into the change history.
export function BookedRate({ entry, isAdmin, locked, defaultUsdRate }: { entry: Entry; isAdmin: boolean; locked: boolean; defaultUsdRate: number }) {
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
  const router = useRouter();
  const booked = Math.round(entry.vndAmount ?? entry.amount * entry.exchangeRate);
  const fee = entry.deductedFee?.amount ?? 0;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"DEFAULT" | "MANUAL" | "BANK">(entry.currency === "USD" ? "DEFAULT" : "MANUAL");
  const [rate, setRate] = useState("");
  const [vnd, setVnd] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // The new VND value, as the server will work it out.
  const r = parseFloat(rate), v = parseFloat(vnd);
  const after = mode === "DEFAULT" ? Math.round(entry.amount * defaultUsdRate)
    : mode === "MANUAL" ? (r > 0 ? Math.round(entry.amount * r) : null)
    : v > 0 ? Math.round(fee ? entry.amount * (v / (entry.amount - fee)) : v) : null;

  const canRevalue = isAdmin && !locked && !entry.transferId && !entry.deductedFromId;
  const modes: ["DEFAULT" | "MANUAL" | "BANK", string][] = [
    ...(entry.currency === "USD" ? [["DEFAULT", t("revalue.modeDefault", { rate: rateFmt.format(defaultUsdRate) })] as ["DEFAULT", string]] : []),
    ["MANUAL", t("form.rateManual")],
    ["BANK", t("form.rateBank")],
  ];

  async function save() {
    if (after === null) { notify.error(t("revalue.errors.enterValue")); return; }
    if (!reason.trim()) { notify.error(t("errors.reasonRequired")); return; }
    setSaving(true);
    const fd = new FormData();
    fd.set("rateMode", mode);
    if (mode === "MANUAL") fd.set("rate", rate);
    if (mode === "BANK") fd.set("vndAmount", vnd);
    fd.set("reason", reason);
    try {
      if (notifyResult(await revalueEntry(entry.id, fd), t("revalue.done"))) { setOpen(false); setReason(""); router.refresh(); }
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm">
        {t("revalue.booked", {
          rate: rateFmt.format(entry.exchangeRate), currency: entry.currency, vnd: vndFmt.format(booked),
          source: entry.rateSource ? tc(`rateSource.${entry.rateSource}`) : "—",
        })}
      </p>
      {fee > 0 && <p className="text-xs text-muted-foreground">{t("revalue.withFee", { fee: fmtMoney(fee, entry.currency) })}</p>}
      <p className="text-xs text-muted-foreground">
        {locked ? t("revalue.postedHint") : entry.deductedFromId ? t("revalue.feeHint") : entry.transferId ? t("revalue.transferHint") : isAdmin ? t("revalue.keptHint") : t("revalue.adminOnly")}
      </p>
      {canRevalue && !open && (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>{t("revalue.open")}</Button>
      )}
      {canRevalue && open && (
        <div className="space-y-3 rounded-md border bg-background p-3"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (!saving) save(); } }}>
          <div className="flex bg-muted p-0.5 rounded text-xs font-medium w-fit">
            {modes.map(([m, text]) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`px-2 py-1 rounded-sm ${mode === m ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</button>
            ))}
          </div>
          {mode === "MANUAL" && <Input type="number" step="any" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder={t("form.ratePlaceholder", { currency: entry.currency })} />}
          {mode === "BANK" && <Input type="number" step="1" min="0" value={vnd} onChange={(e) => setVnd(e.target.value)} placeholder={fee ? t("revalue.netPlaceholder") : t("form.vndPlaceholder")} />}
          <p className="text-sm font-medium tabular-nums">
            {t("revalue.preview", { before: vndFmt.format(booked), after: after === null ? "…" : vndFmt.format(after) })}
          </p>
          <div className="space-y-1">
            <Label htmlFor={`rv-${entry.id}`}>{t("revalue.reason")}</Label>
            <Input id={`rv-${entry.id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("revalue.reasonPlaceholder")} />
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={save} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t("revalue.confirm")}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{tc("actions.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
