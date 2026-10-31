"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, CircleAlert, Info, Loader2, Pencil, Plus, Trash2, Undo2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function Severity({ s }: { s: Flag["severity"] }) {
  const t = useTranslations("tax.flags.severity");
  const Icon = s === "high" ? AlertTriangle : s === "medium" ? CircleAlert : Info;
  const tone = s === "high" ? "bg-red-100 text-red-800" : s === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${tone}`}><Icon className="h-3.5 w-3.5" aria-hidden />{t(s)}</span>;
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
      <p className="font-medium">{t(`kinds.${f.kind}.title`, v)}</p>
      <p className="text-sm text-muted-foreground">
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
        <div className="space-y-3 pt-2">
          <div className="rounded-md border bg-muted/30 p-3"><FlagText f={flag} locale={locale} /></div>
          <Label htmlFor="flag-note">{t("noteLabel")}</Label>
          <textarea id="flag-note" value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000}
            placeholder={t("notePlaceholder")} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm" />
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <Button className="w-full" disabled={busy || !text.trim()} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("saveNote")}</Button>
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
    <div className="space-y-1">
      <Label htmlFor={`tr-l-${code}`} className="text-xs font-normal leading-tight">
        <span className="font-mono text-muted-foreground">[{code}]</span> {t(`lines.${formKey(form)}.${lineKey(code)}`)}
      </Label>
      <Input id={`tr-l-${code}`} name={`line_${code}`} inputMode={signed.has(code) ? "text" : "numeric"} defaultValue={shown(code)}
        placeholder="0" className="h-8 text-right tabular-nums" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={openChange} disablePointerDismissal>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{ret ? t("form.titleEdit", { form: ret.form, period: periodLabel(ret.period, locale) }) : t("form.titleAdd")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-4">
            {ret ? (
              <p className="sm:col-span-4 text-sm"><span className="text-muted-foreground">{t("form.form")}:</span> {t(`forms.${formKey(form)}`)} · {periodLabel(ret.period, locale)}</p>
            ) : (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="tr-form">{t("form.form")}</Label>
                  <Select value={form} onValueChange={(v) => v && setForm(v as Form)}>
                    <SelectTrigger id="tr-form"><span>{t(`forms.${formKey(form)}`)}</span></SelectTrigger>
                    <SelectContent>{FORMS.map((f) => <SelectItem key={f} value={f}>{t(`forms.${formKey(f)}`)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tr-year">{t("form.year")}</Label>
                  <Input id="tr-year" inputMode="numeric" pattern="\d{4}" required value={year} onChange={(e) => setYear(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tr-quarter">{t("form.quarter")}</Label>
                  <Select value={quarter} onValueChange={(v) => v && setQuarter(v)}>
                    <SelectTrigger id="tr-quarter"><span>{t("form.quarterN", { n: quarter })}</span></SelectTrigger>
                    <SelectContent>{["1", "2", "3", "4"].map((n) => <SelectItem key={n} value={n}>{t("form.quarterN", { n })}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="tr-supp">{t("form.supplement")}</Label>
              <Input id="tr-supp" name="supplement" type="number" min={0} max={20} step={1} defaultValue={ret?.supplement ?? 0} />
              <p className="text-xs text-muted-foreground">{t("form.supplementHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-filed">{t("form.filedDate")}</Label>
              <Input id="tr-filed" name="filedDate" type="date" defaultValue={ret?.filedDate ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-due">{t("form.dueDate")}</Label>
              <Input id="tr-due" name="dueDate" type="date" defaultValue={ret?.dueDate ?? ""} />
              <p className="text-xs text-muted-foreground">{t("form.dueHint")}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-template">{t("form.template")}</Label>
              <Input id="tr-template" name="template" readOnly value={ret?.template ?? TEMPLATES[0]} className="bg-muted/40" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tr-ref">{t("form.submissionRef")}</Label>
              <Input id="tr-ref" name="submissionRef" maxLength={100} defaultValue={ret?.submissionRef ?? ""} placeholder={t("form.submissionRefPlaceholder")} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="tr-by">{t("form.preparedBy")}</Label>
              <Input id="tr-by" name="preparedBy" maxLength={100} defaultValue={ret?.preparedBy ?? ""} />
            </div>
          </div>

          <fieldset className="rounded-md border p-3 space-y-3 min-w-0">
            <legend className="px-1 text-sm font-medium">{t("form.figures")}</legend>
            <p className="text-xs text-muted-foreground">{t("form.figuresHint")}</p>
            {form === "01/GTGT" ? (
              // As printed: the value column on the left, the VAT column on the right, row by row.
              <div className="space-y-2" key={form}>
                <div className="hidden sm:grid grid-cols-2 gap-4 text-xs font-medium text-muted-foreground"><span>{t("form.valueColumn")}</span><span>{t("form.vatColumn")}</span></div>
                {VAT_ROWS.map(([value, tax]) => (
                  <div key={`${value}-${tax}`} className="grid gap-x-4 gap-y-2 sm:grid-cols-2 sm:items-end">
                    {value ? figure(value) : <span className="hidden sm:block" />}
                    {tax ? figure(tax) : <span className="hidden sm:block" />}
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2" key={form}>{LINES[form].map((l) => <div key={l.code}>{figure(l.code)}</div>)}</div>
            )}
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="tr-notes">{t("form.notes")}</Label>
            <Input id="tr-notes" name="notes" maxLength={2000} defaultValue={ret?.notes ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tr-files">{t("form.files")}</Label>
            <Input id="tr-files" name="files" type="file" multiple accept=".pdf,.xml,.xls,.xlsx,.zip,.png,.jpg,.jpeg" />
            <p className="text-xs text-muted-foreground">{t("form.filesHint")}</p>
            {ret && ret.files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {ret.files.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-2">
                    <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">{f.name}</a>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={t("form.removeFile", { name: f.name })} onClick={() => removeFile(f.id, f.name)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
          <div className="flex flex-wrap gap-2">
            {ret && <Button type="button" variant="outline" className="text-destructive" disabled={busy} onClick={remove}><Trash2 className="h-4 w-4" />{t("form.delete")}</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{tc("actions.cancel")}</Button>
            <Button type="submit" className="flex-1" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : ret ? tc("actions.save") : t("form.submitAdd")}</Button>
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
      trigger={<Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><Plus className="h-3.5 w-3.5" />{label}</Button>} />
  );
  const filed = (r: ReturnView | undefined, form: Form, p: string) => r ? (
    <span className="inline-flex items-center gap-1">
      <span>{date(r.filedDate)}{r.supplement > 0 ? ` · ${t("returns.supplement", { n: r.supplement })}` : ""}{r.dueDate ? <span className="block text-muted-foreground">{t("returns.due", { date: date(r.dueDate) })}</span> : null}</span>
      <ReturnDialog ret={r} defaultPeriod={p} locale={locale}
        trigger={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t("returns.edit", { form, period: periodLabel(p, locale) })}><Pencil className="h-3.5 w-3.5" /></Button>} />
    </span>
  ) : record(form, p, t("returns.notRecorded"));

  const flagRow = (f: FlagView, knownRow: boolean) => (
    <div key={f.key} className={`flex flex-col items-start gap-2 sm:flex-row sm:gap-3 ${knownRow ? "" : "rounded-md border p-3"}`}>
      <Severity s={f.severity} />
      <div className="w-full min-w-0 sm:flex-1">
        <FlagText f={f} locale={locale} />
        {f.changedFrom != null && <p className="mt-1 text-sm text-amber-800">{t("flags.changed", { was: f.kind === "math" || f.kind === "creditChain" ? nf.format(f.changedFrom) : vnd(f.changedFrom) })}</p>}
        {f.note && (
          <>
            <p className="mt-1 text-sm"><span className="font-medium">{t("flags.noteLabel")}:</span> {f.note.text}</p>
            <p className="text-xs text-muted-foreground">{t("flags.by", { user: f.note.user ?? "—", date: date(f.note.at) })}</p>
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {f.kind === "missingReturn" && f.form && f.period && record(f.form as Form, f.period, t("flags.recordIt"))}
        {knownRow ? (
          <>
            <NoteDialog flag={f} locale={locale} trigger={<Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`${t("flags.editNote")}: ${f.key}`}><Pencil className="h-3.5 w-3.5" /></Button>} />
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => reopen(f.key)}><Undo2 className="h-3.5 w-3.5" />{t("flags.reopen")}</Button>
          </>
        ) : (
          <NoteDialog flag={f} locale={locale} trigger={<Button variant="outline" size="sm" className="h-7 gap-1 text-xs"><Check className="h-3.5 w-3.5" />{f.note ? t("flags.editNote") : t("flags.markKnown")}</Button>} />
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{t("page.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("page.subtitle")}</p>
        </div>
        <ReturnDialog defaultPeriod={defaultPeriod} locale={locale} trigger={<Button className="gap-2"><Plus className="h-4 w-4" />{t("page.addReturn")}</Button>} />
      </div>
      <p className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("page.disclaimer")}</p>

      <Card>
        <CardHeader>
          <CardTitle>{t("flags.title", { count: open.length })}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("flags.subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {open.map((f) => flagRow(f, false))}
          {open.length === 0 && <p className="text-sm text-muted-foreground">{t("flags.none")}</p>}
          {known.length > 0 && (
            <details className="rounded-md border bg-muted/20 p-3">
              <summary className="cursor-pointer text-sm font-medium">{t("flags.known", { count: known.length })}</summary>
              <div className="mt-3 space-y-4">{known.map((f) => flagRow(f, true))}</div>
            </details>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("returns.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("returns.subtitle")}</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead rowSpan={2} className="sticky left-0 z-10 bg-muted align-bottom">{t("returns.quarter")}</TableHead>
                <TableHead colSpan={6} className="border-l text-center">{t("forms.gtgt")}</TableHead>
                <TableHead colSpan={4} className="border-l text-center">{t("forms.tncn")}</TableHead>
              </TableRow>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="border-l text-right">{t("returns.sales")} [34]</TableHead>
                <TableHead className="text-right">{t("returns.purchases")} [23]</TableHead>
                <TableHead className="text-right">{t("returns.inputVat")} [25]</TableHead>
                <TableHead className="text-right">{t("returns.payable")} [40]</TableHead>
                <TableHead className="text-right">{t("returns.credit")} [43]</TableHead>
                <TableHead>{t("returns.filed")}</TableHead>
                <TableHead className="border-l text-right">{t("returns.employees")} [16]</TableHead>
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
                  <TableRow key={p} className="tabular-nums align-top">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-medium whitespace-nowrap">
                      {periodLabel(p, locale)}
                      {files.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {files.map((f) => (
                            <a key={f.id} href={f.url} target="_blank" rel="noreferrer" title={f.name}
                              className="rounded border px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground hover:border-primary hover:text-primary">
                              {f.form} {ext(f.name)}
                            </a>
                          ))}
                        </span>
                      )}
                      {prior.length > 0 && (
                        <span className="mt-1 block space-y-0.5 text-xs font-normal">
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
                    <TableCell className="border-l text-right">{cell(v, "34")}</TableCell>
                    <TableCell className="text-right">{cell(v, "23")}</TableCell>
                    <TableCell className="text-right">{cell(v, "25")}</TableCell>
                    <TableCell className="text-right">{cell(v, "40")}</TableCell>
                    <TableCell className="text-right">{cell(v, "43")}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{filed(v, "01/GTGT", p)}</TableCell>
                    <TableCell className="border-l text-right">{cell(k, "16")}</TableCell>
                    <TableCell className="text-right">{cell(k, "21")}</TableCell>
                    <TableCell className="text-right">{cell(k, "29")}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{filed(k, "05/KK-TNCN", p)}</TableCell>
                  </TableRow>
                );
              })}
              {periods.length === 0 && <TableRow><TableCell colSpan={11} className="py-6 text-center text-muted-foreground">{t("returns.none")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("compare.title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("compare.subtitle")}</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead>{t("returns.quarter")}</TableHead>
                <TableHead className="text-right">{t("compare.books")}</TableHead>
                <TableHead className="text-right">{t("compare.declared")}</TableHead>
                <TableHead className="text-right">{t("compare.difference")}</TableHead>
                <TableHead className="border-l text-right">{t("compare.outside")}</TableHead>
                <TableHead className="text-right">{t("compare.provisional")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.map((c) => (
                <TableRow key={c.period} className="tabular-nums">
                  <TableCell className="font-medium whitespace-nowrap">{periodLabel(c.period, locale)}</TableCell>
                  <TableCell className="text-right">{nf.format(c.books)}</TableCell>
                  <TableCell className="text-right">{nf.format(c.declared)}</TableCell>
                  <TableCell className={`text-right font-medium ${Math.abs(c.difference) >= 0.5 ? "text-amber-800" : ""}`}>{Math.abs(c.difference) < 0.5 ? "–" : nf.format(c.difference)}</TableCell>
                  <TableCell className="border-l text-right">{c.outside ? nf.format(c.outside) : "–"}</TableCell>
                  <TableCell className="text-right">{c.provisional ? nf.format(c.provisional) : "–"}</TableCell>
                </TableRow>
              ))}
              {comparison.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">{t("compare.none")}</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="px-4 py-3 text-xs text-muted-foreground">{t("compare.note")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
