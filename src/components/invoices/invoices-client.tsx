"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Plus, Loader2, Ban, Trash2, AlertTriangle, Paperclip, ArrowDownLeft, ArrowUpRight, X } from "lucide-react";
import { createInvoice, voidInvoice, deleteInvoice, unlinkAllocation } from "@/app/actions/invoices";
import { uploadProblem } from "@/lib/upload-limit";
import { EditInvoiceDialog } from "@/components/invoices/edit-invoice-dialog";
import { RecordPaymentDialog, LinkEntryDialog, type Candidate } from "@/components/invoices/payment-dialogs";
import { notify, notifyResult } from "@/components/ui/toast";
import type { AccountOpt } from "@/components/accounts/account-select";
import { EPS, fmtMoney, fmtVnd, totalsList, type Totals , vnToday } from "@/lib/money";

type Invoice = {
  id: string; number: string | null; direction: string; party: string | null; projectName: string | null; categoryName: string | null;
  clientId: string | null; vendorId: string | null; projectId: string | null; categoryId: string | null; notes: string | null;
  issueDate: string; dueDate: string; paidDate: string | null;
  currency: string; amount: number; status: string; overdue: boolean; attachment: string | null;
  received: number; fees: number; difference: number;
  allocations: { id: string; kind: string; amount: number; date: string; accountName: string; description: string | null; draft: boolean; feeDeducted: number | null }[];
};
type Opt = { id: string; name: string };
type Cat = { id: string; name: string; type: string };

// One line per currency — currencies are never added together.
const Totals = ({ t, className }: { t: Totals; className: string }) => {
  const lines = totalsList(t);
  if (lines.length === 0) return <div className={className}>{fmtVnd(0)}</div>;
  return <>{lines.map(([c, v]) => <div key={c} className={className}>{fmtMoney(v, c)}</div>)}</>;
};
const totalsText = (t: Totals) => totalsList(t).map(([c, v]) => fmtMoney(v, c)).join(" · ");

