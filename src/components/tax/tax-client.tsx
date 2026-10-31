"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, CircleCheck, ChevronRight, FileText, Info, Loader2, Pencil, Plus, Scale, Trash2, TriangleAlert, Undo2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notify } from "@/components/ui/toast";
import { uploadProblem } from "@/lib/upload-limit";
import { fmtDate, fmtMonth } from "@/lib/format";
import { FORMS, LINES, VAT_ROWS, TEMPLATES, formKey, lineKey, periodLabel, type Flag, type Form, type Comparison } from "@/lib/tax";
import { saveTaxReturn, deleteTaxReturn, deleteTaxReturnFile, setTaxFlagNote, clearTaxFlagNote } from "@/app/actions/tax";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, Notice, PanelHead, Stat, StatStrip, type Tone } from "@/components/wf/ledger-ui";

export type FlagView = Flag & { note: { text: string; user: string | null; at: string } | null; changedFrom: number | null };
export type ReturnView = {
  id: string; form: string; period: string; template: string; supplement: number; filedDate: string | null; dueDate: string | null;
  submissionRef: string | null; preparedBy: string | null; notes: string | null; lines: Record<string, number>;
  files: { id: string; name: string; url: string }[]; latest: boolean;
};

// VND written the way the rest of the app writes it, in either language.
const nf = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const vnd = (v: number) => `${nf.format(Math.round(v))} ₫`;
const ext = (name: string) => (name.split(".").pop() || "").toUpperCase().slice(0, 4);

const SEVERITY_TONE: Record<Flag["severity"], Tone> = { high: "neg", medium: "warn", info: "neutral" };
const SEVERITY_ICON = { high: TriangleAlert, medium: CircleAlert, info: Info } as const;

function Severity({ s }: { s: Flag["severity"] }) {
  const t = useTranslations("tax.flags.severity");
  const Icon = SEVERITY_ICON[s];
  return <Chip tone={SEVERITY_TONE[s]} mono className="shrink-0 sm:mt-px"><Icon className="size-3" aria-hidden="true" />{t(s)}</Chip>;
}

// One flag: a gap between a declaration and the books, as a question (never a conclusion).
function FlagText({ f, locale }: { f: Flag; locale: string }) {
  const t = useTranslations("tax.flags");
  const v = {
    period: f.period ? periodLabel(f.period, locale) : "", form: f.form ?? "", amount: vnd(f.amount ?? 0), date: f.date ? fmtDate(f.date, locale) : "",
    days: f.days ?? 0, month: f.month ? fmtMonth(f.month, locale) : "", code: f.code ?? "", expected: nf.format(f.expected ?? 0), actual: nf.format(f.actual ?? 0),
  };
  return (
    <div className="min-w-0">
      <p className="font-semibold text-foreground">{t(`kinds.${f.kind}.title`, v)}</p>
      <p className="mt-1 text-[14.5px] text-text-secondary">
        {t(`kinds.${f.kind}.body`, v)}
        {f.provisionalVnd ? ` ${t("provisionalPart", { amount: vnd(f.provisionalVnd) })}` : ""}
      </p>
    </div>
  );
}

