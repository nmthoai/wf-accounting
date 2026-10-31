"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Loader2, X, Plus, Link2, Trash2, CircleAlert, CircleCheck } from "lucide-react";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { previewStatement, importStatement, matchLine, unmatchEntry, deleteStatement } from "@/app/actions/bank";
import { fmtMoney, EPS } from "@/lib/money";
import { cn } from "@/lib/utils";
import { notify, notifyResult, notifyFailure } from "@/components/ui/toast";
import { Chip, Notice, type Tone } from "@/components/wf/ledger-ui";

export type EntryOpt = { id: string; accountId: string; date: string; amount: number; label: string; href: string }; // amount: signed, account currency
type Linked = { id: string; label: string; date: string; amount: number; href: string };
export type LineRow = {
  id: string; accountId: string; accountName: string; currency: string;
  txnDate: string; postingDate: string | null; reference: string | null; counterparty: string | null; description: string | null; locator: string;
  amount: number; remaining: number; status: "MATCHED" | "PARTIAL" | "UNMATCHED";
  entries: Linked[]; suggestion: EntryOpt | null;
};
export type AccountSummary = {
  id: string; name: string; currency: string;
  bankClosing: number | null; asOf: string | null; appBalance: number | null;
  lines: number; open: number; drafts: number; rejected: number; notOnStatement: Linked[];
};
export type StatementRow = {
  id: string; accountName: string; currency: string; fileName: string; periodFrom: string; periodTo: string;
  opening: number; inflows: number; outflows: number; closing: number;
  lineCount: number; added: number; importedBy: string | null; importedAt: string;
};
type Preview = Extract<Awaited<ReturnType<typeof previewStatement>>, { success: true }>["preview"];

const tol = (currency: string) => (currency === "VND" ? 0.5 : EPS);
const signed = (n: number, c: string) => `${n < 0 ? "−" : "+"}${fmtMoney(Math.abs(n), c)}`;
const STATUS_TONE: Record<LineRow["status"], Tone> = { MATCHED: "pos", PARTIAL: "warn", UNMATCHED: "neg" };

async function act(fn: () => Promise<{ success: boolean; message?: string }>, refresh: () => void, done: string) {
  let res;
  try { res = await fn(); } catch { notifyFailure(); return; }
  notifyResult(res, done);
  refresh();
}

function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{children}
    </p>
  );
}

