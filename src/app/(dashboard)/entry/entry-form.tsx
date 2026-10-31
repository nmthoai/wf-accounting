"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { createTransaction, editTransaction, deleteAttachment } from "@/app/actions/ledger";
import { Loader2, UploadCloud, Paperclip, X } from "lucide-react";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { CURRENCIES, vnToday } from "@/lib/money";
import { DOC_STATUS, PURPOSE_STATUS, CIT_STATUS, VAT_STATUS } from "@/lib/review";
import { uploadProblem } from "@/lib/upload-limit";
import { notify, notifyResult } from "@/components/ui/toast";
import { BookedRate } from "@/components/ledger/booked-rate";
import { Chip, Notice } from "@/components/wf/ledger-ui";

const hint = "text-[12px] text-muted-foreground";

// One of the evidence/tax review statuses, as a dropdown.
function StatusSelect({ id, label, options, value, onChange, disabled }: {
  id: string; label: string; options: Record<string, string>; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v || "PENDING")} disabled={disabled}>
        <SelectTrigger id={id} className="w-full"><span>{options[value] ?? value}</span></SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, text]) => <SelectItem key={k} value={k}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

type Category = { id: string; name: string; type: string };
type Attachment = { id: string; fileName: string; filePath: string };
// What a new entry starts from (a bank line, a register receipt, a reversed
// entry to re-enter) or what an edited entry holds.
type EntryValues = {
  type?: string; currency?: string; amount?: number; date?: Date | string;
  accountId?: string | null; categoryId?: string | null; projectId?: string | null; vendorId?: string | null;
  description?: string | null; invoiceNumber?: string | null;
  exchangeRate?: number; vndAmount?: number | null; rateSource?: string | null;
  docStatus?: string; purposeStatus?: string; citStatus?: string; vatStatus?: string;
  vatAmount?: number | null; reviewNote?: string | null; attachments?: Attachment[];
};
type RecordedEntry = EntryValues & {
  id: string; currency: string; amount: number; exchangeRate: number; vndAmount: number | null; rateSource: string | null;
  transferId?: string | null; deductedFromId?: string | null; deductedFee?: { amount: number } | null;
};

