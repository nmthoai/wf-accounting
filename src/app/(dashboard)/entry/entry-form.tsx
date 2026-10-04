"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTransaction, editTransaction, deleteAttachment } from "@/app/actions/ledger";
import { Loader2, UploadCloud, Paperclip, X } from "lucide-react";
import { AccountSelect, type AccountOpt } from "@/components/accounts/account-select";
import { CURRENCIES } from "@/lib/money";
import { DOC_STATUS, PURPOSE_STATUS, CIT_STATUS, VAT_STATUS } from "@/lib/review";
import { uploadProblem } from "@/lib/upload-limit";

// One of the evidence/tax review statuses, as a dropdown.
function StatusSelect({ id, label, options, value, onChange, disabled }: {
  id: string; label: string; options: Record<string, string>; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v || "PENDING")} disabled={disabled}>
        <SelectTrigger id={id}><span>{options[value] ?? value}</span></SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, text]) => <SelectItem key={k} value={k}>{text}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  categories: any[];
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  accounts: AccountOpt[];
  defaultUsdRate: number;
  isAdmin: boolean;
  initialData?: any;
  prefill?: any; // a new entry started from a bank statement line, or re-entered after a reversal
  bankLine?: { id: string; label: string };
  correction?: { id: string; label: string }; // the reversed posted entry this one replaces
  costItem?: { id: string; label: string }; // the cost register receipt this expense records
  locked?: boolean; // posted: only evidence, tax review and new attachments can change
}) {
  const router = useRouter();
  const init = initialData ?? prefill;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">(init?.type || "EXPENSE");
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

  const [attachments, setAttachments] = useState<any[]>(init?.attachments || []);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Files chosen but not yet saved. We own this list (the native input only
  // keeps its last selection), so picking "Add more files" twice accumulates.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  function handleFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    const problem = uploadProblem([...pendingFiles, ...chosen]);
    if (problem) alert(problem);
    else if (chosen.length) setPendingFiles((prev) => [...prev, ...chosen]);
    e.target.value = ""; // let the same file be re-picked; state is the source of truth
  }

  function removePendingFile(idx: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleRemoveAttachment(id: string) {
    if (!confirm("Remove this receipt? This deletes the file.")) return;
    setRemovingId(id);
    try {
      const res = await deleteAttachment(id);
      if (!res.success) { alert(res.message); return; }
      setAttachments((prev) => prev.filter((a) => a.id !== id));
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

      if (res.success) {
        router.push(bankLine ? "/bank" : costItem ? "/costs" : "/ledger");
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  const defaultDate = init?.date 
    ? new Date(init.date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-6">
          {bankLine && (
            <p className="text-sm rounded-md border p-3 bg-muted/30">
              From bank line <span className="font-medium">{bankLine.label}</span> — saving matches this entry to it.
            </p>
          )}
          {costItem && (
            <p className="text-sm rounded-md border p-3 bg-muted/30">
              From the cost register: <span className="font-medium">{costItem.label}</span> — saving adds it to the ledger once, with its receipt.
            </p>
          )}
          {correction && (
            <p className="text-sm rounded-md border p-3 bg-muted/30">
              Correcting <span className="font-medium">{correction.label}</span>, which has been reversed — enter the right values. Saving records this as its correction.
            </p>
          )}
          {/* Type Toggle */}
          <fieldset disabled={locked} className="flex bg-muted p-1 rounded-lg min-w-0 border-0 m-0">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${type === "EXPENSE" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setType("EXPENSE");
                if (init?.type === "EXPENSE") setCategoryId(init?.categoryId || "");
                else setCategoryId("");
              }}
            >
              Expense
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${type === "INCOME" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setType("INCOME");
                if (init?.type === "INCOME") setCategoryId(init?.categoryId || "");
                else setCategoryId("");
              }}
            >
              Income
            </button>
          </fieldset>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Posted entries keep their money and classification. */}
            <fieldset disabled={locked} className="grid gap-6 md:grid-cols-2 md:col-span-2 min-w-0 border-0 p-0 m-0">
            <div className="space-y-2 md:col-span-2">
              <Label>{type === "INCOME" ? "Received into" : "Paid from"}</Label>
              <AccountSelect
                accounts={accounts.filter((a) => a.isActive || a.id === accountId)}
                value={accountId}
                onChange={chooseAccount}
                placeholder="Choose the account the money moved through"
              />
              <p className="text-xs text-muted-foreground">Bank, company cash, or Owner-paid if you paid it personally.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required defaultValue={defaultDate} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="flex bg-muted p-0.5 rounded text-xs font-medium cursor-pointer">
                  {CURRENCIES.map((c) => (
                    <span key={c} onClick={() => chooseCurrency(c)}
                      className={`px-2 py-0.5 rounded-sm transition-all ${currency === c ? "bg-white shadow-sm" : "text-muted-foreground"} ${usdAccount && c !== "USD" ? "opacity-40 cursor-not-allowed" : ""}`}>{c}</span>
                  ))}
                </div>
              </div>
              <Input id="amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" defaultValue={init?.amount} />
            </div>

            {currency !== "VND" && (
              <div className="space-y-2 md:col-span-2 rounded-md border p-3 bg-muted/30">
                <Label>VND value</Label>
                <div className="flex bg-muted p-0.5 rounded text-xs font-medium w-fit">
                  {([["BANK", "Actual VND settled"], ["MANUAL", "Enter rate"], ...(currency === "USD" ? [["DEFAULT", `Default (${new Intl.NumberFormat("vi-VN").format(defaultUsdRate)})`]] : [])] as [ "BANK" | "MANUAL" | "DEFAULT", string][]).map(([m, label]) => (
                    <button key={m} type="button" onClick={() => setRateMode(m)}
                      className={`px-2 py-1 rounded-sm ${rateMode === m ? "bg-white shadow-sm" : "text-muted-foreground"}`}>{label}</button>
                  ))}
                </div>
                {rateMode === "BANK" && (
                  <Input name="vndAmount" type="number" step="1" min="0" required placeholder="VND exactly as on the bank statement"
                    defaultValue={init?.vndAmount ?? ""} />
                )}
                {rateMode === "MANUAL" && (
                  <Input name="rate" type="number" step="any" min="0" required placeholder={`VND per ${currency}`}
                    defaultValue={init?.rateSource === "MANUAL" ? init.exchangeRate : ""} />
                )}
                <p className="text-xs text-muted-foreground">
                  {rateMode === "BANK" ? "Most accurate — the rate is worked out from what the bank actually settled."
                    : rateMode === "MANUAL" ? "Use the rate on the receipt or the bank's rate for that day."
                    : "Only an estimate — switch to the bank figure when you have the statement."}
                </p>
              </div>
            )}

            <div className={`space-y-2 md:col-span-2`}>
              <Label htmlFor="categoryId">Category</Label>
              <Select value={categoryId} onValueChange={(val) => setCategoryId(val || "")} required>
                <SelectTrigger id="categoryId">
                  {selectedCategory ? (
                    <span className="flex-1 text-left">{selectedCategory.name}</span>
                  ) : (
                    <span className="flex-1 text-left text-muted-foreground">Select a category</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {filteredCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                  {filteredCategories.length === 0 && <SelectItem value="none" disabled>No categories available</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="projectId">Project (Optional)</Label>
              <Select value={projectId} onValueChange={(val) => setProjectId(val === "none" ? "" : (val || ""))}>
                <SelectTrigger id="projectId">
                  {projectId
                    ? <span className="flex-1 text-left">{projects.find(p => p.id === projectId)?.name || "Unknown"}</span>
                    : <span className="flex-1 text-left text-muted-foreground">No project</span>}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                  {projects.length === 0 && <SelectItem value="empty" disabled>No projects yet</SelectItem>}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Tag this entry to a project for per-project profit.</p>
            </div>

            {type === "EXPENSE" && (
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="vendorId">Vendor (Optional)</Label>
                <Select value={vendorId} onValueChange={(val) => setVendorId(val === "none" ? "" : (val || ""))}>
                  <SelectTrigger id="vendorId">
                    {vendorId
                      ? <span className="flex-1 text-left">{vendors.find(v => v.id === vendorId)?.name || "Unknown"}</span>
                      : <span className="flex-1 text-left text-muted-foreground">No vendor</span>}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vendor</SelectItem>
                    {vendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                    {vendors.length === 0 && <SelectItem value="empty" disabled>No vendors yet</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Who you paid — for spend-per-vendor tracking.</p>
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="invoiceNumber">Invoice Number (Optional)</Label>
              <Input id="invoiceNumber" name="invoiceNumber" placeholder="e.g. INV-2026-001" defaultValue={init?.invoiceNumber || ""} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="What was this for?" required defaultValue={init?.description || ""} />
            </div>

            </fieldset>

            <div className="space-y-2 md:col-span-2">
              <Label>Attachments (Receipts / Invoices)</Label>

              {attachments.length > 0 && (
                <div className="space-y-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 bg-muted/50 p-2 rounded-md">
                      <a
                        href={`/api/uploads/${a.filePath.split('/').pop()}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 truncate"
                        title={a.fileName}
                      >
                        <Paperclip className="h-4 w-4 shrink-0" />
                        <span className="truncate">{a.fileName}</span>
                      </a>
                      {!locked && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                          disabled={removingId === a.id}
                          onClick={() => handleRemoveAttachment(a.id)}
                          title="Remove receipt"
                        >
                          {removingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="space-y-2">
                  {pendingFiles.map((f, idx) => (
                    <div key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 bg-primary/5 border border-primary/20 p-2 rounded-md">
                      <span className="flex items-center gap-2 text-sm text-foreground truncate" title={f.name}>
                        <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">· to upload</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => removePendingFile(idx)}
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex justify-center rounded-lg border border-dashed border-border px-6 py-10 hover:bg-muted/50 transition-colors">
                <div className="text-center">
                  <UploadCloud className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
                  <div className="mt-4 flex text-sm leading-6 text-muted-foreground justify-center">
                    <label
                      htmlFor="files"
                      className="relative cursor-pointer rounded-md font-semibold text-primary focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 hover:text-primary/80"
                    >
                      <span>{isEdit ? "Add more files" : "Upload files"}</span>
                      <input id="files" name="files" type="file" multiple className="sr-only" accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed" onChange={handleFilesChosen} />
                    </label>
                    <p className="pl-1">or take a photo</p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground mt-2">PNG, JPG, PDF, ZIP (e.g. original e-invoice) — up to 10 MB per save</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 md:col-span-2 rounded-md border p-3 bg-muted/30">
              <div>
                <Label>Evidence &amp; tax review</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {type === "EXPENSE"
                    ? "Kept apart from the books: recording an expense never makes it deductible or its VAT claimable — each stays pending until reviewed."
                    : "Kept apart from the books: a payment received doesn't establish its invoice."}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <StatusSelect id="docStatus" label="Document" options={DOC_STATUS} value={docStatus} onChange={setDocStatus} />
                {type === "EXPENSE" && (
                  <>
                    <StatusSelect id="purposeStatus" label="Business purpose" options={PURPOSE_STATUS} value={purposeStatus} onChange={setPurposeStatus} disabled={!isAdmin} />
                    <StatusSelect id="citStatus" label="CIT deductibility" options={CIT_STATUS} value={citStatus} onChange={setCitStatus} disabled={!isAdmin} />
                    <StatusSelect id="vatStatus" label="Input VAT" options={VAT_STATUS} value={vatStatus} onChange={setVatStatus} disabled={!isAdmin} />
                    <div className="space-y-2">
                      <Label htmlFor="vatAmount">VAT on the invoice ({currency})</Label>
                      <Input id="vatAmount" name="vatAmount" type="number" step="any" min="0" placeholder="As printed — blank if none" defaultValue={init?.vatAmount ?? ""} />
                    </div>
                  </>
                )}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="reviewNote">Review notes</Label>
                  <Input id="reviewNote" name="reviewNote" placeholder="Purpose evidence, the accountant's basis, open questions" defaultValue={init?.reviewNote || ""} />
                </div>
              </div>
              {type === "EXPENSE" && !isAdmin && (
                <p className="text-xs text-muted-foreground">Business purpose, CIT and VAT are recorded by the owner after the accountant&apos;s review.</p>
              )}
            </div>
          </div>

          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="reason">Reason for the change (optional)</Label>
              <Input id="reason" name="reason" placeholder="Kept in the entry's history" />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              locked ? "Save review" : isEdit ? "Update Transaction" : "Save Transaction"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
