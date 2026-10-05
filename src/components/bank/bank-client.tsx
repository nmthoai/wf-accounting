"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, Loader2, X, Plus, Link2, Trash2, AlertTriangle } from "lucide-react";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { previewStatement, importStatement, matchLine, unmatchEntry, deleteStatement } from "@/app/actions/bank";
import { fmtMoney, EPS } from "@/lib/money";
import { notify, notifyResult } from "@/components/ui/toast";

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
  lines: number; open: number; drafts: number; notOnStatement: Linked[];
};
export type StatementRow = {
  id: string; accountName: string; currency: string; fileName: string; periodFrom: string; periodTo: string;
  opening: number; inflows: number; outflows: number; closing: number;
  lineCount: number; added: number; importedBy: string | null; importedAt: string;
};
type Preview = Extract<Awaited<ReturnType<typeof previewStatement>>, { success: true }>["preview"];

const tol = (currency: string) => (currency === "VND" ? 0.5 : EPS);
const signed = (n: number, c: string) => `${n < 0 ? "−" : "+"}${fmtMoney(Math.abs(n), c)}`;
const STATUS: Record<LineRow["status"], string> = {
  MATCHED: "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  UNMATCHED: "bg-red-100 text-red-700",
};

async function act(fn: () => Promise<{ success: boolean; message?: string }>, refresh: () => void, done: string, somethingWrong: string) {
  let res;
  try { res = await fn(); } catch { notify.error(somethingWrong); return; }
  notifyResult(res, done);
  refresh();
}