function NoteDialog({ flag, locale, trigger }: { flag: FlagView; locale: string; trigger: React.ReactElement }) {
  const t = useTranslations("tax.flags");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  function openChange(o: boolean) {
    if (o) { setText(flag.note?.text ?? ""); setErr(""); }
    setOpen(o);
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await setTaxFlagNote(flag.key, text, flag.figure ?? null);
      if (!res.success) { setErr(res.message ?? tc("errors.couldNotSave")); return; }
      notify.success(t("toastNoted"));
      setOpen(false); router.refresh();
    } catch { notify.error(tc("errors.somethingWrong")); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={openChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("noteTitle")}</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg bg-muted/40 px-4 py-3"><FlagText f={flag} locale={locale} /></div>
          <div className="grid gap-2">
            <Label htmlFor="flag-note">{t("noteLabel")}</Label>
            <textarea id="flag-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
              placeholder={t("notePlaceholder")}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-[15px] text-foreground transition-colors duration-150 ease-wf outline-none placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring" />
          </div>
          {err && <p role="alert" className="flex items-center gap-1.5 text-[13.5px] text-destructive"><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}</p>}
          <Button className="w-full" disabled={busy || !text.trim()} onClick={save}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("saveNote")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Record or open a filed declaration. Once recorded, its form and quarter stay as they are
// (to file one under another quarter, delete it and record it again).
function ReturnDialog({ ret, preset, defaultPeriod, locale, trigger }: {
  ret?: ReturnView; preset?: { form: Form; period: string }; defaultPeriod: string; locale: string; trigger: React.ReactElement;
}) {
  const t = useTranslations("tax");
  const tc = useTranslations("common");
  const router = useRouter();
  const start = () => ({ form: ((ret?.form ?? preset?.form) as Form) ?? "01/GTGT", period: ret?.period ?? preset?.period ?? defaultPeriod });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [form, setForm] = useState<Form>(start().form);
  const [quarter, setQuarter] = useState(start().period.split("-Q")[1]);
  const [year, setYear] = useState(start().period.split("-Q")[0]);
  // Every opening starts from the record (or the preset), never from an unsaved earlier attempt.
  function openChange(o: boolean) {
    if (o) { const s = start(); setForm(s.form); setYear(s.period.split("-Q")[0]); setQuarter(s.period.split("-Q")[1]); setErr(""); }
    setOpen(o);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const fd = new FormData(el);
    const tooBig = uploadProblem(fd.getAll("files") as File[], tc);
    if (tooBig) { setErr(tooBig); return; }
    const period = `${year.trim()}-Q${quarter}`;
    fd.set("form", form); fd.set("period", period);
    setBusy(true); setErr("");
    try {
      const res = await saveTaxReturn(ret?.id ?? null, fd);
      if (!res.success) {
        setErr(res.message ?? tc("errors.couldNotSave"));
        // Take the owner to the figure that didn't read.
        const field = "field" in res && res.field ? el.querySelector<HTMLInputElement>(`[name="${res.field}"]`) : null;
        field?.focus();
        return;
      }
      notify.success(ret ? t("toast.saved") : t("toast.added"), `${form} ${periodLabel(period, locale)}`);
      setOpen(false); router.refresh();
    } catch { notify.error(tc("errors.somethingWrong")); } finally { setBusy(false); }
  }
  async function remove() {
    if (!ret || !confirm(t("form.deleteConfirm", { form: ret.form, period: periodLabel(ret.period, locale) }))) return;
    setBusy(true);
    try { await deleteTaxReturn(ret.id); notify.success(t("toast.deleted"), `${ret.form} ${periodLabel(ret.period, locale)}`); setOpen(false); router.refresh(); }
    catch { notify.error(tc("errors.somethingWrong")); } finally { setBusy(false); }
  }
  async function removeFile(id: string, name: string) {
    if (!confirm(t("form.removeFileConfirm", { name }))) return;
    try { await deleteTaxReturnFile(id); notify.success(t("toast.fileRemoved"), name); router.refresh(); }
    catch { notify.error(tc("errors.somethingWrong")); }
  }
  const shown = (code: string) => (ret?.form === form && ret.lines[code] ? nf.format(ret.lines[code]) : "");
  const signed = new Set(LINES[form].filter((l) => l.signed).map((l) => l.code));
  const figure = (code: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`tr-l-${code}`} className="text-[13.5px] leading-tight font-normal text-text-secondary">
        <span className="wf-num text-muted-foreground">[{code}]</span> {t(`lines.${formKey(form)}.${lineKey(code)}`)}
      </Label>
      <Input id={`tr-l-${code}`} name={`line_${code}`} inputMode={signed.has(code) ? "text" : "numeric"} defaultValue={shown(code)}
        placeholder="0" className="h-8 text-right font-mono tabular-nums" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={openChange} disablePointerDismissal>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ret ? t("form.titleEdit", { form: ret.form, period: periodLabel(ret.period, locale) }) : t("form.titleAdd")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-4">
            {ret ? (
              <p className="text-[15px] text-foreground sm:col-span-4"><span className="text-muted-foreground">{t("form.form")}:</span> {t(`forms.${formKey(form)}`)} · {periodLabel(ret.period, locale)}</p>
            ) : (
              <>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="tr-form">{t("form.form")}</Label>
                  <Select value={form} onValueChange={(v) => v && setForm(v as Form)}>
                    <SelectTrigger id="tr-form" className="w-full"><span>{t(`forms.${formKey(form)}`)}</span></SelectTrigger>
                    <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f}>{t(`forms.${formKey(f)}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tr-year">{t("form.year")}</Label>
                  <Input id="tr-year" inputMode="numeric" pattern="\d{4}" required value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tr-quarter">{t("form.quarter")}</Label>
                  <Select value={quarter} onValueChange={(v) => v && setQuarter(v)}>
                    <SelectTrigger id="tr-quarter" className="w-full"><span>{t("form.quarterN", { n: quarter })}</span></SelectTrigger>
                    <SelectContent>{["1", "2", "3", "4"].map((n) => <SelectItem key={n} value={n}>{t("form.quarterN", { n })}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="grid content-start gap-2">
              <Label htmlFor="tr-supp">{t("form.supplement")}</Label>
              <Input id="tr-supp" name="supplement" type="number" min={0} max={20} step={1} defaultValue={ret?.supplement ?? 0} />
              <p className="text-[13.5px] text-muted-foreground">{t("form.supplementHint")}</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="tr-filed">{t("form.filedDate")}</Label>
              <Input id="tr-filed" name="filedDate" type="date" defaultValue={ret?.filedDate ?? ""} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="tr-due">{t("form.dueDate")}</Label>
              <Input id="tr-due" name="dueDate" type="date" defaultValue={ret?.dueDate ?? ""} />
              <p className="text-[13.5px] text-muted-foreground">{t("form.dueHint")}</p>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="tr-template">{t("form.template")}</Label>
              <Input id="tr-template" name="template" readOnly value={ret?.template ?? TEMPLATES[0]} className="bg-muted/40" />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="tr-ref">{t("form.submissionRef")}</Label>
              <Input id="tr-ref" name="submissionRef" maxLength={100} defaultValue={ret?.submissionRef ?? ""} placeholder={t("form.submissionRefPlaceholder")} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="tr-by">{t("form.preparedBy")}</Label>
              <Input id="tr-by" name="preparedBy" maxLength={100} defaultValue={ret?.preparedBy ?? ""} />
            </div>
          </div>

          <fieldset className="min-w-0 space-y-3 border-t border-border pt-4">
            <legend className="sr-only">{t("form.figures")}</legend>
            <p aria-hidden="true" className="text-[15px] font-semibold text-foreground">{t("form.figures")}</p>
            <p className="text-[13.5px] text-muted-foreground">{t("form.figuresHint")}</p>
            {form === "01/GTGT" ? (
              // As printed: the value column on the left, the VAT column on the right, row by row.
              <div className="space-y-2.5" key={form}>
                <div className="hidden grid-cols-2 gap-4 sm:grid"><p className="wf-label">{t("form.valueColumn")}</p><p className="wf-label">{t("form.vatColumn")}</p></div>
                {VAT_ROWS.map(([value, tax]) => (
                  <div key={`${value}-${tax}`} className="grid gap-x-4 gap-y-2 sm:grid-cols-2 sm:items-end">
                    {value ? figure(value) : <span className="hidden sm:block" />}
                    {tax ? figure(tax) : <span className="hidden sm:block" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2" key={form}>{LINES[form].map((l) => <div key={l.code}>{figure(l.code)}</div>)}</div>
            )}
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="tr-notes">{t("form.notes")}</Label>
            <Input id="tr-notes" name="notes" maxLength={2000} defaultValue={ret?.notes ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tr-files">{t("form.files")}</Label>
            <Input id="tr-files" name="files" type="file" multiple accept=".pdf,.xml,.xls,.xlsx,.zip,.png,.jpg,.jpeg" />
            <p className="text-[13.5px] text-muted-foreground">{t("form.filesHint")}</p>
            {ret && ret.files.length > 0 && (
              <ul className="mt-1 border-y border-border text-[14.5px]">
                {ret.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2 border-t border-border py-1 first:border-t-0">
                    <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{f.name}</a>
                    <Button type="button" variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" aria-label={t("form.removeFile", { name: f.name })} onClick={() => removeFile(f.id, f.name)}>
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {err && <p role="alert" className="flex items-center gap-1.5 text-[13.5px] text-destructive"><CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}</p>}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {ret && <Button type="button" variant="destructive" disabled={busy} onClick={remove}><Trash2 aria-hidden="true" />{t("form.delete")}</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{tc("actions.cancel")}</Button>
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : ret ? tc("actions.save") : t("form.submitAdd")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaxClient({ flags, returns, periods, comparison, defaultPeriod, locale }: {
  flags: FlagView[]; returns: ReturnView[]; periods: string[]; comparison: Comparison[]; defaultPeriod: string; locale: string;
}) {
  const t = useTranslations("tax");
  const tc = useTranslations("common");
  const router = useRouter();
  // A note made when the figure was different doesn't settle the flag: it comes back, note shown.
  const open = flags.filter((f) => !f.note || f.changedFrom != null);
  const known = flags.filter((f) => f.note && f.changedFrom == null);
  const find = (form: string, period: string) => returns.find((r) => r.form === form && r.period === period && r.latest);
  const earlier = (period: string) => returns.filter((r) => r.period === period && !r.latest).sort((a, b) => a.form.localeCompare(b.form) || a.supplement - b.supplement);
  const date = (d: string | null) => (d ? fmtDate(d, locale) : "");

  async function reopen(key: string) {
    if (!confirm(t("flags.reopenConfirm"))) return;
    try { await clearTaxFlagNote(key); notify.success(t("flags.toastReopened")); router.refresh(); }
    catch { notify.error(tc("errors.somethingWrong")); }
  }
  const cell = (r: ReturnView | undefined, code: string) => (r ? nf.format(r.lines[code] ?? 0) : "—");
  const record = (form: Form, period: string, label: string) => (
    <ReturnDialog preset={{ form, period }} defaultPeriod={period} locale={locale}
      trigger={<Button variant="outline" size="xs"><Plus aria-hidden="true" />{label}</Button>} />
  );
  const filed = (r: ReturnView | undefined, form: Form, p: string) => r ? (
    <span className="inline-flex items-start gap-1">
      <span className="wf-num pt-1">{date(r.filedDate)}{r.supplement > 0 ? ` · ${t("returns.supplement", { n: r.supplement })}` : ""}{r.dueDate ? <span className="block text-muted-foreground">{t("returns.due", { date: date(r.dueDate) })}</span> : null}</span>
      <ReturnDialog ret={r} defaultPeriod={p} locale={locale}
        trigger={<Button variant="ghost" size="icon-xs" aria-label={t("returns.edit", { form, period: periodLabel(p, locale) })}><Pencil aria-hidden="true" /></Button>} />
    </span>
  ) : record(form, p, t("returns.notRecorded"));

  const flagRow = (f: FlagView, knownRow: boolean) => (
    <li key={f.key} className="flex-col items-start gap-2 sm:flex-row sm:gap-3">
      <Severity s={f.severity} />
      <div className="w-full min-w-0 sm:flex-1">
        <FlagText f={f} locale={locale} />
        {f.changedFrom != null && <p className="mt-1.5 text-[14.5px] text-warn">{t("flags.changed", { was: f.kind === "math" || f.kind === "creditChain" ? nf.format(f.changedFrom) : vnd(f.changedFrom) })}</p>}
        {f.note && (
          <>
            <p className="mt-2 text-[14.5px] text-foreground"><span className="font-semibold">{t("flags.noteLabel")}:</span> {f.note.text}</p>
            <p className="mt-0.5 text-[13.5px] text-muted-foreground">{t("flags.by", { user: f.note.user ?? "—", date: date(f.note.at) })}</p>
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {f.kind === "missingReturn" && f.form && f.period && record(f.form as Form, f.period, t("flags.recordIt"))}
        {knownRow ? (
          <>
            <NoteDialog flag={f} locale={locale} trigger={<Button variant="ghost" size="icon-xs" aria-label={`${t("flags.editNote")}: ${f.key}`}><Pencil aria-hidden="true" /></Button>} />
            <Button variant="ghost" size="xs" onClick={() => reopen(f.key)}><Undo2 aria-hidden="true" />{t("flags.reopen")}</Button>
          </>
        ) : (
          <NoteDialog flag={f} locale={locale} trigger={<Button variant="outline" size="xs"><Check aria-hidden="true" />{f.note ? t("flags.editNote") : t("flags.markKnown")}</Button>} />
        )}
      </div>
    </li>
  );

  // The figures at the top: what is open (by severity), what is known, what is recorded,
  // and the latest quarter's books-vs-declared gap (comparison is newest first).
  const bySeverity = (["high", "medium", "info"] as const)
    .map((s) => [s, open.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0);
  const latest = comparison[0];
  const gap = latest && Math.abs(latest.difference) >= 0.5;

  return (
    <div>
      <PageHeader
        section="tax"
        title={t("page.title")}
        description={t("page.subtitle")}
        actions={<ReturnDialog defaultPeriod={defaultPeriod} locale={locale} trigger={<Button><Plus aria-hidden="true" />{t("page.addReturn")}</Button>} />}
      />

      <StatStrip className="lg:grid-cols-4">
        <Stat
          label={t("flags.title")}
          icon={TriangleAlert}
          tone={open.length > 0 ? "warn" : "neutral"}
          emphasis
          sub={bySeverity.map(([s, n]) => t("stats.severityCount", { count: n, severity: t(`flags.severity.${s}`).toLowerCase() })).join(" · ") || t("flags.none")}
        >
          {open.length}
        </Stat>
        <Stat label={t("flags.known")} icon={CircleCheck} sub={t("stats.knownDetail")}>
          {known.length}
        </Stat>
        <Stat label={t("stats.returns")} icon={FileText} sub={t("stats.quarters", { count: periods.length })}>
          {returns.length}
        </Stat>
        <Stat
          label={t("stats.difference")}
          icon={Scale}
          tone={gap ? "warn" : "neutral"}
          sub={latest ? t("stats.differenceDetail", { period: periodLabel(latest.period, locale), books: vnd(latest.books), declared: vnd(latest.declared) }) : t("compare.none")}
        >
          {gap ? vnd(latest.difference) : "–"}
        </Stat>
      </StatStrip>

      <Notice tone="info" className="mt-6">{t("page.disclaimer")}</Notice>

      <div className="mt-6 grid gap-6">
        <Card>
          <PanelHead title={t("flags.title")} count={open.length} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("flags.subtitle")}</p>
          <ul className="wf-rows">
            {open.map((f) => flagRow(f, false))}
            {open.length === 0 && <li className="text-muted-foreground">{t("flags.none")}</li>}
          </ul>
          {known.length > 0 && (
            <details className="group border-t border-border">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 bg-muted/40 px-5 py-3 font-semibold text-foreground transition-colors duration-150 hover:bg-secondary/45 [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-90" aria-hidden="true" />
                {t("flags.known")}
                <span className="wf-panel__count">{known.length}</span>
              </summary>
              <ul className="wf-rows border-t border-border">{known.map((f) => flagRow(f, true))}</ul>
            </details>
          )}
        </Card>

        <Card>
          <PanelHead title={t("returns.title")} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("returns.subtitle")}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead rowSpan={2} className="sticky left-0 z-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] align-bottom">{t("returns.quarter")}</TableHead>
                <TableHead colSpan={6} className="border-l border-border text-center">{t("forms.gtgt")}</TableHead>
                <TableHead colSpan={4} className="border-l border-border text-center">{t("forms.tncn")}</TableHead>
              </TableRow>
              {/* The field heads may take two lines, so the quarters fit a 1920px screen at reading size. */}
              <TableRow className="[&>th]:h-auto [&>th]:py-2 [&>th]:align-bottom [&>th]:whitespace-normal">
                <TableHead className="border-l border-border text-right first:pl-3">{t("returns.sales")} [34]</TableHead>
                <TableHead className="text-right">{t("returns.purchases")} [23]</TableHead>
                <TableHead className="text-right">{t("returns.inputVat")} [25]</TableHead>
                <TableHead className="text-right">{t("returns.payable")} [40]</TableHead>
                <TableHead className="text-right">{t("returns.credit")} [43]</TableHead>
                <TableHead>{t("returns.filed")}</TableHead>
                <TableHead className="border-l border-border text-right">{t("returns.employees")} [16]</TableHead>
                <TableHead className="text-right">{t("returns.income")} [21]</TableHead>
                <TableHead className="text-right">{t("returns.withheld")} [29]</TableHead>
                <TableHead>{t("returns.filed")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((p) => {
                const v = find("01/GTGT", p), k = find("05/KK-TNCN", p);
                const files = [...(v?.files ?? []).map((f) => ({ ...f, form: "GTGT" })), ...(k?.files ?? []).map((f) => ({ ...f, form: "TNCN" }))];
                const prior = earlier(p);
                return (
                  <TableRow key={p} className="[&>td]:align-top">
                    <th scope="row" className="sticky left-0 z-10 bg-card py-2.5 pr-3 pl-5 text-left align-top font-semibold whitespace-nowrap text-foreground">
                      {periodLabel(p, locale)}
                      {files.length > 0 && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {files.map((f) => (
                            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.name} className="wf-chip wf-chip--neutral wf-chip--mono">
                              {f.form} {ext(f.name)}
                            </a>
                          ))}
                        </span>
                      )}
                      {prior.length > 0 && (
                        <span className="mt-1.5 block space-y-0.5 text-[13.5px] font-normal">
                          <span className="block text-muted-foreground">{t("returns.supplements", { count: prior.length })}</span>
                          {prior.map((r) => (
                            <ReturnDialog key={r.id} ret={r} defaultPeriod={p} locale={locale} trigger={
                              <button type="button" className="block text-primary hover:underline">
                                {r.form} · {r.supplement ? t("returns.supplement", { n: r.supplement }) : t("returns.original")}{r.filedDate ? ` · ${date(r.filedDate)}` : ""}
                              </button>} />
                          ))}
                        </span>
                      )}
                    </th>
                    <TableCell className="border-l border-border text-right">{cell(v, "34")}</TableCell>
                    <TableCell className="text-right">{cell(v, "23")}</TableCell>
                    <TableCell className="text-right">{cell(v, "25")}</TableCell>
                    <TableCell className="text-right">{cell(v, "40")}</TableCell>
                    <TableCell className="text-right">{cell(v, "43")}</TableCell>
                    <TableCell className="text-[13.5px]">{filed(v, "01/GTGT", p)}</TableCell>
                    <TableCell className="border-l border-border text-right">{cell(k, "16")}</TableCell>
                    <TableCell className="text-right">{cell(k, "21")}</TableCell>
                    <TableCell className="text-right">{cell(k, "29")}</TableCell>
                    <TableCell className="text-[13.5px]">{filed(k, "05/KK-TNCN", p)}</TableCell>
                  </TableRow>
                );
              })}
              {periods.length === 0 && <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">{t("returns.none")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <PanelHead title={t("compare.title")} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("compare.subtitle")}</p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("returns.quarter")}</TableHead>
                <TableHead className="text-right">{t("compare.books")}</TableHead>
                <TableHead className="text-right">{t("compare.declared")}</TableHead>
                <TableHead className="text-right">{t("compare.difference")}</TableHead>
                <TableHead className="border-l border-border text-right">{t("compare.outside")}</TableHead>
                <TableHead className="text-right">{t("compare.provisional")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((c) => (
                <TableRow key={c.period}>
                  <TableCell className="font-semibold text-foreground">{periodLabel(c.period, locale)}</TableCell>
                  <TableCell className="text-right">{nf.format(c.books)}</TableCell>
                  <TableCell className="text-right">{nf.format(c.declared)}</TableCell>
                  <TableCell className={cn("text-right font-semibold", Math.abs(c.difference) >= 0.5 && "text-warn")}>{Math.abs(c.difference) < 0.5 ? "–" : nf.format(c.difference)}</TableCell>
                  <TableCell className="border-l border-border text-right">{c.outside ? nf.format(c.outside) : "–"}</TableCell>
                  <TableCell className="text-right">{c.provisional ? nf.format(c.provisional) : "–"}</TableCell>
                </TableRow>
              ))}
              {comparison.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("compare.none")}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="border-t border-border px-5 py-3 text-[13.5px] text-muted-foreground">{t("compare.note")}</p>
        </Card>
      </div>
    </div>
  );
}
