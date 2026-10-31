"use client";

import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, Loader2, Ban, Trash2, TriangleAlert, Paperclip, ArrowDownLeft, ArrowUpRight, ChevronDown, CircleAlert } from "lucide-react";
import { createInvoice, voidInvoice, deleteInvoice, unlinkAllocation } from "@/app/actions/invoices";
import { uploadProblem } from "@/lib/upload-limit";
import { EditInvoiceDialog } from "@/components/invoices/edit-invoice-dialog";
import { RecordPaymentDialog, LinkEntryDialog, type Candidate } from "@/components/invoices/payment-dialogs";
import { notify, notifyResult, notifyFailure } from "@/components/ui/toast";
import type { AccountOpt } from "@/components/accounts/account-select";
import { EPS, fmtMoney, totalsList, type Totals , vnToday } from "@/lib/money";
import { Chip, ENTRY_STATUS_TONE, INVOICE_STATUS_TONE, PanelHead, Stat, StatStrip } from "@/components/wf/ledger-ui";
import { cn } from "@/lib/utils";

type Invoice = {
  id: string; number: string | null; direction: string; party: string | null; projectName: string | null; categoryName: string | null;
  clientId: string | null; vendorId: string | null; projectId: string | null; categoryId: string | null; notes: string | null;
  issueDate: string; dueDate: string; paidDate: string | null;
  currency: string; amount: number; status: string; overdue: boolean; attachment: string | null;
  received: number; fees: number; difference: number;
  allocations: { id: string; kind: string; amount: number; date: string; accountName: string; description: string | null; draft: boolean; rejected: boolean; feeDeducted: number | null }[];
};
type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };

// One line per currency — the real amounts. The first is the figure; any other
// currency sits under it, smaller. In the USD view a converted total follows
// (`total`, already in the view currency) unless the one line is that currency.
// Nothing outstanding reads as a zero in the user's summary currency.
const statLines = (t: Totals, viewCurrency: string, total: number | null, label: (amount: string) => string) => {
  const lines = totalsList(t);
  if (lines.length === 0) return fmtMoney(0, viewCurrency);
  const out = lines.map(([c, v], i) => (i === 0 ? <span key={c}>{fmtMoney(v, c)}</span> : <small key={c}>{fmtMoney(v, c)}</small>));
  if (total !== null && !(lines.length === 1 && lines[0][0] === viewCurrency)) out.push(<small key="view">{label(fmtMoney(total, viewCurrency))}</small>);
  return out;
};
const totalsText = (t: Totals) => totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ");

