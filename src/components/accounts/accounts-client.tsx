"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet, PiggyBank, User, Landmark, ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Plus, Pencil, Trash2, Lock, Undo2,
} from "lucide-react";
import { deleteTransaction, reverseEntry } from "@/app/actions/ledger";
import { notify, notifyResult } from "@/components/ui/toast";
import { fmtMoney, fmtVnd, totalsList, type Totals } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Chip, ENTRY_TYPE_TONE, Notice, Stat, StatStrip } from "@/components/wf/ledger-ui";
import {
  AccountDialog, TransferDialog, MovementDialog, LoanDialog,
  type AccountRow, type LoanRow, type TransferRow, type SingleRow,
} from "./accounts-dialogs";

export type MovementRow = TransferRow | SingleRow;

const OUT_KINDS = new Set(["LOAN_REPAY", "OTHER_OUT"]);

// One line per currency — currencies are never added together.
function lines(totals: Totals) {
  const list = totalsList(totals);
  if (list.length === 0) return fmtVnd(0);
  return list.map(([c, v], i) => (i === 0 ? <span key={c}>{fmtMoney(v, c)}</span> : <small key={c}>{fmtMoney(v, c)}</small>));
}

export function AccountsClient({ isAdmin, position, accounts, loans, movements }: {
  isAdmin: boolean;
  position: { liquid: Totals; deposits: Totals; owner: Totals; capital: Totals };
  accounts: AccountRow[]; loans: LoanRow[]; movements: MovementRow[];
}) {
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const unclassified = movements.filter((m): m is SingleRow => !m.isTransfer && m.kind.startsWith("OTHER_") && !m.reversal && !m.reversed && m.status !== "POSTED");

  async function reverse(id: string) {
    const reason = prompt(t("movements.reversePrompt"));
    if (!reason?.trim()) return;
    setBusyId(id);
    try {
      const res = await reverseEntry(id, reason);
      notifyResult(res, t("toast.movementReversed"), t("toast.couldNotReverse"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setBusyId(null); }
  }

  async function remove(id: string) {
    if (!confirm(t("movements.deleteConfirm"))) return;
    setBusyId(id);
    try { await deleteTransaction(id); notify.success(t("toast.movementDeleted")); router.refresh(); }
    catch { notify.error(tc("errors.somethingWrong")); }
    finally { setBusyId(null); }
  }

  const editButton = (
    <Button variant="ghost" size="icon-sm" aria-label={tc("actions.edit")} title={tc("actions.edit")}><Pencil /></Button>
  );

  const ownerLines = totalsList(position.owner);
  const ownerSays = (v: number) => (v < 0 ? t("stats.companyOwesOwner") : t("stats.ownerHoldsMoney"));

  return (
    <div className="space-y-6">
      <StatStrip className="lg:grid-cols-4">
        <Stat label={t("stats.cashBank")} icon={Wallet} emphasis sub={t("stats.cashBankSub")}>
          {lines(position.liquid)}
        </Stat>
        <Stat label={t("stats.termDeposits")} icon={PiggyBank} sub={t("stats.termDepositsSub")}>
          {lines(position.deposits)}
        </Stat>
        <Stat
          label={t("stats.ownerPosition")}
          icon={User}
          tone={ownerLines[0] ? (ownerLines[0][1] < 0 ? "neg" : "warn") : "neutral"}
          sub={ownerLines.length === 0
            ? t("stats.nothingOwed")
            : ownerLines.map(([c, v]) => <p key={c}>{ownerLines.length > 1 ? `${c} · ` : ""}{ownerSays(v)}</p>)}
        >
          {ownerLines.length === 0 && fmtVnd(0)}
          {ownerLines.map(([c, v], i) => (i === 0
            ? <span key={c}>{fmtMoney(Math.abs(v), c)}</span>
            : <small key={c}>{fmtMoney(Math.abs(v), c)}</small>))}
        </Stat>
        <Stat label={t("stats.capital")} icon={Landmark} tone="violet" sub={t("stats.capitalSub")}>
          {lines(position.capital)}
        </Stat>
      </StatStrip>

      <div className="flex flex-wrap gap-2">
        <TransferDialog accounts={accounts} trigger={<Button><ArrowLeftRight />{t("actions.transfer")}</Button>} />
        <MovementDialog accounts={accounts} loans={loans} trigger={<Button variant="outline"><Plus />{t("actions.capitalOrLoan")}</Button>} />
        <LoanDialog trigger={<Button variant="outline"><Plus />{t("actions.newLoan")}</Button>} />
        {isAdmin && <AccountDialog trigger={<Button variant="outline"><Plus />{t("actions.newAccount")}</Button>} />}
      </div>

      {unclassified.length > 0 && (
        <Card className="border-warn/50">
          <Notice tone="warning" title={t("unclassified.title", { count: unclassified.length })} className="rounded-none border-0 px-5 py-4">
            <p>{t("unclassified.description")}</p>
          </Notice>
          <ul className="wf-rows border-t border-border">
            {unclassified.map((m) => (
              <li key={m.id}>
                <p className="min-w-0 truncate text-text-secondary">
                  <span className="wf-num text-foreground">{m.date}</span> · {m.accountName}{m.description ? ` · ${m.description}` : ""}
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={cn("wf-figure", m.kind !== "OTHER_OUT" && "text-pos")}>
                    {m.kind === "OTHER_OUT" ? "−" : "+"}{fmtMoney(Math.abs(m.amount), m.currency)}
                  </span>
                  <MovementDialog accounts={accounts} loans={loans} movement={m} trigger={<Button size="sm" variant="outline">{t("actions.classify")}</Button>} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map((a) => {
          const meta = { type: tc(`accountType.${a.type}`), currency: a.currency };
          return (
            <Card key={a.id} className={cn(!a.isActive && "opacity-60")}>
              <div className="flex flex-1 items-start justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="wf-label">{a.isActive ? t("account.meta", meta) : t("account.metaInactive", meta)}</p>
                  <h2 className="mt-2 truncate text-[15px] leading-snug font-bold text-foreground">{a.name}</h2>
                  <p className={cn("wf-num mt-3 text-[22px] leading-tight font-semibold tracking-[-0.02em] text-foreground", a.balance < 0 && "text-neg")}>
                    {fmtMoney(a.balance, a.currency)}
                  </p>
                  {a.type === "OWNER" && a.balance < 0 && <p className="mt-1 text-[12px] text-warn">{t("account.companyOwes", { amount: fmtMoney(-a.balance, a.currency) })}</p>}
                  {a.type === "OWNER" && a.balance > 0 && <p className="mt-1 text-[12px] text-warn">{t("account.ownerHolds", { amount: fmtMoney(a.balance, a.currency) })}</p>}
                  {a.notes && <p className="mt-1 text-[12px] text-muted-foreground">{a.notes}</p>}
                </div>
                {isAdmin && <AccountDialog account={a} trigger={editButton} />}
              </div>
              <p className="border-t border-border bg-muted/40 px-5 py-3 font-mono text-[12px] text-muted-foreground tabular-nums">
                {a.openingDate
                  ? t("account.opening", { amount: fmtMoney(a.openingBalance, a.currency), date: a.openingDate })
                  : t("account.openingNoDate", { amount: fmtMoney(a.openingBalance, a.currency) })}
              </p>
            </Card>
          );
        })}
        {accounts.length === 0 && <p className="text-muted-foreground">{isAdmin ? t("account.emptyAdmin") : t("account.empty")}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader>
            <h2 className="wf-panel__title">
              {t("movements.title")}
              <span className="wf-panel__count">{movements.length}</span>
            </h2>
            <CardDescription>{t("movements.description")}</CardDescription>
          </CardHeader>
          <ul className="wf-rows">
            {movements.map((m) => {
              const out = !m.isTransfer && OUT_KINDS.has(m.kind) === m.amount >= 0;
              const Icon = m.isTransfer ? ArrowLeftRight : out ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={m.id} className="flex-wrap items-start">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Icon className={cn("mt-0.5 size-4 shrink-0", !m.isTransfer && !out ? "text-pos" : "text-muted-foreground")} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-foreground">
                        {m.isTransfer ? (
                          <><Chip>{t("movements.transfer")}</Chip><span>{m.fromName} → {m.toName}</span></>
                        ) : (
                          <><Chip tone={ENTRY_TYPE_TONE[m.kind] ?? "neutral"}>{tc(`type.${m.kind}`)}</Chip><span>{m.accountName}</span></>
                        )}
                        {m.status === "DRAFT" && <Chip tone="warn" mono>{t("movements.draft")}</Chip>}
                        {m.status === "REJECTED" && <Chip tone="neg" mono title={m.rejectedReason ?? undefined}>{tc("status.REJECTED")}</Chip>}
                        {m.reversal && <Chip mono>{t("movements.reversal")}</Chip>}
                        {m.reversed && <Chip mono>{t("movements.reversed")}</Chip>}
                        {m.status === "POSTED" && (
                          <span title={t("movements.postedLocked")} className="inline-flex text-muted-foreground">
                            <Lock className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">{t("movements.postedLocked")}</span>
                          </span>
                        )}
                      </p>
                      <p className="mt-1 text-[12px] text-muted-foreground">
                        <span className="wf-num">{m.date}</span>
                        {!m.isTransfer && m.lender ? ` · ${m.lender}` : ""}
                        {m.description ? ` · ${m.description}` : ""}
                      </p>
                      {m.status === "REJECTED" && m.rejectedReason && (
                        <p className="mt-1 text-[12px] text-neg">{t("movements.rejectedReason", { reason: m.rejectedReason })}</p>
                      )}
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {m.isTransfer ? (
                      <div className="mr-2 text-right">
                        <p className="wf-figure">{fmtMoney(m.amountOut, m.currencyOut)}{m.currencyOut !== m.currencyIn && <> → {fmtMoney(m.amountIn, m.currencyIn)}</>}</p>
                        {m.rate && <p className="wf-num text-[12px] text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(Math.round(m.rate * 100) / 100)} VND/USD</p>}
                      </div>
                    ) : (
                      <span className={cn("wf-figure mr-2", !out && "text-pos")}>
                        {out ? "−" : "+"}{fmtMoney(Math.abs(m.amount), m.currency)}
                      </span>
                    )}
                    {/* Posted movements are locked: an admin reverses them, then records the correct one. */}
                    {m.status !== "POSTED" && (m.isTransfer
                      ? <TransferDialog accounts={accounts} transfer={m} trigger={editButton} />
                      : <MovementDialog accounts={accounts} loans={loans} movement={m} trigger={editButton} />)}
                    {isAdmin && m.status !== "POSTED" && (
                      <Button variant="ghost" size="icon-sm" className="hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")}
                        disabled={busyId === m.id} onClick={() => remove(m.id)}>
                        <Trash2 />
                      </Button>
                    )}
                    {isAdmin && m.status === "POSTED" && !m.reversal && !m.reversed && (
                      <Button variant="ghost" size="icon-sm" aria-label={t("actions.reverse")} title={t("actions.reverse")}
                        disabled={busyId === m.id} onClick={() => reverse(m.id)}>
                        <Undo2 />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
            {movements.length === 0 && <li className="text-muted-foreground">{t("movements.empty")}</li>}
          </ul>
        </Card>

        <Card className="self-start lg:col-span-4">
          <CardHeader>
            <h2 className="wf-panel__title">
              {t("loans.title")}
              <span className="wf-panel__count">{loans.length}</span>
            </h2>
            <CardDescription>{t("loans.description")}</CardDescription>
          </CardHeader>
          <ul className="wf-rows">
            {loans.map((l) => (
              <li key={l.id} className="flex-col items-stretch gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{l.lender}</p>
                  {l.notes && <p className="text-[12px] text-muted-foreground">{l.notes}</p>}
                </div>
                <div className="grid gap-1 font-mono text-[12px] tabular-nums">
                  <p className="text-muted-foreground">{t("loans.received", { amount: fmtMoney(l.received, l.currency) })}</p>
                  <p className="text-muted-foreground">{t("loans.repaid", { amount: fmtMoney(l.repaid, l.currency) })}</p>
                  <p className={cn("text-[13.5px] font-semibold", l.outstanding > 0 ? "text-neg" : "text-pos")}>
                    {t("loans.outstanding", { amount: fmtMoney(l.outstanding, l.currency) })}
                  </p>
                </div>
              </li>
            ))}
            {loans.length === 0 && <li className="text-muted-foreground">{t("loans.empty")}</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