// Upload a statement, check it adds up, then append its new lines.
function ImportDialog({ accounts }: { accounts: AccountOpt[] }) {
  const t = useTranslations("bank");
  const tc = useTranslations("common");
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
      notify.error(tc("errors.somethingWrong"));
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
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(false); }
  }

  const cur = account?.currency ?? "VND";
  const o = parseFloat(opening), c = parseFloat(closing);
  const expected = preview ? o + preview.inflows - preview.outflows : NaN;
  const addsUp = preview !== null && Number.isFinite(expected) && Number.isFinite(c) && Math.abs(expected - c) <= tol(cur);
  const fresh = preview ? preview.count - preview.duplicates : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setFile(null); } }}>
      <DialogTrigger render={<Button className="gap-2" />}><Upload className="h-4 w-4" />{t("import.trigger")}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>{t("import.title")}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("import.account")}</Label>
              <AccountSelect accounts={accounts.filter((a) => a.type === "BANK")} value={accountId} onChange={(id) => { setAccountId(id); reset(); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statement-file">{t("import.file")}</Label>
              <Input id="statement-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
            </div>
          </div>
          {!preview && !done && (
            <Button type="button" variant="outline" className="w-full" disabled={!file || !accountId || busy} onClick={read}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("import.read")}
            </Button>
          )}

          {preview && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30 text-sm">
              <p>
                {t.rich(preview.duplicates > 0 ? "import.summaryWithDuplicates" : "import.summary", {
                  count: preview.count, from: preview.periodFrom, to: preview.periodTo, sheet: preview.sheet, duplicates: preview.duplicates,
                  b: (c) => <span className="font-medium">{c}</span>,
                  muted: (c) => <span className="text-muted-foreground">{c}</span>,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("import.columnsRead", { columns: Object.entries(preview.columns).map(([f, h]) => `${t(`fields.${f}`)} ← ${h}`).join(" · ") })}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="st-opening">{t("import.opening", { currency: cur })}</Label>
                  <Input id="st-opening" type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder={t("import.balancePlaceholder")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-closing">{t("import.closing", { currency: cur })}</Label>
                  <Input id="st-closing" type="number" step="any" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder={t("import.balancePlaceholder")} />
                </div>
              </div>
              <div className={`rounded-md p-2 ${addsUp ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                {t(addsUp ? "import.check.matches" : Number.isFinite(expected) && Number.isFinite(c) ? "import.check.off" : "import.check.incomplete", {
                  opening: Number.isFinite(o) ? fmtMoney(o, cur) : "?", inflows: fmtMoney(preview.inflows, cur), outflows: fmtMoney(preview.outflows, cur),
                  expected: Number.isFinite(expected) ? fmtMoney(expected, cur) : "?",
                  closing: fmtMoney(c, cur), diff: fmtMoney(expected - c, cur),
                })}
              </div>
              {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</p>)}
              <div className="space-y-1">
                <p className="text-xs font-medium">{t("import.firstLines")}</p>
                {preview.sample.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3 text-xs">
                    <span className="truncate">{l.date} · {l.reference ?? "—"} · {l.details ?? ""}</span>
                    <span className={`shrink-0 font-medium ${l.amount > 0 ? "text-green-700" : ""}`}>{signed(l.amount, cur)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {err && <p className="text-sm text-destructive">{err}</p>}
          {done && <p className="text-sm text-green-700">{done}</p>}
          {preview && (
            <Button type="button" className="w-full" disabled={busy || !addsUp || fresh === 0} onClick={save}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : fresh === 0 ? t("import.nothingNew") : t("import.submit", { count: fresh })}
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
  const tc = useTranslations("common");
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
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={t("match.trigger")} />}>
        <Link2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("match.title", { amount: signed(line.amount, line.currency), date: line.txnDate })}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            {t("match.help", { account: line.accountName })}
          </p>
          <div className="max-h-72 overflow-y-auto space-y-1">
            {choices.map((e) => (
              <label key={e.id} className="flex items-center justify-between gap-3 bg-muted/50 p-2 rounded-md text-sm cursor-pointer">
                <span className="flex items-center gap-2 min-w-0">
                  <input type="checkbox" checked={picked.includes(e.id)}
                    onChange={(ev) => setPicked((p) => (ev.target.checked ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                  <span className="truncate">{e.date} · {e.label}</span>
                </span>
                <span className="shrink-0 font-medium">{fmtMoney(Math.abs(e.amount), line.currency)}</span>
              </label>
            ))}
            {choices.length === 0 && <p className="text-sm text-muted-foreground">{t(line.amount > 0 ? "match.noneIn" : "match.noneOut", { account: line.accountName })}</p>}
          </div>
          <p className="text-sm">
            {t.rich(total > line.remaining + tol(line.currency) ? "match.selectedOver" : "match.selected", {
              total: fmtMoney(total, line.currency), remaining: fmtMoney(line.remaining, line.currency),
              over: (c) => <span className="text-destructive">{c}</span>,
            })}
          </p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="button" className="w-full" disabled={busy || picked.length === 0} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("match.submit", { count: picked.length })}
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
  const tc = useTranslations("common");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const openLines = lines.filter((l) => l.status !== "MATCHED");
  const shown = view === "all" ? lines : openLines;
  const notOnStatement = summaries.filter((s) => s.notOnStatement.length > 0);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string) {
    setBusyId(id);
    try { await act(fn, () => router.refresh(), done, tc("errors.somethingWrong")); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => {
          const diff = s.appBalance !== null && s.bankClosing !== null ? s.appBalance - s.bankClosing : null;
          const agrees = diff !== null && Math.abs(diff) <= tol(s.currency);
          return (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.name}</CardTitle>
                <p className="text-xs text-muted-foreground">{s.asOf ? t("summary.statementTo", { currency: s.currency, date: s.asOf }) : s.currency}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {s.bankClosing === null ? (
                  <p className="text-muted-foreground">{t("summary.noStatement")}</p>
                ) : (
                  <>
                    <div className="flex justify-between"><span>{t("summary.bankStatement")}</span><span className="font-medium">{fmtMoney(s.bankClosing, s.currency)}</span></div>
                    <div className="flex justify-between"><span>{t("summary.inApp")}</span><span className="font-medium">{fmtMoney(s.appBalance!, s.currency)}</span></div>
                    <div className="border-t pt-1 flex justify-between font-semibold">
                      <span>{t("summary.difference")}</span>
                      <span className={agrees ? "text-green-700" : "text-red-600"}>{agrees ? t("summary.agrees") : signed(diff!, s.currency)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      {s.notOnStatement.length > 0
                        ? t("summary.toReconcileNotOnStatement", { open: s.open, lines: s.lines, count: s.notOnStatement.length })
                        : t("summary.toReconcile", { open: s.open, lines: s.lines })}
                    </p>
                    {s.drafts > 0 && <p className="text-xs text-amber-700">{t("summary.drafts", { count: s.drafts })}</p>}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          {([["open", t("tabs.open", { count: openLines.length })], ["all", t("tabs.all", { count: lines.length })], ["imports", t("tabs.imports", { count: statements.length })]] as const).map(([v, text]) => (
            <Link key={v} href={v === "open" ? "/bank" : `/bank?view=${v}`}
              className={`px-3 py-1 rounded-md font-medium transition-all ${view === v ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</Link>
          ))}
        </div>
        <ImportDialog accounts={accounts} />
      </div>

      {view === "imports" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("imports.title")}</CardTitle>
            <CardDescription>{t("imports.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {statements.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md text-sm flex-wrap">
                <div className="flex flex-col min-w-[220px]">
                  <span className="font-medium">{s.accountName} · {s.periodFrom} → {s.periodTo}</span>
                  <span className="text-xs text-muted-foreground">{s.importedBy
                    ? t("imports.metaBy", { file: s.fileName, lines: s.lineCount, added: s.added, date: s.importedAt, name: s.importedBy })
                    : t("imports.meta", { file: s.fileName, lines: s.lineCount, added: s.added, date: s.importedAt })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {fmtMoney(s.opening, s.currency)} + {fmtMoney(s.inflows, s.currency)} − {fmtMoney(s.outflows, s.currency)} = <span className="font-semibold">{fmtMoney(s.closing, s.currency)}</span> <span className="text-green-700">✓</span>
                  </span>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === s.id} title={t("imports.undo")}
                      onClick={() => { if (confirm(t("imports.confirmUndo", { count: s.added }))) run(s.id, () => deleteStatement(s.id), t("imports.removed")); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {statements.length === 0 && <p className="text-sm text-muted-foreground">{t("imports.empty")}</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
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
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{l.txnDate}</div>
                      {l.postingDate && l.postingDate !== l.txnDate && <div className="text-xs text-muted-foreground">{t("lines.posted", { date: l.postingDate })}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{l.accountName}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate" title={[l.counterparty, l.description].filter(Boolean).join("\n")}>{l.counterparty ?? l.description ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate" title={l.locator}>
                        {l.reference ?? t("lines.noReference")}{l.counterparty && l.description ? ` · ${l.description}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${l.amount > 0 ? "text-green-700" : ""}`}>{signed(l.amount, l.currency)}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS[l.status]}`}>
                          {l.status === "PARTIAL" ? t("status.partialLeft", { amount: fmtMoney(l.remaining, l.currency) }) : t(`status.${l.status}`)}
                        </span>
                        {l.entries.map((e) => (
                          <span key={e.id} className="flex items-center gap-1 text-xs">
                            <Link href={e.href} className="text-primary hover:underline truncate max-w-[220px]" title={`${e.date} · ${e.label}`}>{e.label}</Link>
                            <button type="button" className="text-muted-foreground hover:text-destructive" title={t("lines.unmatch")} disabled={busyId === e.id}
                              onClick={() => run(e.id, () => unmatchEntry(e.id), t("lines.unmatched"))}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                        {l.suggestion && (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground truncate max-w-[180px]" title={`${l.suggestion.date} · ${l.suggestion.label}`}>{t("lines.suggested", { label: l.suggestion.label, date: l.suggestion.date })}</span>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-green-700" disabled={busyId === l.id}
                              onClick={() => run(l.id, () => matchLine(l.id, [l.suggestion!.id]), t("match.toast.matched"))}>{t("lines.match")}</Button>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {l.remaining > 0 && (
                        <div className="flex justify-end gap-1">
                          <MatchDialog line={l} entries={entries} />
                          <Link href={`/entry?bankLine=${l.id}`} title={t("lines.newEntry")}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary"><Plus className="h-4 w-4" /></Button>
                          </Link>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      {lines.length === 0 ? t("lines.empty") : t("lines.allMatched")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {notOnStatement.length > 0 && view !== "imports" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />{t("notOnStatement.title")}
            </CardTitle>
            <CardDescription className="text-amber-800/80">{t("notOnStatement.description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {notOnStatement.flatMap((s) => s.notOnStatement.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 bg-white/70 p-2 rounded-md text-sm">
                <Link href={e.href} className="hover:underline truncate">{e.date} · {s.name} · {e.label}</Link>
                <span className="font-semibold shrink-0">{signed(e.amount, s.currency)}</span>
              </div>
            )))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