export function EntryForm({
  categories,
  projects = [],
  vendors = [],
  accounts,
  defaultUsdRate,
  isAdmin,
  initialData,
  prefill,
  bankLine,
  correction,
  costItem,
  locked = false
}: {
  categories: Category[];
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  accounts: AccountOpt[];
  defaultUsdRate: number;
  isAdmin: boolean;
  initialData?: RecordedEntry;
  prefill?: EntryValues; // a new entry started from a bank statement line, or re-entered after a reversal
  bankLine?: { id: string; label: string };
  correction?: { id: string; label: string }; // the reversed posted entry this one replaces
  costItem?: { id: string; label: string }; // the cost register receipt this expense records
  locked?: boolean; // posted: only evidence, tax review and new attachments can change
}) {
  const t = useTranslations("ledger");
  const tc = useTranslations("common");
  const router = useRouter();
  const init = initialData ?? prefill;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">(init?.type === "INCOME" ? "INCOME" : "EXPENSE");
  const [currency, setCurrency] = useState<string>(init?.currency || "VND");
  const [projectId, setProjectId] = useState<string>(init?.projectId || "");
  const [vendorId, setVendorId] = useState<string>(init?.vendorId || "");
  const [accountId, setAccountId] = useState<string>(init?.accountId || "");
  // How a USD amount converts: bank-settled VND (exact), a manual rate, or the default.
  const [rateMode, setRateMode] = useState<"BANK" | "MANUAL" | "DEFAULT">(
    init?.rateSource === "BANK" ? "BANK" : init?.rateSource === "MANUAL" ? "MANUAL" : "DEFAULT"
  );
  const account = accounts.find((a) => a.id === accountId);
  const usdAccount = account?.currency === "USD";
  // Evidence and tax review — everything starts pending.
  const [docStatus, setDocStatus] = useState<string>(init?.docStatus || "PENDING");
  const [purposeStatus, setPurposeStatus] = useState<string>(init?.purposeStatus || "PENDING");
  const [citStatus, setCitStatus] = useState<string>(init?.citStatus || "PENDING");
  const [vatStatus, setVatStatus] = useState<string>(init?.vatStatus || "PENDING");
  // A review status dropdown's choices, in the order the statuses are defined.
  const reviewOptions = (group: string, statuses: Record<string, string>) =>
    Object.fromEntries(Object.keys(statuses).map((k) => [k, tc(`review.${group}.${k}`)]));

  function chooseAccount(id: string) {
    setAccountId(id);
    // A USD account only holds USD.
    if (accounts.find((a) => a.id === id)?.currency === "USD") setCurrency("USD");
  }

  function chooseCurrency(c: string) {
    if (usdAccount && c !== "USD") return;
    setCurrency(c);
    // Only USD has a company default rate.
    if (c !== "USD" && rateMode === "DEFAULT") setRateMode("BANK");
  }

  const filteredCategories = categories.filter((c) => c.type === type);

  const isEdit = !!initialData;
  
  const [categoryId, setCategoryId] = useState<string>(
    init?.type === type ? (init?.categoryId || "") : ""
  );

  const selectedCategory = categories.find(c => c.id === categoryId);

  const [attachments, setAttachments] = useState<Attachment[]>(init?.attachments || []);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Files chosen but not yet saved. We own this list (the native input only
  // keeps its last selection), so picking "Add more files" twice accumulates.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    const problem = uploadProblem([...pendingFiles, ...chosen], tc);
    if (problem) notify.error(problem);
    else if (chosen.length) setPendingFiles((prev) => [...prev, ...chosen]);
    e.target.value = ""; // let the same file be re-picked; state is the source of truth
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleRemoveAttachment(id: string) {
    if (!confirm(t("form.confirmRemoveReceipt"))) return;
    setRemovingId(id);
    try {
      const res = await deleteAttachment(id);
      if (!notifyResult(res, t("toast.receiptRemoved"), t("toast.receiptRemoveFailed"))) return;
      setAttachments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setRemovingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    
    const formData = new FormData(e.currentTarget);
    formData.set("type", type);
    formData.set("currency", currency);
    formData.set("categoryId", categoryId);
    formData.set("projectId", projectId);
    formData.set("vendorId", type === "EXPENSE" ? vendorId : "");
    formData.set("accountId", accountId);
    formData.set("rateMode", rateMode);
    formData.set("docStatus", docStatus);
    formData.set("purposeStatus", purposeStatus);
    formData.set("citStatus", citStatus);
    formData.set("vatStatus", vatStatus);
    if (bankLine) formData.set("bankLineId", bankLine.id);
    if (correction) formData.set("correctionOfId", correction.id);
    if (costItem) formData.set("costItemId", costItem.id);
    // Submit exactly the files shown in the UI (state owns the list).
    formData.delete("files");
    for (const f of pendingFiles) formData.append("files", f);

    try {
      let res;
      if (isEdit) {
        res = await editTransaction(initialData.id, formData);
      } else {
        res = await createTransaction(formData);
      }

      if (notifyResult(res, isEdit ? t("toast.saved") : t("toast.created"))) {
        router.push(bankLine ? "/bank" : costItem ? "/costs" : "/ledger");
      }
    } catch {
      notify.error(t("toast.somethingWrong"));
    } finally {
      setIsSubmitting(false);
    }
  }

  const defaultDate = init?.date 
    ? new Date(init.date).toISOString().split('T')[0]
    : vnToday();

  const strong = (c: React.ReactNode) => <span className="font-semibold text-foreground">{c}</span>;

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <div className="grid gap-5 p-5">
          {bankLine && <Notice tone="info">{t.rich("form.fromBankLine", { label: bankLine.label, b: strong })}</Notice>}
          {costItem && <Notice tone="info">{t.rich("form.fromCostItem", { label: costItem.label, b: strong })}</Notice>}
          {correction && <Notice tone="info">{t.rich("form.correcting", { label: correction.label, b: strong })}</Notice>}

          {/* Type toggle */}
          <fieldset disabled={locked} aria-label={t("form.entryType")} className="wf-seg m-0 flex w-full min-w-0">
            <button
              type="button"
              aria-pressed={type === "EXPENSE"}
              className="h-9 flex-1 justify-center gap-2 disabled:cursor-not-allowed"
              onClick={() => {
                setType("EXPENSE");
                if (init?.type === "EXPENSE") setCategoryId(init?.categoryId || "");
                else setCategoryId("");
              }}
            >
              <span className="size-2 rounded-full bg-neg" aria-hidden="true" />
              {tc("type.EXPENSE")}
            </button>
            <button
              type="button"
              aria-pressed={type === "INCOME"}
              className="h-9 flex-1 justify-center gap-2 disabled:cursor-not-allowed"
              onClick={() => {
                setType("INCOME");
                if (init?.type === "INCOME") setCategoryId(init?.categoryId || "");
                else setCategoryId("");
              }}
            >
              <span className="size-2 rounded-full bg-pos" aria-hidden="true" />
              {tc("type.INCOME")}
            </button>
          </fieldset>

          {/* Posted entries keep their money and classification. */}
          <fieldset disabled={locked} className="m-0 grid min-w-0 gap-5 border-0 p-0 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label>{type === "INCOME" ? t("form.receivedInto") : t("form.paidFrom")}</Label>
              <div className="[&_[data-slot=select-trigger]]:w-full">
                <AccountSelect
                  accounts={accounts.filter((a) => a.isActive || a.id === accountId)}
                  value={accountId}
                  onChange={chooseAccount}
                  placeholder={t("form.accountPlaceholder")}
                />
              </div>
              <p className={hint}>{t("form.accountHint")}</p>
            </div>

            <div className="grid gap-2">
              <div className="flex min-h-8 items-center">
                <Label htmlFor="date">{t("form.date")}</Label>
              </div>
              <Input id="date" name="date" type="date" required defaultValue={defaultDate} className="font-mono" />
            </div>

            <div className="grid gap-2">
              <div className="flex min-h-8 items-center justify-between gap-3">
                <Label htmlFor="amount">{t("form.amount")}</Label>
                <div className="wf-seg wf-seg--mono" role="group" aria-label={t("form.currency")}>
                  {CURRENCIES.map((c) => (
                    <button key={c} type="button" aria-pressed={currency === c} disabled={usdAccount && c !== "USD"} onClick={() => chooseCurrency(c)}
                      className="h-6 disabled:cursor-not-allowed disabled:opacity-(--opacity-disabled)">{c}</button>
                  ))}
                </div>
              </div>
              <Input id="amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" defaultValue={init?.amount} className="font-mono" />
            </div>

            {currency !== "VND" && (
              <div className="grid gap-3 md:col-span-2">
                <Label htmlFor={initialData && initialData.currency === currency ? undefined : rateMode === "BANK" ? "vndAmount" : rateMode === "MANUAL" ? "rate" : undefined}>
                  {t("form.vndValue")}
                </Label>
                {initialData && initialData.currency === currency ? (
                  // Recorded: it keeps its booked VND value; only an explicit revaluation changes it.
                  <BookedRate entry={initialData} isAdmin={isAdmin} locked={locked} defaultUsdRate={defaultUsdRate} />
                ) : (<>
                  <div className="wf-seg justify-self-start" role="group" aria-label={t("form.vndValue")}>
                    {([["BANK", t("form.rateBank")], ["MANUAL", t("form.rateManual")], ...(currency === "USD" ? [["DEFAULT", t("form.rateDefault", { rate: new Intl.NumberFormat("vi-VN").format(defaultUsdRate) })]] : [])] as [ "BANK" | "MANUAL" | "DEFAULT", string][]).map(([m, label]) => (
                      <button key={m} type="button" aria-pressed={rateMode === m} onClick={() => setRateMode(m)}>{label}</button>
                    ))}
                  </div>
                  {rateMode === "BANK" && (
                    <Input id="vndAmount" name="vndAmount" type="number" step="1" min="0" required placeholder={t("form.vndPlaceholder")}
                      defaultValue={init?.vndAmount ?? ""} className="font-mono" />
                  )}
                  {rateMode === "MANUAL" && (
                    <Input id="rate" name="rate" type="number" step="any" min="0" required placeholder={t("form.ratePlaceholder", { currency })}
                      defaultValue={init?.rateSource === "MANUAL" ? init.exchangeRate : ""} className="font-mono" />
                  )}
                  <p className={hint}>
                    {rateMode === "BANK" ? t("form.rateBankHint")
                      : rateMode === "MANUAL" ? t("form.rateManualHint")
                      : t("form.rateDefaultHint")}
                  </p>
                </>)}
              </div>
            )}

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="categoryId">{t("form.category")}</Label>
              <Select value={categoryId} onValueChange={(val) => setCategoryId(val || "")} required>
                <SelectTrigger id="categoryId" className="w-full">
                  {selectedCategory ? (
                    <span className="flex-1 text-left">{selectedCategory.name}</span>
                  ) : (
                    <span className="flex-1 text-left text-muted-foreground">{t("form.categoryPlaceholder")}</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {filteredCategories.length === 0 && <SelectItem value="none" disabled>{t("form.noCategories")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="projectId">{t("form.project")}</Label>
              <Select value={projectId} onValueChange={(val) => setProjectId(val === "none" ? "" : (val || ""))}>
                <SelectTrigger id="projectId" className="w-full">
                  {projectId
                    ? <span className="flex-1 text-left">{projects.find(p => p.id === projectId)?.name || t("form.unknown")}</span>
                    : <span className="flex-1 text-left text-muted-foreground">{t("form.noProject")}</span>}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("form.noProject")}</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {projects.length === 0 && <SelectItem value="empty" disabled>{t("form.noProjects")}</SelectItem>}
                </SelectContent>
              </Select>
              <p className={hint}>{t("form.projectHint")}</p>
            </div>

            {type === "EXPENSE" && (
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="vendorId">{t("form.vendor")}</Label>
                <Select value={vendorId} onValueChange={(val) => setVendorId(val === "none" ? "" : (val || ""))}>
                  <SelectTrigger id="vendorId" className="w-full">
                    {vendorId
                      ? <span className="flex-1 text-left">{vendors.find(v => v.id === vendorId)?.name || t("form.unknown")}</span>
                      : <span className="flex-1 text-left text-muted-foreground">{t("form.noVendor")}</span>}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("form.noVendor")}</SelectItem>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                    {vendors.length === 0 && <SelectItem value="empty" disabled>{t("form.noVendors")}</SelectItem>}
                  </SelectContent>
                </Select>
                <p className={hint}>{t("form.vendorHint")}</p>
              </div>
            )}

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="invoiceNumber">{t("form.invoiceNumber")}</Label>
              <Input id="invoiceNumber" name="invoiceNumber" placeholder={t("form.invoiceNumberPlaceholder")} defaultValue={init?.invoiceNumber || ""} />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="description">{t("form.description")}</Label>
              <Input id="description" name="description" placeholder={t("form.descriptionPlaceholder")} required defaultValue={init?.description || ""} />
            </div>
          </fieldset>
        </div>

        <section className="grid gap-3 border-t border-border p-5">
          <h2 className="wf-label">{t("form.attachments")}</h2>

          {(attachments.length > 0 || pendingFiles.length > 0) && (
            <ul className="divide-y divide-border border-y border-border">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-1.5">
                  <a
                    href={`/api/uploads/${a.filePath.split('/').pop()}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-primary transition-colors duration-150 hover:text-primary-hover"
                    title={a.fileName}
                  >
                    <Paperclip className="size-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{a.fileName}</span>
                  </a>
                  {!locked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="hover:bg-destructive/10 hover:text-destructive"
                      disabled={removingId === a.id}
                      onClick={() => handleRemoveAttachment(a.id)}
                      title={t("form.removeReceipt")}
                      aria-label={t("form.removeReceipt")}
                    >
                      {removingId === a.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <X aria-hidden="true" />}
                    </Button>
                  )}
                </li>
              ))}
              {pendingFiles.map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="flex min-w-0 items-center gap-2 text-foreground" title={f.name}>
                    <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{f.name}</span>
                    <Chip tone="info" className="shrink-0">{t("form.toUpload")}</Chip>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removePendingFile(idx)}
                    title={tc("actions.remove")}
                    aria-label={tc("actions.remove")}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <label
            htmlFor="files"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong px-6 py-7 text-center transition-colors duration-150 hover:border-muted-foreground hover:bg-secondary/45 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
          >
            <UploadCloud className="size-6 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">
              <span className="font-semibold text-primary">{isEdit ? t("form.addMoreFiles") : t("form.uploadFiles")}</span> {t("form.orTakePhoto")}
            </span>
            <span className={hint}>{t("form.fileTypes")}</span>
            <input id="files" name="files" type="file" multiple className="sr-only" accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed" onChange={handleFilesChosen} />
          </label>
        </section>

        <section className="grid gap-4 border-t border-border p-5">
          <div className="grid gap-1.5">
            <h2 className="wf-label">{t("form.review")}</h2>
            <p className={hint}>
              {type === "EXPENSE"
                ? t("form.reviewHintExpense")
                : t("form.reviewHintIncome")}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <StatusSelect id="docStatus" label={t("form.document")} options={reviewOptions("doc", DOC_STATUS)} value={docStatus} onChange={setDocStatus} />
            {type === "EXPENSE" && (
              <>
                <StatusSelect id="purposeStatus" label={t("form.purpose")} options={reviewOptions("purpose", PURPOSE_STATUS)} value={purposeStatus} onChange={setPurposeStatus} disabled={!isAdmin} />
                <StatusSelect id="citStatus" label={t("form.cit")} options={reviewOptions("cit", CIT_STATUS)} value={citStatus} onChange={setCitStatus} disabled={!isAdmin} />
                <StatusSelect id="vatStatus" label={t("form.vat")} options={reviewOptions("vat", VAT_STATUS)} value={vatStatus} onChange={setVatStatus} disabled={!isAdmin} />
                <div className="grid gap-2">
                  <Label htmlFor="vatAmount">{t("form.vatAmount", { currency })}</Label>
                  <Input id="vatAmount" name="vatAmount" type="number" step="any" min="0" placeholder={t("form.vatAmountPlaceholder")} defaultValue={init?.vatAmount ?? ""} className="font-mono" />
                </div>
              </>
            )}
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="reviewNote">{t("form.reviewNote")}</Label>
              <Input id="reviewNote" name="reviewNote" placeholder={t("form.reviewNotePlaceholder")} defaultValue={init?.reviewNote || ""} />
            </div>
          </div>
          {type === "EXPENSE" && !isAdmin && (
            <p className={hint}>{t("form.ownerDecides")}</p>
          )}
        </section>

        {isEdit && (
          <div className="grid gap-2 border-t border-border p-5">
            <Label htmlFor="reason">{t("form.reason")}</Label>
            <Input id="reason" name="reason" placeholder={t("form.reasonPlaceholder")} />
          </div>
        )}

        <CardFooter className="justify-end">
          <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                {t("form.saving")}
              </>
            ) : (
              locked ? t("form.saveReview") : isEdit ? t("form.update") : t("form.save")
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