// Upload a statement, check it adds up, then append its new lines.
function ImportDialog({ accounts }: { accounts: AccountOpt[] }) {
  const t = useTranslations("bank");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.type === "BANK")?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [opening, setOpening] = useState("");
  const [closing, setClosing] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState("");
  const account = accounts.find((a) => a.id === accountId);

  function reset() { setPreview(null); setErr(""); setDone(""); }
  const formData = () => { const fd = new FormData(); fd.set("file", file!); fd.set("accountId", accountId); return fd; };

  async function read() {
    setBusy(true); reset();
    try {
      const res = await previewStatement(formData());
      if (!res.success) { setErr(res.message ?? t("import.couldNotRead")); return; }
      setPreview(res.preview);
      setOpening(res.preview.opening === null ? "" : String(res.preview.opening));
      setClosing(res.preview.closing === null ? "" : String(res.preview.closing));
    } catch {
      notifyFailure();
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const fd = formData();
      fd.set("opening", opening); fd.set("closing", closing);
      const res = await importStatement(fd);
      if (!res.success) { setErr(res.message ?? t("import.couldNotImport")); return; }
      setDone(res.skipped ? t("import.doneSkipped", { added: res.added!, skipped: res.skipped }) : t("import.done", { added: res.added! }));
      notify.success(t("import.toast.title"), res.skipped ? t("import.toast.addedSkipped", { added: res.added!, skipped: res.skipped }) : t("import.toast.added", { added: res.added! }));
      setPreview(null);
      router.refresh();
    } catch {
      notifyFailure();
    } finally { setBusy(false); }
  }

  const cur = account?.currency ?? "VND";
  const o = parseFloat(opening), c = parseFloat(closing);
  const expected = preview ? o + preview.inflows - preview.outflows : NaN;
  const complete = Number.isFinite(expected) && Number.isFinite(c);
  const addsUp = preview !== null && complete && Math.abs(expected - c) <= tol(cur);
  const fresh = preview ? preview.count - preview.duplicates : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setFile(null); } }}>
      <DialogTrigger render={<Button />}><Upload aria-hidden="true" />{t("import.trigger")}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("import.title")}</DialogTitle></DialogHeader>
        <div className="grid gap-4 pt-1">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label>{t("import.account")}</Label>
              <AccountSelect accounts={accounts.filter((a) => a.type === "BANK")} value={accountId} onChange={(id) => { setAccountId(id); reset(); }} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="statement-file">{t("import.file")}</Label>
              <Input id="statement-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
            </div>
          </div>
          {!preview && !done && (
            <Button type="button" variant="outline" className="w-full" disabled={!file || !accountId || busy} onClick={read}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("import.read")}
            </Button>
          )}

          {preview && (
            <div className="grid gap-4 border-t border-border pt-4">
              <div className="grid gap-1">
                <p className="text-text-secondary">
                  {t.rich(preview.duplicates > 0 ? "import.summaryWithDuplicates" : "import.summary", {
                    count: preview.count, from: preview.periodFrom, to: preview.periodTo, sheet: preview.sheet, duplicates: preview.duplicates,
                    b: (c) => <span className="font-semibold text-foreground">{c}</span>,
                    muted: (c) => <span className="text-muted-foreground">{c}</span>,
                  })}
                </p>
                <p className="text-[13.5px] text-muted-foreground">
                  {t("import.columnsRead", { columns: Object.entries(preview.columns).map(([f, h]) => `${t(`fields.${f}`)} ← ${h}`).join(" · ") })}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="st-opening">{t("import.opening", { currency: cur })}</Label>
                  <Input id="st-opening" type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder={t("import.balancePlaceholder")} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="st-closing">{t("import.closing", { currency: cur })}</Label>
                  <Input id="st-closing" type="number" step="any" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder={t("import.balancePlaceholder")} />
                </div>
              </div>
              {/* The statement must add up before anything is imported. */}
              <Notice tone={addsUp ? "success" : complete ? "error" : "warning"}>
                <p className="font-mono text-[14px] tabular-nums">
                  {t(addsUp ? "import.check.matches" : complete ? "import.check.off" : "import.check.incomplete", {
                    opening: Number.isFinite(o) ? fmtMoney(o, cur) : "?", inflows: fmtMoney(preview.inflows, cur), outflows: fmtMoney(preview.outflows, cur),
                    expected: Number.isFinite(expected) ? fmtMoney(expected, cur) : "?",
                    closing: fmtMoney(c, cur), diff: fmtMoney(expected - c, cur),
                  })}
                </p>
              </Notice>
              {preview.warnings.length > 0 && (
                <Notice tone="warning">
                  {preview.warnings.map((w) => <p key={w}>{w}</p>)}
                </Notice>
              )}
              <div>
                <p className="wf-label">{t("import.firstLines")}</p>
                <ul className="mt-2 divide-y divide-border border-y border-border text-[14px]">
                  {preview.sample.map((l, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5">
                      <span className="min-w-0 truncate text-text-secondary"><span className="wf-num">{l.date}</span> · {l.reference ?? "—"} · {l.details ?? ""}</span>
                      <span className={cn("wf-num shrink-0 font-semibold", l.amount > 0 && "text-pos")}>{signed(l.amount, cur)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {err && <FormError>{err}</FormError>}
          {done && (
            <p className="flex items-center gap-1.5 text-[14.5px] text-pos">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />{done}
            </p>
          )}
          {preview && (
            <Button type="button" className="w-full" disabled={busy || !addsUp || fresh === 0} onClick={save}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : fresh === 0 ? t("import.nothingNew") : t("import.submit", { count: fresh })}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pick the ledger entries that make up a bank line (one or several).
function MatchDialog({ line, entries }: { line: LineRow; entries: EntryOpt[] }) {
  const t = useTranslations("bank");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const days = (d: string) => Math.abs(+new Date(d) - +new Date(line.txnDate));
  const choices = entries
    .filter((e) => e.accountId === line.accountId && Math.sign(e.amount) === Math.sign(line.amount))
    .sort((a, b) => Math.abs(Math.abs(a.amount) - line.remaining) - Math.abs(Math.abs(b.amount) - line.remaining) || days(a.date) - days(b.date));
  const total = choices.filter((e) => picked.includes(e.id)).reduce((s, e) => s + Math.abs(e.amount), 0);

  async function submit() {
    setBusy(true); setErr("");
    try {
      const res = await matchLine(line.id, picked);
      if (!res.success) { setErr(res.message ?? t("match.couldNotMatch")); return; }
      notify.success(line.remaining - total > tol(line.currency) ? t("match.toast.partMatched") : t("match.toast.matched"), t("match.toast.linked", { count: picked.length }));
      setOpen(false); setPicked([]);
      router.refresh();
    } catch {
      notifyFailure();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("match.trigger")} title={t("match.trigger")} />}>
        <Link2 aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("match.title", { amount: signed(line.amount, line.currency), date: line.txnDate })}</DialogTitle></DialogHeader>
        <div className="grid gap-4 pt-1">
          <p className="text-[13.5px] text-muted-foreground">
            {t("match.help", { account: line.accountName })}
          </p>
          <ul className="max-h-72 divide-y divide-border overflow-y-auto border-y border-border">
            {choices.map((e) => (
              <li key={e.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 px-1 py-2.5 transition-colors duration-150 hover:bg-secondary/45">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={picked.includes(e.id)}
                      onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                    <span className="truncate text-text-secondary"><span className="wf-num">{e.date}</span> · {e.label}</span>
                  </span>
                  <span className="wf-figure shrink-0">{fmtMoney(Math.abs(e.amount), line.currency)}</span>
                </label>
              </li>
            ))}
            {choices.length === 0 && <li className="py-3 text-muted-foreground">{t(line.amount > 0 ? "match.noneIn" : "match.noneOut", { account: line.accountName })}</li>}
          </ul>
          <p className="text-[14.5px] text-text-secondary">
            {t.rich(total > line.remaining + tol(line.currency) ? "match.selectedOver" : "match.selected", {
              total: fmtMoney(total, line.currency), remaining: fmtMoney(line.remaining, line.currency),
              over: (c) => <span className="text-destructive">{c}</span>,
            })}
          </p>
          {err && <FormError>{err}</FormError>}
          <Button type="button" className="w-full" disabled={busy || picked.length === 0} onClick={submit}>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("match.submit", { count: picked.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BankClient({ isAdmin, view, accounts, summaries, lines, entries, statements }: {
  isAdmin: boolean; view: "open" | "all" | "imports";
  accounts: AccountOpt[]; summaries: AccountSummary[]; lines: LineRow[]; entries: EntryOpt[]; statements: StatementRow[];
}) {
  const t = useTranslations("bank");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const openLines = lines.filter((l) => l.status !== "MATCHED");
  const shown = view === "all" ? lines : openLines;
  const notOnStatement = summaries.filter((s) => s.notOnStatement.length > 0);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string) {
    setBusyId(id);
    try { await act(fn, () => router.refresh(), done); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
          const diff = s.appBalance !== null && s.bankClosing !== null ? s.appBalance - s.bankClosing : null;
          const agrees = diff !== null && Math.abs(diff) <= tol(s.currency);
          return (
            <Card key={s.id}>
              <div className="border-b border-border px-5 py-4">
                <p className="wf-label">{s.asOf ? t("summary.statementTo", { currency: s.currency, date: s.asOf }) : s.currency}</p>
                <h2 className="mt-2 truncate text-[17px] leading-snug font-bold text-foreground">{s.name}</h2>
              </div>
              <div className="grid flex-1 content-start gap-2 p-5 text-[15px]">
                {s.bankClosing === null ? (
                  <p className="text-muted-foreground">{t("summary.noStatement")}</p>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-secondary">{t("summary.bankStatement")}</span>
                      <span className="wf-figure">{fmtMoney(s.bankClosing, s.currency)}</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-text-secondary">{t("summary.inApp")}</span>
                      <span className="wf-figure">{fmtMoney(s.appBalance!, s.currency)}</span>
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-3 font-semibold text-foreground">
                      <span>{t("summary.difference")}</span>
                      <span className={cn("wf-figure", agrees ? "text-pos" : "text-neg")}>{agrees ? t("summary.agrees") : signed(diff!, s.currency)}</span>
                    </div>
                    <p className="pt-1 text-[14px] text-muted-foreground">
                      {s.notOnStatement.length > 0
                        ? t("summary.toReconcileNotOnStatement", { open: s.open, lines: s.lines, count: s.notOnStatement.length })
                        : t("summary.toReconcile", { open: s.open, lines: s.lines })}
                    </p>
                    {s.drafts > 0 && <p className="text-[14px] text-warn">{t("summary.drafts", { count: s.drafts })}</p>}
                    {s.rejected > 0 && <p className="text-[14px] text-neg">{t("summary.rejected", { count: s.rejected })}</p>}
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="wf-seg" role="group" aria-label={t("tabs.label")}>
          {([["open", t("tabs.open", { count: openLines.length })], ["all", t("tabs.all", { count: lines.length })], ["imports", t("tabs.imports", { count: statements.length })]] as const).map(([v, text]) => (
            <Link key={v} href={v === "open" ? "/bank" : `/bank?view=${v}`} aria-current={view === v ? "page" : undefined}>{text}</Link>
          ))}
        </div>
        <ImportDialog accounts={accounts} />
      </div>

      {view === "imports" ? (
        <Card>
          <CardHeader>
            <h2 className="wf-panel__title">
              {t("imports.title")}
              <span className="wf-panel__count">{statements.length}</span>
            </h2>
            <CardDescription>{t("imports.description")}</CardDescription>
          </CardHeader>
          <ul className="wf-rows">
            {statements.map((s) => (
              <li key={s.id} className="flex-wrap">
                <div className="min-w-0">
                  <p className="text-foreground">{s.accountName} · <span className="wf-num">{s.periodFrom} → {s.periodTo}</span></p>
                  <p className="mt-0.5 text-[13.5px] text-muted-foreground">{s.importedBy
                    ? t("imports.metaBy", { file: s.fileName, lines: s.lineCount, added: s.added, date: s.importedAt, name: s.importedBy })
                    : t("imports.meta", { file: s.fileName, lines: s.lineCount, added: s.added, date: s.importedAt })}</p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <p className="wf-num flex items-center gap-1.5 text-[13.5px] text-text-secondary">
                    {fmtMoney(s.opening, s.currency)} + {fmtMoney(s.inflows, s.currency)} − {fmtMoney(s.outflows, s.currency)} = <span className="font-semibold text-foreground">{fmtMoney(s.closing, s.currency)}</span>
                    <CircleCheck className="size-3.5 text-pos" aria-hidden="true" />
                  </p>
                  {isAdmin && (
                    <Button variant="ghost" size="icon-sm" className="hover:text-destructive" disabled={busyId === s.id} aria-label={t("imports.undo")} title={t("imports.undo")}
                      onClick={() => { if (confirm(t("imports.confirmUndo", { count: s.added }))) run(s.id, () => deleteStatement(s.id), t("imports.removed")); }}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </li>
            ))}
            {statements.length === 0 && <li className="text-muted-foreground">{t("imports.empty")}</li>}
          </ul>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("lines.date")}</TableHead>
                <TableHead>{t("lines.account")}</TableHead>
                <TableHead>{t("lines.bankDetails")}</TableHead>
                <TableHead className="text-right">{t("lines.amount")}</TableHead>
                <TableHead>{t("lines.inLedger")}</TableHead>
                <TableHead className="w-[90px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((l) => (
                <TableRow key={l.id} className="[&>td]:align-top [&>td]:py-3">
                  <TableCell>
                    <span className="wf-num block text-foreground">{l.txnDate}</span>
                    {l.postingDate && l.postingDate !== l.txnDate && <span className="block text-[13.5px] text-muted-foreground">{t("lines.posted", { date: l.postingDate })}</span>}
                  </TableCell>
                  <TableCell className="text-text-secondary">{l.accountName}</TableCell>
                  <TableCell className="max-w-[280px]">
                    <span className="block truncate text-foreground" title={[l.counterparty, l.description].filter(Boolean).join("\n")}>{l.counterparty ?? l.description ?? "—"}</span>
                    <span className="block truncate font-mono text-[13.5px] text-muted-foreground" title={l.locator}>
                      {l.reference ?? t("lines.noReference")}{l.counterparty && l.description ? ` · ${l.description}` : ""}
                    </span>
                  </TableCell>
                  <TableCell className={cn("text-right font-semibold", l.amount > 0 ? "text-pos" : "text-foreground")}>{signed(l.amount, l.currency)}</TableCell>
                  <TableCell className="min-w-[220px]">
                    <div className="flex flex-col items-start gap-1.5">
                      <Chip tone={STATUS_TONE[l.status]} mono dot>
                        {l.status === "PARTIAL" ? t("status.partialLeft", { amount: fmtMoney(l.remaining, l.currency) }) : t(`status.${l.status}`)}
                      </Chip>
                      {l.entries.map((e) => (
                        <span key={e.id} className="flex items-center gap-1 text-[13.5px]">
                          <Link href={e.href} className="max-w-[220px] truncate text-primary hover:underline" title={`${e.date} · ${e.label}`}>{e.label}</Link>
                          <Button variant="ghost" size="icon-xs" className="hover:text-destructive" aria-label={t("lines.unmatch")} title={t("lines.unmatch")} disabled={busyId === e.id}
                            onClick={() => run(e.id, () => unmatchEntry(e.id), t("lines.unmatched"))}><X /></Button>
                        </span>
                      ))}
                      {l.suggestion && (
                        <span className="flex items-center gap-2 text-[13.5px]">
                          <span className="max-w-[260px] truncate text-muted-foreground" title={`${l.suggestion.date} · ${l.suggestion.label}`}>{t("lines.suggested", { label: l.suggestion.label, date: l.suggestion.date })}</span>
                          <Button size="xs" variant="outline" className="text-pos" disabled={busyId === l.id}
                            onClick={() => run(l.id, () => matchLine(l.id, [l.suggestion!.id]), t("match.toast.matched"))}>{t("lines.match")}</Button>
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {l.remaining > 0 && (
                      <div className="flex justify-end gap-1">
                        <MatchDialog line={l} entries={entries} />
                        <Button variant="ghost" size="icon-sm" render={<Link href={`/entry?bankLine=${l.id}`} />} nativeButton={false}
                          aria-label={t("lines.newEntry")} title={t("lines.newEntry")}>
                          <Plus aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {shown.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  {/* Left-aligned on phones, where the table scrolls sideways and a centred line would run off. */}
                  <TableCell colSpan={6} className="py-10 text-left text-muted-foreground sm:text-center">
                    {lines.length === 0 ? t("lines.empty") : t("lines.allMatched")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {notOnStatement.length > 0 && view !== "imports" && (
        <Card className="border-warn/50">
          <Notice tone="warning" title={t("notOnStatement.title")} className="rounded-none border-0 px-5 py-4">
            <p>{t("notOnStatement.description")}</p>
          </Notice>
          <ul className="wf-rows border-t border-border">
            {notOnStatement.flatMap((s) => s.notOnStatement.map((e) => (
              <li key={e.id}>
                <Link href={e.href} className="min-w-0 truncate text-text-secondary hover:text-primary">
                  <span className="wf-num text-foreground">{e.date}</span> · {s.name} · {e.label}
                </Link>
                <span className={cn("wf-figure shrink-0", e.amount > 0 && "text-pos")}>{signed(e.amount, s.currency)}</span>
              </li>
            )))}
          </ul>
        </Card>
      )}
    </div>
  );
}
