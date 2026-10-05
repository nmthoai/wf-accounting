"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, PiggyBank, User, Landmark, ArrowLeftRight, Plus, Pencil, Trash2, AlertTriangle, Lock, Undo2 } from "lucide-react";
import { deleteTransaction, reverseEntry } from "@/app/actions/ledger";
import { notify, notifyResult } from "@/components/ui/toast";
import { ACCOUNT_TYPE_LABEL, TYPE_LABEL, fmtMoney, fmtVnd, totalsList, type Totals } from "@/lib/money";
import {
  AccountDialog, TransferDialog, MovementDialog, LoanDialog,
  type AccountRow, type LoanRow, type TransferRow, type SingleRow,
} from "./accounts-dialogs";

export type MovementRow = TransferRow | SingleRow;

const kindColor: Record<string, string> = {
  CAPITAL_IN: "bg-violet-100 text-violet-700",
  LOAN_IN: "bg-sky-100 text-sky-700",
  LOAN_REPAY: "bg-sky-100 text-sky-700",
  OTHER_IN: "bg-amber-100 text-amber-700",
  OTHER_OUT: "bg-amber-100 text-amber-700",
};
const OUT_KINDS = new Set(["LOAN_REPAY", "OTHER_OUT"]);

// One line per currency — currencies are never added together.
function Stat({ label, totals, sub, icon, primary }: { label: string; totals: Totals; sub: string; icon: React.ReactNode; primary?: boolean }) {
  const lines = totalsList(totals);
  return (
    <Card className={primary ? "bg-primary text-primary-foreground" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>{icon}
      </CardHeader>
      <CardContent>
        {lines.length === 0 && <div className="text-2xl font-bold">{fmtVnd(0)}</div>}
        {lines.map(([c, v], i) => <div key={c} className={i === 0 ? "text-2xl font-bold" : "text-lg font-semibold"}>{fmtMoney(v, c)}</div>)}
        <p className={`text-xs mt-1 ${primary ? "opacity-75" : "text-muted-foreground"}`}>{sub}</p>
      </CardContent>
    </Card>
  );
}

export function AccountsClient({ isAdmin, position, accounts, loans, movements }: {
  isAdmin: boolean;
  position: { liquid: Totals; deposits: Totals; owner: Totals; capital: Totals };
  accounts: AccountRow[]; loans: LoanRow[]; movements: MovementRow[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const unclassified = movements.filter((m): m is SingleRow => !m.isTransfer && m.kind.startsWith("OTHER_") && !m.reversal && !m.reversed && m.status !== "POSTED");

  async function reverse(id: string) {
    const reason = prompt("Reverse this posted movement? Give the reason — then record the correct one.");
    if (!reason?.trim()) return;
    setBusyId(id);
    try {
      const res = await reverseEntry(id, reason);
      notifyResult(res, "Movement reversed", "Could not reverse.");
      router.refresh();
    } catch {
      notify.error("Something went wrong — please try again.");
    } finally { setBusyId(null); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this movement? A transfer deletes both sides.")) return;
    setBusyId(id);
    try { await deleteTransaction(id); notify.success("Movement deleted"); router.refresh(); }
    catch { notify.error("Something went wrong — please try again."); }
    finally { setBusyId(null); }
  }

  const editButton = <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Edit"><Pencil className="h-4 w-4" /></Button>;

  const ownerLines = totalsList(position.owner);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Stat primary label="Cash & bank" totals={position.liquid} icon={<Wallet className="h-4 w-4 opacity-75" />}
          sub="Per currency — never converted or added together" />
        <Stat label="Term deposits" totals={position.deposits} icon={<PiggyBank className="h-4 w-4 text-muted-foreground" />} sub="Parked, not spendable" />
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Owner position</CardTitle><User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-1">
            {ownerLines.length === 0 && <div className="text-2xl font-bold">{fmtVnd(0)}</div>}
            {ownerLines.map(([c, v]) => (
              <div key={c}>
                <div className={`text-lg font-bold ${v < 0 ? "text-red-600" : "text-amber-700"}`}>{fmtMoney(Math.abs(v), c)}</div>
                <p className="text-xs text-muted-foreground">{v < 0 ? "Company owes the owner" : "Owner holds this company money"}</p>
              </div>
            ))}
            {ownerLines.length === 0 && <p className="text-xs text-muted-foreground">Nothing owed either way</p>}
          </CardContent>
        </Card>
        <Stat label="Capital contributed" totals={position.capital} icon={<Landmark className="h-4 w-4 text-muted-foreground" />} sub="All capital contributions" />
      </div>

      <div className="flex flex-wrap gap-2">
        <TransferDialog accounts={accounts} trigger={<Button className="gap-2"><ArrowLeftRight className="h-4 w-4" />Transfer</Button>} />
        <MovementDialog accounts={accounts} loans={loans} trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Capital or loan</Button>} />
        <LoanDialog trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New loan</Button>} />
        {isAdmin && <AccountDialog trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New account</Button>} />}
      </div>

      {unclassified.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-4 w-4" />{unclassified.length} movement{unclassified.length > 1 ? "s" : ""} need classifying
            </CardTitle>
            <CardDescription className="text-amber-800/80">Money moved but we don&apos;t know why yet — mark it as capital, a loan, or a repayment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {unclassified.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 bg-white/70 p-2 rounded-md text-sm">
                <span>{m.date} · {m.accountName}{m.description ? ` · ${m.description}` : ""}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{m.kind === "OTHER_OUT" ? "−" : "+"}{fmtMoney(m.amount, m.currency)}</span>
                  <MovementDialog accounts={accounts} loans={loans} movement={m} trigger={<Button size="sm" variant="outline">Classify</Button>} />
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => (
          <Card key={a.id} className={a.isActive ? "" : "opacity-60"}>
            <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">{a.name}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {ACCOUNT_TYPE_LABEL[a.type] ?? a.type} · {a.currency}{a.isActive ? "" : " · inactive"}
                </p>
              </div>
              {isAdmin && <AccountDialog account={a} trigger={editButton} />}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${a.balance < 0 ? "text-red-600" : ""}`}>{fmtMoney(a.balance, a.currency)}</div>
              {a.type === "OWNER" && a.balance < 0 && <p className="text-xs text-red-600 mt-1">Company owes the owner {fmtMoney(-a.balance, a.currency)}</p>}
              {a.type === "OWNER" && a.balance > 0 && <p className="text-xs text-amber-700 mt-1">Owner holds {fmtMoney(a.balance, a.currency)} of company money</p>}
              {a.notes && <p className="text-xs text-muted-foreground mt-1">{a.notes}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                Opening {fmtMoney(a.openingBalance, a.currency)}{a.openingDate ? ` as of ${a.openingDate}` : " (no date set)"}
              </p>
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 && <p className="text-sm text-muted-foreground">No accounts yet.{isAdmin ? " Add your first one above." : ""}</p>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Loans</CardTitle>
          <CardDescription>Money lent to the company. Outstanding = received − repaid.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loans.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md text-sm flex-wrap">
              <div className="flex flex-col">
                <span className="font-medium">{l.lender}</span>
                {l.notes && <span className="text-xs text-muted-foreground">{l.notes}</span>}
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">Received {fmtMoney(l.received, l.currency)}</span>
                <span className="text-muted-foreground">Repaid {fmtMoney(l.repaid, l.currency)}</span>
                <span className={`font-semibold ${l.outstanding > 0 ? "text-red-600" : "text-green-700"}`}>
                  Outstanding {fmtMoney(l.outstanding, l.currency)}
                </span>
              </div>
            </div>
          ))}
          {loans.length === 0 && <p className="text-sm text-muted-foreground">No loans recorded.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transfers, capital &amp; loans</CardTitle>
          <CardDescription>Money moving between accounts or financing the company. None of it touches profit &amp; loss.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md flex-wrap">
              <div className="flex flex-col min-w-[220px]">
                <span className="text-sm font-medium flex items-center gap-2">
                  {m.isTransfer ? (
                    <><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">Transfer</span>{m.fromName} → {m.toName}</>
                  ) : (
                    <><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${kindColor[m.kind] ?? "bg-slate-200 text-slate-700"}`}>{TYPE_LABEL[m.kind] ?? m.kind}</span>{m.accountName}</>
                  )}
                  {m.status === "DRAFT" && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">draft</span>}
                  {m.reversal && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">reversal</span>}
                  {m.reversed && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-200 text-slate-700">reversed</span>}
                  {m.status === "POSTED" && <span title="Posted — locked"><Lock className="h-3.5 w-3.5 text-muted-foreground" /></span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.date}
                  {!m.isTransfer && m.lender ? ` · ${m.lender}` : ""}
                  {m.description ? ` · ${m.description}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {m.isTransfer ? (
                  <div className="text-right text-sm">
                    <div className="font-semibold">{fmtMoney(m.amountOut, m.currencyOut)}{m.currencyOut !== m.currencyIn && <> → {fmtMoney(m.amountIn, m.currencyIn)}</>}</div>
                    {m.rate && <div className="text-xs text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(Math.round(m.rate * 100) / 100)} VND/USD</div>}
                  </div>
                ) : (
                  <span className={`text-sm font-semibold ${OUT_KINDS.has(m.kind) === m.amount >= 0 ? "text-red-600" : "text-green-700"}`}>
                    {OUT_KINDS.has(m.kind) === m.amount >= 0 ? "−" : "+"}{fmtMoney(Math.abs(m.amount), m.currency)}
                  </span>
                )}
                {/* Posted movements are locked: an admin reverses them, then records the correct one. */}
                {m.status !== "POSTED" && (m.isTransfer
                  ? <TransferDialog accounts={accounts} transfer={m} trigger={editButton} />
                  : <MovementDialog accounts={accounts} loans={loans} movement={m} trigger={editButton} />)}
                {isAdmin && m.status !== "POSTED" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title="Delete"
                    disabled={busyId === m.id} onClick={() => remove(m.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                {isAdmin && m.status === "POSTED" && !m.reversal && !m.reversed && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Reverse (correct a posted movement)"
                    disabled={busyId === m.id} onClick={() => reverse(m.id)}>
                    <Undo2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {movements.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet. Record a transfer, capital contribution or loan above.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
