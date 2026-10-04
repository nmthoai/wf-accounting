"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
const FIELD_LABEL: Record<string, string> = {
  txnDate: "Date", postingDate: "Posting date", reference: "Reference", debit: "Money out", credit: "Money in",
  amount: "Amount", balance: "Balance", counterparty: "Counterparty", description: "Details",
};
const STATUS: Record<LineRow["status"], [string, string]> = {
  MATCHED: ["Matched", "bg-green-100 text-green-700"],
  PARTIAL: ["Part matched", "bg-amber-100 text-amber-700"],
  UNMATCHED: ["Not in ledger", "bg-red-100 text-red-700"],
};

async function act(fn: () => Promise<{ success: boolean; message?: string }>, refresh: () => void) {
  const res = await fn();
  if (!res.success && res.message) alert(res.message);
  refresh();
}

// Upload a statement, check it adds up, then append its new lines.
function ImportDialog({ accounts }: { accounts: AccountOpt[] }) {
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
      if (!res.success) { setErr(res.message ?? "Could not read the file."); return; }
      setPreview(res.preview);
      setOpening(res.preview.opening === null ? "" : String(res.preview.opening));
      setClosing(res.preview.closing === null ? "" : String(res.preview.closing));
    } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true); setErr("");
    try {
      const fd = formData();
      fd.set("opening", opening); fd.set("closing", closing);
      const res = await importStatement(fd);
      if (!res.success) { setErr(res.message ?? "Could not import."); return; }
      setDone(`Imported ${res.added} new line${res.added === 1 ? "" : "s"}${res.skipped ? ` · ${res.skipped} already imported, skipped` : ""}.`);
      setPreview(null);
      router.refresh();
    } finally { setBusy(false); }
  }

  const cur = account?.currency ?? "VND";
  const o = parseFloat(opening), c = parseFloat(closing);
  const expected = preview ? o + preview.inflows - preview.outflows : NaN;
  const addsUp = preview !== null && Number.isFinite(expected) && Number.isFinite(c) && Math.abs(expected - c) <= tol(cur);
  const fresh = preview ? preview.count - preview.duplicates : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { reset(); setFile(null); } }}>
      <DialogTrigger render={<Button className="gap-2" />}><Upload className="h-4 w-4" />Import statement</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Import a bank statement</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Account</Label>
              <AccountSelect accounts={accounts.filter((a) => a.type === "BANK")} value={accountId} onChange={(id) => { setAccountId(id); reset(); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statement-file">Statement file (.xlsx or .csv)</Label>
              <Input id="statement-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); reset(); }} />
            </div>
          </div>
          {!preview && !done && (
            <Button type="button" variant="outline" className="w-full" disabled={!file || !accountId || busy} onClick={read}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Read statement"}
            </Button>
          )}

          {preview && (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30 text-sm">
              <p>
                <span className="font-medium">{preview.count} lines</span> · {preview.periodFrom} → {preview.periodTo} · sheet “{preview.sheet}”
                {preview.duplicates > 0 && <span className="text-muted-foreground"> · {preview.duplicates} already imported</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                Columns read: {Object.entries(preview.columns).map(([f, h]) => `${FIELD_LABEL[f] ?? f} ← ${h}`).join(" · ")}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="st-opening">Opening balance ({cur})</Label>
                  <Input id="st-opening" type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="As printed on the statement" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="st-closing">Closing balance ({cur})</Label>
                  <Input id="st-closing" type="number" step="any" value={closing} onChange={(e) => setClosing(e.target.value)} placeholder="As printed on the statement" />
                </div>
              </div>
              <div className={`rounded-md p-2 ${addsUp ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                Opening {Number.isFinite(o) ? fmtMoney(o, cur) : "?"} + in {fmtMoney(preview.inflows, cur)} − out {fmtMoney(preview.outflows, cur)}
                {" = "}{Number.isFinite(expected) ? fmtMoney(expected, cur) : "?"}
                {addsUp ? " — matches the closing balance ✓" : Number.isFinite(expected) && Number.isFinite(c) ? ` — closing is ${fmtMoney(c, cur)}, off by ${fmtMoney(expected - c, cur)}` : " — enter both balances"}
              </div>
              {preview.warnings.map((w) => <p key={w} className="text-xs text-amber-700 flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" />{w}</p>)}
              <div className="space-y-1">
                <p className="text-xs font-medium">First lines</p>
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
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : fresh === 0 ? "Nothing new to import" : `Import ${fresh} new line${fresh === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Pick the ledger entries that make up a bank line (one or several).
function MatchDialog({ line, entries }: { line: LineRow; entries: EntryOpt[] }) {
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
      if (!res.success) { setErr(res.message ?? "Could not match."); return; }
      setOpen(false); setPicked([]);
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Match to ledger entries" />}>
        <Link2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>Match bank line — {signed(line.amount, line.currency)} on {line.txnDate}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Pick the ledger entries on {line.accountName} that make up this line — several if it covers more than one.
            Transfers, capital and loans are recorded on the Accounts page first.
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
            {choices.length === 0 && <p className="text-sm text-muted-foreground">No unmatched {line.amount > 0 ? "money-in" : "money-out"} entries on {line.accountName}.</p>}
          </div>
          <p className="text-sm">
            Selected {fmtMoney(total, line.currency)} of {fmtMoney(line.remaining, line.currency)} still open
            {total > line.remaining + tol(line.currency) && <span className="text-destructive"> — more than the line</span>}
          </p>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="button" className="w-full" disabled={busy || picked.length === 0} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Match ${picked.length || ""} ${picked.length === 1 ? "entry" : "entries"}`}
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
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const openLines = lines.filter((l) => l.status !== "MATCHED");
  const shown = view === "all" ? lines : openLines;
  const notOnStatement = summaries.filter((s) => s.notOnStatement.length > 0);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try { await act(fn, () => router.refresh()); } finally { setBusyId(null); }
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
                <p className="text-xs text-muted-foreground">{s.currency}{s.asOf ? ` · statement to ${s.asOf}` : ""}</p>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {s.bankClosing === null ? (
                  <p className="text-muted-foreground">No statement imported yet.</p>
                ) : (
                  <>
                    <div className="flex justify-between"><span>Bank statement</span><span className="font-medium">{fmtMoney(s.bankClosing, s.currency)}</span></div>
                    <div className="flex justify-between"><span>In the app</span><span className="font-medium">{fmtMoney(s.appBalance!, s.currency)}</span></div>
                    <div className="border-t pt-1 flex justify-between font-semibold">
                      <span>Difference</span>
                      <span className={agrees ? "text-green-700" : "text-red-600"}>{agrees ? "Agrees ✓" : signed(diff!, s.currency)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      {s.open} of {s.lines} bank lines to reconcile
                      {s.notOnStatement.length > 0 && ` · ${s.notOnStatement.length} app ${s.notOnStatement.length === 1 ? "entry" : "entries"} not on the statement`}
                    </p>
                    {s.drafts > 0 && <p className="text-xs text-amber-700">{s.drafts} draft {s.drafts === 1 ? "entry" : "entries"} not counted in the app balance until reviewed</p>}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          {([["open", `To reconcile (${openLines.length})`], ["all", `All lines (${lines.length})`], ["imports", `Imports (${statements.length})`]] as const).map(([v, text]) => (
            <Link key={v} href={v === "open" ? "/bank" : `/bank?view=${v}`}
              className={`px-3 py-1 rounded-md font-medium transition-all ${view === v ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{text}</Link>
          ))}
        </div>
        <ImportDialog accounts={accounts} />
      </div>

      {view === "imports" ? (
        <Card>
          <CardHeader>
            <CardTitle>Imported statements</CardTitle>
            <CardDescription>Each file was accepted only because opening + money in − money out equals its closing balance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {statements.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md text-sm flex-wrap">
                <div className="flex flex-col min-w-[220px]">
                  <span className="font-medium">{s.accountName} · {s.periodFrom} → {s.periodTo}</span>
                  <span className="text-xs text-muted-foreground">{s.fileName} · {s.lineCount} lines, {s.added} new · imported {s.importedAt}{s.importedBy ? ` by ${s.importedBy}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {fmtMoney(s.opening, s.currency)} + {fmtMoney(s.inflows, s.currency)} − {fmtMoney(s.outflows, s.currency)} = <span className="font-semibold">{fmtMoney(s.closing, s.currency)}</span> <span className="text-green-700">✓</span>
                  </span>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === s.id} title="Undo this import"
                      onClick={() => { if (confirm(`Remove this import and its ${s.added} lines?`)) run(s.id, () => deleteStatement(s.id)); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {statements.length === 0 && <p className="text-sm text-muted-foreground">No statements imported yet.</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Bank details</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>In the ledger</TableHead>
                  <TableHead className="w-[90px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{l.txnDate}</div>
                      {l.postingDate && l.postingDate !== l.txnDate && <div className="text-xs text-muted-foreground">posted {l.postingDate}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{l.accountName}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate" title={[l.counterparty, l.description].filter(Boolean).join("\n")}>{l.counterparty ?? l.description ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate" title={l.locator}>
                        {l.reference ?? "no reference"}{l.counterparty && l.description ? ` · ${l.description}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className={`text-right font-semibold whitespace-nowrap ${l.amount > 0 ? "text-green-700" : ""}`}>{signed(l.amount, l.currency)}</TableCell>
                    <TableCell className="min-w-[220px]">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS[l.status][1]}`}>
                          {STATUS[l.status][0]}{l.status === "PARTIAL" ? ` · ${fmtMoney(l.remaining, l.currency)} left` : ""}
                        </span>
                        {l.entries.map((e) => (
                          <span key={e.id} className="flex items-center gap-1 text-xs">
                            <Link href={e.href} className="text-primary hover:underline truncate max-w-[220px]" title={`${e.date} · ${e.label}`}>{e.label}</Link>
                            <button type="button" className="text-muted-foreground hover:text-destructive" title="Unmatch" disabled={busyId === e.id}
                              onClick={() => run(e.id, () => unmatchEntry(e.id))}><X className="h-3 w-3" /></button>
                          </span>
                        ))}
                        {l.suggestion && (
                          <span className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground truncate max-w-[180px]" title={`${l.suggestion.date} · ${l.suggestion.label}`}>Suggested: {l.suggestion.label} · {l.suggestion.date}</span>
                            <Button size="sm" variant="outline" className="h-6 px-2 text-xs text-green-700" disabled={busyId === l.id}
                              onClick={() => run(l.id, () => matchLine(l.id, [l.suggestion!.id]))}>Match</Button>
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {l.remaining > 0 && (
                        <div className="flex justify-end gap-1">
                          <MatchDialog line={l} entries={entries} />
                          <Link href={`/entry?bankLine=${l.id}`} title="New income/expense entry from this line">
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
                      {lines.length === 0 ? "No statement lines yet — import a statement to start." : "Every bank line is matched to the ledger."}
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
              <AlertTriangle className="h-4 w-4" />In the app but not on the bank statement
            </CardTitle>
            <CardDescription className="text-amber-800/80">Entries on a bank account, inside the statement period, that no bank line explains — check the account and date, or match them above.</CardDescription>
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