export function InvoicesClient({
  invoices, clients, vendors, projects, categories, accounts, candidates, defaultUsdRate, summary, viewCurrency, isAdmin,
}: {
  invoices: Invoice[]; clients: Opt[]; vendors: Opt[]; projects: Opt[]; categories: Cat[]; accounts: AccountOpt[];
  candidates: Candidate[]; defaultUsdRate: number;
  summary: { ar: Totals; ap: Totals; arOverdue: Totals; apOverdue: Totals; inView: { ar: number; ap: number } | null };
  viewCurrency: string; // the user's summary currency (VND or USD)
  isAdmin: boolean; // voiding and deleting are the owner's decisions
}) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [direction, setDirection] = useState<"RECEIVABLE" | "PAYABLE">("RECEIVABLE");
  const [partyId, setPartyId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [currency, setCurrency] = useState("VND");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(false);
  const today = vnToday();
  // The due date can't be before the issue date (the server refuses it too).
  const [issueDate, setIssueDate] = useState(today);
  const parties = direction === "PAYABLE" ? vendors : clients;
  const [expanded, setExpanded] = useState<string | null>(null);
  const shown = openOnly ? invoices.filter((i) => i.status === "OPEN" || i.status === "PARTIAL") : invoices;
  // Receivables become income; payables become an expense — show the matching categories.
  const cats = categories.filter((c) => c.type === (direction === "PAYABLE" ? "EXPENSE" : "INCOME"));
  const feeCategories = categories.filter((c) => c.type === "EXPENSE");

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string) {
    setBusyId(id);
    try {
      const res = await fn();
      notifyResult(res, done);
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const tooBig = uploadProblem(fd.getAll("files") as File[], tc);
    if (tooBig) { setErr(tooBig); return; }
    setCreating(true);
    setErr("");
    fd.set("direction", direction);
    fd.set("clientId", direction === "RECEIVABLE" ? partyId : "");
    fd.set("vendorId", direction === "PAYABLE" ? partyId : "");
    fd.set("projectId", projectId);
    fd.set("categoryId", categoryId);
    fd.set("currency", currency);
    try {
      const res = await createInvoice(fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      form.reset();
      setIssueDate(today); setPartyId(""); setProjectId(""); setCategoryId(""); setCurrency("VND"); setShowForm(false);
      notify.success(direction === "PAYABLE" ? t("toast.billCreated") : t("toast.invoiceCreated"));
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setCreating(false);
    }
  }

  function statusChip(i: Invoice) {
    if (i.overdue) {
      return (
        <Chip tone={INVOICE_STATUS_TONE.OVERDUE} mono dot>
          <TriangleAlert className="size-3" aria-hidden="true" />{t("list.overdue")}
        </Chip>
      );
    }
    const key = `invoiceStatus.${i.status}`;
    return <Chip tone={INVOICE_STATUS_TONE[i.status] ?? "neutral"} mono dot>{tc.has(key) ? tc(key) : i.status}</Chip>;
  }

  const overdueSub = (o: Totals) => totalsList(o).length > 0
    ? <span className="text-neg">{t("summary.overdue", { amount: totalsText(o) })}</span>
    : t("summary.nothingOverdue");

  return (
    <>
      <StatStrip className="lg:grid-cols-2">
        <Stat label={t("summary.owedToYou")} icon={ArrowDownLeft} tone="pos" sub={overdueSub(summary.arOverdue)}>
          {statLines(summary.ar, viewCurrency, summary.inView?.ar ?? null, (amount) => t("summary.viewTotal", { amount }))}
        </Stat>
        <Stat label={t("summary.youOwe")} icon={ArrowUpRight} tone="neg" sub={overdueSub(summary.apOverdue)}>
          {statLines(summary.ap, viewCurrency, summary.inView?.ap ?? null, (amount) => t("summary.viewTotal", { amount }))}
        </Stat>
      </StatStrip>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="wf-seg" role="group" aria-label={t("filter.label")}>
          <button type="button" aria-pressed={!openOnly} onClick={() => setOpenOnly(false)}>{t("filter.all")}</button>
          <button type="button" aria-pressed={openOnly} onClick={() => setOpenOnly(true)}>{t("filter.openOnly")}</button>
        </div>
        <Button variant={showForm ? "outline" : "default"} aria-expanded={showForm} onClick={() => setShowForm((s) => !s)}>
          {showForm ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {showForm ? tc("actions.close") : t("newButton")}
        </Button>
      </div>

      {showForm && (
        <Card className="mt-4">
          <PanelHead title={t("newButton")} />
          <CardContent>
            <form onSubmit={handleCreate} className="grid items-start gap-5 md:grid-cols-2">
              <div className="wf-seg justify-self-start md:col-span-2" role="group" aria-label={t("form.direction")}>
                <button type="button" aria-pressed={direction === "RECEIVABLE"} onClick={() => { setDirection("RECEIVABLE"); setPartyId(""); setCategoryId(""); }}>
                  {t("form.receivable")}
                </button>
                <button type="button" aria-pressed={direction === "PAYABLE"} onClick={() => { setDirection("PAYABLE"); setPartyId(""); setCategoryId(""); }}>
                  {t("form.payable")}
                </button>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="inv-party">{direction === "PAYABLE" ? t("form.vendor") : t("form.client")}</Label>
                <Select value={partyId} onValueChange={(v) => setPartyId(v || "")} required>
                  <SelectTrigger id="inv-party" className="w-full">{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">{direction === "PAYABLE" ? t("form.selectVendor") : t("form.selectClient")}</span>}</SelectTrigger>
                  <SelectContent>
                    {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    {parties.length === 0 && <SelectItem value="empty" disabled>{t("form.addPartyFirst")}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-project">{t("form.project")}</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
                  <SelectTrigger id="inv-project" className="w-full">{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">{t("form.noProject")}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.noProject")}</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="inv-category">{t("form.category")}</Label>
                <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "none" ? "" : v || "")}>
                  <SelectTrigger id="inv-category" className="w-full">{categoryId ? <span>{cats.find(c => c.id === categoryId)?.name}</span> : <span className="text-muted-foreground">{t("form.noCategory")}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.noCategory")}</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {cats.length === 0 && <SelectItem value="empty" disabled>{direction === "PAYABLE" ? t("form.addExpenseCategories") : t("form.addIncomeCategories")}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="number">{direction === "PAYABLE" ? t("edit.billNumber") : t("edit.invoiceNumber")}</Label>
                <Input id="number" name="number" placeholder={t("form.numberPlaceholder")} required={direction !== "PAYABLE"} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="amount">{t("form.amount")}</Label>
                {/* The currency sits beside the input, so the label row matches its neighbour's. */}
                <div className="flex items-center gap-2">
                  <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required className="flex-1" />
                  <div className="wf-seg wf-seg--mono shrink-0" role="group" aria-label={t("form.currency")}>
                    {["VND", "USD"].map((c) => (
                      <button key={c} type="button" aria-pressed={currency === c} onClick={() => setCurrency(c)}>{c}</button>
                    ))}
                  </div>
                </div>
                {currency === "USD" && <p className="wf-num text-[12px] text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="issueDate">{t("form.issueDate")}</Label>
                <Input id="issueDate" name="issueDate" type="date" defaultValue={today} onChange={(e) => setIssueDate(e.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="dueDate">{t("form.dueDate")}</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={today} min={issueDate || undefined} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notes">{t("form.notes")}</Label>
                <Input id="notes" name="notes" placeholder={t("form.notesPlaceholder")} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="files">{t("form.attach")}</Label>
                <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf" />
              </div>
              {err && (
                <p className="flex items-center gap-1.5 text-[12px] text-destructive md:col-span-2" role="alert">
                  <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
                </p>
              )}
              <div className="flex justify-end md:col-span-2">
                <Button type="submit" disabled={creating}>
                  {creating && <Loader2 className="animate-spin" aria-hidden="true" />}{tc("actions.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="@container mt-4">
        <Table className="wf-stack wf-stack--invoices">
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.columns.invoice")}</TableHead>
              <TableHead>{t("list.columns.party")}</TableHead>
              <TableHead>{t("form.dueDate")}</TableHead>
              <TableHead className="text-right">{t("form.amount")}</TableHead>
              <TableHead><span className="sr-only">{t("list.columns.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((i) => {
              const payable = i.direction === "PAYABLE";
              const kind = payable ? tc("direction.PAYABLE") : tc("direction.RECEIVABLE");
              const linked = i.allocations.length > 0;
              const isExpanded = expanded === i.id;
              const sub = [i.projectName, i.categoryName].filter(Boolean).join(" · ");
              return (
                <Fragment key={i.id}>
                  <TableRow className={cn(linked && "border-b-0")}>
                    <TableCell data-col="invoice" className="py-3">
                      <div className="flex items-center gap-3">
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg border", payable ? "border-neg/40 text-neg" : "border-pos/40 text-pos")}>
                          {payable ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <ArrowDownLeft className="size-4" aria-hidden="true" />}
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="max-w-[10rem] truncate font-mono font-semibold text-foreground" title={i.number ?? undefined}>{i.number || kind}</span>
                            {statusChip(i)}
                            {i.attachment && (
                              <a href={`/api/uploads/${i.attachment.split('/').pop()}`} target="_blank" rel="noreferrer"
                                className="text-muted-foreground transition-colors duration-150 hover:text-primary" title={t("list.viewPdf")} aria-label={t("list.viewPdf")}>
                                <Paperclip className="size-3.5" aria-hidden="true" />
                              </a>
                            )}
                          </p>
                          <p className="wf-label mt-1.5">{kind} · {i.currency}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-col="party">
                      <span className="block max-w-[13rem] truncate text-foreground" title={i.party ?? undefined}>{i.party ?? "—"}</span>
                      {sub && <span className="block max-w-[13rem] truncate text-[12px] text-muted-foreground" title={sub}>{sub}</span>}
                    </TableCell>
                    <TableCell data-col="due">
                      <span className={cn("wf-num block", i.overdue ? "font-semibold text-neg" : "text-text-secondary")}>{t("list.due", { date: i.dueDate })}</span>
                      {i.paidDate && <span className="wf-num block text-[12px] text-muted-foreground">{t("list.paidOn", { date: i.paidDate })}</span>}
                    </TableCell>
                    <TableCell data-col="amount" className="text-right">
                      <span className={cn("wf-figure block text-[14.5px]", i.status === "VOID" ? "text-muted-foreground line-through" : payable ? "text-neg" : "text-pos")}>
                        {fmtMoney(i.amount, i.currency)}
                      </span>
                      {linked && (
                        <span className="block text-[12px] text-muted-foreground">
                          {payable ? t("list.paidAmount", { amount: fmtMoney(i.received, i.currency) }) : t("list.receivedAmount", { amount: fmtMoney(i.received, i.currency) })}
                          {i.fees > EPS && ` · ${t("list.fees", { amount: fmtMoney(i.fees, i.currency) })}`}
                        </span>
                      )}
                      {/* What is still outstanding is ordinary, not a warning; only an overpayment is flagged. */}
                      {linked && i.difference > EPS && i.status !== "VOID" && (
                        <span className="block text-[12px] text-muted-foreground">
                          {payable ? t("list.stillToPay", { amount: fmtMoney(i.difference, i.currency) }) : t("list.stillToReceive", { amount: fmtMoney(i.difference, i.currency) })}
                        </span>
                      )}
                      {i.difference < -EPS && <span className="block text-[12px] font-medium text-neg">{t("list.overpaidBy", { amount: fmtMoney(-i.difference, i.currency) })}</span>}
                    </TableCell>
                    <TableCell data-col="actions">
                      <div className="flex items-center justify-end gap-1">
                        {i.status !== "VOID" && (
                          <EditInvoiceDialog invoice={i} clients={clients} vendors={vendors} projects={projects} categories={categories} defaultUsdRate={defaultUsdRate} />
                        )}
                        {(i.status === "OPEN" || i.status === "PARTIAL") && <RecordPaymentDialog invoice={i} accounts={accounts} defaultUsdRate={defaultUsdRate} feeCategories={feeCategories} />}
                        {i.status !== "VOID" && <LinkEntryDialog invoice={i} candidates={candidates} />}
                        {isAdmin && !linked && i.status === "OPEN" && (
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={t("list.void")} title={t("list.void")} disabled={busyId === i.id}
                            onClick={() => { if (confirm(t("confirm.void"))) run(i.id, () => voidInvoice(i.id), payable ? t("toast.billVoided") : t("toast.invoiceVoided")); }}>
                            <Ban />
                          </Button>
                        )}
                        {isAdmin && !linked && (
                          <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")} disabled={busyId === i.id}
                            onClick={() => { if (confirm(t("confirm.delete"))) run(i.id, () => deleteInvoice(i.id), payable ? t("toast.billDeleted") : t("toast.invoiceDeleted")); }}>
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {linked && (
                    <TableRow data-row="more" className="hover:bg-transparent has-aria-expanded:bg-transparent">
                      <TableCell data-col="more" colSpan={5} className="pt-0 pb-3 whitespace-normal first:pl-[68px]">
                        <button type="button" aria-expanded={isExpanded} onClick={() => setExpanded(isExpanded ? null : i.id)}
                          className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary transition-colors duration-150 hover:text-primary">
                          <ChevronDown className={cn("size-3.5 transition-transform duration-150", isExpanded && "rotate-180")} aria-hidden="true" />
                          {isExpanded ? t("list.hideLinked", { count: i.allocations.length }) : t("list.showLinked", { count: i.allocations.length })}
                        </button>
                        {isExpanded && (
                          <ul className="mt-2 divide-y divide-border border-y border-border">
                            {i.allocations.map((a) => (
                              <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                                <div className="min-w-0 text-[13px]">
                                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <Chip tone={a.kind === "FEE" ? "neutral" : "pos"}>{a.kind === "FEE" ? t("kind.FEE") : t("kind.PAYMENT")}</Chip>
                                    <span className="wf-num text-muted-foreground">{a.date}</span>
                                    <span className="text-text-secondary">{a.accountName}{a.description ? ` · ${a.description}` : ""}</span>
                                    {a.draft && <Chip tone={ENTRY_STATUS_TONE.DRAFT}>{t("list.draftBadge")}</Chip>}
                                    {a.rejected && <Chip tone={ENTRY_STATUS_TONE.REJECTED} mono>{tc("status.REJECTED")}</Chip>}
                                  </p>
                                  {a.feeDeducted ? (
                                    <span className="mt-1 block text-[12px] text-muted-foreground">
                                      {t("list.feeDeducted", { fee: fmtMoney(a.feeDeducted, i.currency), net: fmtMoney(a.amount - a.feeDeducted, i.currency), account: a.accountName })}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                  <span className="wf-figure">{fmtMoney(a.amount, i.currency)}</span>
                                  <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive" aria-label={t("list.unlinkTitle")} title={t("list.unlinkTitle")}
                                    disabled={busyId === a.id}
                                    onClick={() => { if (confirm(t("confirm.unlink"))) run(a.id, () => unlinkAllocation(a.id), t("toast.unlinked")); }}>
                                    <X />
                                  </Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {shown.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell data-col="full" colSpan={5} className="py-10 text-center whitespace-normal text-muted-foreground">{openOnly ? t("list.emptyOpen") : t("list.empty")}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