export function InvoicesClient({
  invoices, clients, vendors, projects, categories, accounts, candidates, defaultUsdRate, summary, isAdmin,
}: {
  invoices: Invoice[]; clients: Opt[]; vendors: Opt[]; projects: Opt[]; categories: Cat[]; accounts: AccountOpt[];
  candidates: Candidate[]; defaultUsdRate: number;
  summary: { ar: Totals; ap: Totals; arOverdue: Totals; apOverdue: Totals };
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
      notify.error(tc("errors.somethingWrong"));
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
      setPartyId(""); setProjectId(""); setCategoryId(""); setCurrency("VND"); setShowForm(false);
      notify.success(direction === "PAYABLE" ? t("toast.billCreated") : t("toast.invoiceCreated"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setCreating(false);
    }
  }

  function statusBadge(i: Invoice) {
    if (i.overdue) return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("list.overdue")}</span>;
    const map: Record<string, string> = {
      OPEN: "bg-amber-100 text-amber-700", PARTIAL: "bg-orange-100 text-orange-700",
      PAID: "bg-green-100 text-green-700", VOID: "bg-gray-100 text-gray-400 line-through",
    };
    const key = `invoiceStatus.${i.status}`;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[i.status] || ""}`}>{tc.has(key) ? tc(key) : i.status}</span>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-green-600" />{t("summary.owedToYou")}</CardTitle></CardHeader>
          <CardContent>
            <Totals t={summary.ar} className="text-2xl font-bold text-green-600" />
            <p className="text-xs text-muted-foreground mt-1">{totalsList(summary.arOverdue).length > 0 ? <span className="text-red-600">{t("summary.overdue", { amount: totalsText(summary.arOverdue) })}</span> : t("summary.nothingOverdue")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium inline-flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-600" />{t("summary.youOwe")}</CardTitle></CardHeader>
          <CardContent>
            <Totals t={summary.ap} className="text-2xl font-bold text-red-600" />
            <p className="text-xs text-muted-foreground mt-1">{totalsList(summary.apOverdue).length > 0 ? <span className="text-red-600">{t("summary.overdue", { amount: totalsText(summary.apOverdue) })}</span> : t("summary.nothingOverdue")}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="flex bg-muted p-1 rounded-lg text-sm">
          <button type="button" onClick={() => setOpenOnly(false)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${!openOnly ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{t("filter.all")}</button>
          <button type="button" onClick={() => setOpenOnly(true)}
            className={`px-3 py-1 rounded-md font-medium transition-all ${openOnly ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{t("filter.openOnly")}</button>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} className="gap-2"><Plus className="h-4 w-4" />{showForm ? tc("actions.close") : t("newButton")}</Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2 flex bg-muted p-1 rounded-lg">
                <button type="button" onClick={() => { setDirection("RECEIVABLE"); setPartyId(""); setCategoryId(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${direction === "RECEIVABLE" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
                  {t("form.receivable")}
                </button>
                <button type="button" onClick={() => { setDirection("PAYABLE"); setPartyId(""); setCategoryId(""); }}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${direction === "PAYABLE" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
                  {t("form.payable")}
                </button>
              </div>

              <div className="space-y-2">
                <Label>{direction === "PAYABLE" ? t("form.vendor") : t("form.client")}</Label>
                <Select value={partyId} onValueChange={(v) => setPartyId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{partyId ? <span>{parties.find(p => p.id === partyId)?.name}</span> : <span className="text-muted-foreground">{direction === "PAYABLE" ? t("form.selectVendor") : t("form.selectClient")}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.none")}</SelectItem>
                    {parties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    {parties.length === 0 && <SelectItem value="empty" disabled>{t("form.addPartyFirst")}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("form.project")}</Label>
                <Select value={projectId} onValueChange={(v) => setProjectId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{projectId ? <span>{projects.find(p => p.id === projectId)?.name}</span> : <span className="text-muted-foreground">{t("form.noProject")}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.noProject")}</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("form.category")}</Label>
                <Select value={categoryId} onValueChange={(v) => setCategoryId(v === "none" ? "" : v || "")}>
                  <SelectTrigger>{categoryId ? <span>{cats.find(c => c.id === categoryId)?.name}</span> : <span className="text-muted-foreground">{t("form.noCategory")}</span>}</SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.noCategory")}</SelectItem>
                    {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    {cats.length === 0 && <SelectItem value="empty" disabled>{direction === "PAYABLE" ? t("form.addExpenseCategories") : t("form.addIncomeCategories")}</SelectItem>}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="number">{t("form.number")}</Label>
                <Input id="number" name="number" placeholder={t("form.numberPlaceholder")} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="amount">{t("form.amount")}</Label>
                  <div className="flex bg-muted p-0.5 rounded text-xs font-medium">
                    <span onClick={() => setCurrency("VND")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "VND" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>VND</span>
                    <span onClick={() => setCurrency("USD")} className={`px-2 py-0.5 rounded-sm cursor-pointer ${currency === "USD" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>USD</span>
                  </div>
                </div>
                <Input id="amount" name="amount" type="number" step="0.01" min="0" placeholder="0.00" required />
                {currency === "USD" && <p className="text-xs text-muted-foreground">@ {new Intl.NumberFormat("vi-VN").format(defaultUsdRate)} ₫/USD</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="issueDate">{t("form.issueDate")}</Label>
                <Input id="issueDate" name="issueDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">{t("form.dueDate")}</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={today} required />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="notes">{t("form.notes")}</Label>
                <Input id="notes" name="notes" placeholder={t("form.notesPlaceholder")} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="files">{t("form.attach")}</Label>
                <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf" />
              </div>
              {err && <p className="text-sm text-destructive md:col-span-2">{err}</p>}
              <Button type="submit" disabled={creating} className="md:col-span-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : tc("actions.save")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 divide-y">
          {shown.map((i) => (
            <div key={i.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-col min-w-[180px]">
                <span className="text-sm font-medium flex items-center gap-2">
                  {i.direction === "PAYABLE"
                    ? <ArrowUpRight className="h-3.5 w-3.5 text-red-500" />
                    : <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" />}
                  {i.number || (i.direction === "PAYABLE" ? tc("direction.PAYABLE") : tc("direction.RECEIVABLE"))} {statusBadge(i)}
                  {i.attachment && <a href={`/api/uploads/${i.attachment.split('/').pop()}`} target="_blank" rel="noreferrer" className="text-blue-500" title={t("list.viewPdf")}><Paperclip className="h-3.5 w-3.5" /></a>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {[i.party, i.projectName, i.categoryName].filter(Boolean).join(" · ") || "—"} · {t("list.due", { date: i.dueDate })}
                  {i.paidDate && ` · ${t("list.paidOn", { date: i.paidDate })}`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className={`text-sm font-semibold ${i.direction === "PAYABLE" ? "text-red-600" : "text-green-700"}`}>{fmtMoney(i.amount, i.currency)}</div>
                  {i.allocations.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {i.direction === "PAYABLE" ? t("list.paidAmount", { amount: fmtMoney(i.received, i.currency) }) : t("list.receivedAmount", { amount: fmtMoney(i.received, i.currency) })}
                      {i.fees > EPS && ` · ${t("list.fees", { amount: fmtMoney(i.fees, i.currency) })}`}
                    </div>
                  )}
                  {i.allocations.length > 0 && i.difference > EPS && i.status !== "VOID" && (
                    <div className="text-xs font-medium text-amber-700" title={t("list.differenceTitle")}>
                      {t("list.unmatchedDifference", { amount: fmtMoney(i.difference, i.currency) })}
                    </div>
                  )}
                  {i.difference < -EPS && <div className="text-xs font-medium text-red-600">{t("list.overpaidBy", { amount: fmtMoney(-i.difference, i.currency) })}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {i.status !== "VOID" && (
                    <EditInvoiceDialog invoice={i} clients={clients} vendors={vendors} projects={projects} categories={categories} defaultUsdRate={defaultUsdRate} />
                  )}
                  {(i.status === "OPEN" || i.status === "PARTIAL") && <RecordPaymentDialog invoice={i} accounts={accounts} defaultUsdRate={defaultUsdRate} feeCategories={feeCategories} />}
                  {i.status !== "VOID" && <LinkEntryDialog invoice={i} candidates={candidates} />}
                  {isAdmin && i.allocations.length === 0 && i.status === "OPEN" && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title={t("list.void")} disabled={busyId === i.id}
                      onClick={() => { if (confirm(t("confirm.void"))) run(i.id, () => voidInvoice(i.id), i.direction === "PAYABLE" ? t("toast.billVoided") : t("toast.invoiceVoided")); }}>
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                  {isAdmin && i.allocations.length === 0 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" title={tc("actions.delete")} disabled={busyId === i.id}
                      onClick={() => { if (confirm(t("confirm.delete"))) run(i.id, () => deleteInvoice(i.id), i.direction === "PAYABLE" ? t("toast.billDeleted") : t("toast.invoiceDeleted")); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
            {i.allocations.length > 0 && (
              <div>
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setExpanded(expanded === i.id ? null : i.id)}>
                  {expanded === i.id ? t("list.hideLinked", { count: i.allocations.length }) : t("list.showLinked", { count: i.allocations.length })}
                </button>
                {expanded === i.id && (
                  <div className="mt-2 space-y-1">
                    {i.allocations.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-md px-3 py-1.5 text-xs">
                        <span>
                          <span className={`mr-2 px-1.5 py-0.5 rounded font-medium ${a.kind === "FEE" ? "bg-slate-200 text-slate-700" : "bg-green-100 text-green-700"}`}>
                            {a.kind === "FEE" ? t("kind.FEE") : t("kind.PAYMENT")}
                          </span>
                          {a.date} · {a.accountName}{a.description ? ` · ${a.description}` : ""}
                          {a.draft && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{t("list.draftBadge")}</span>}
                          {a.feeDeducted ? (
                            <span className="block mt-0.5 text-muted-foreground">
                              {t("list.feeDeducted", { fee: fmtMoney(a.feeDeducted, i.currency), net: fmtMoney(a.amount - a.feeDeducted, i.currency), account: a.accountName })}
                            </span>
                          ) : null}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{fmtMoney(a.amount, i.currency)}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" title={t("list.unlinkTitle")}
                            disabled={busyId === a.id}
                            onClick={() => { if (confirm(t("confirm.unlink"))) run(a.id, () => unlinkAllocation(a.id), t("toast.unlinked")); }}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          ))}
          {shown.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">{openOnly ? t("list.emptyOpen") : t("list.empty")}</div>}
        </CardContent>
      </Card>
    </div>
  );
}
