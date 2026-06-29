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

export function EntryForm({
  categories,
  projects = [],
  vendors = [],
  defaultUsdRate,
  initialData
}: {
  categories: any[];
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  defaultUsdRate: number;
  initialData?: any;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [type, setType] = useState<"INCOME" | "EXPENSE">(initialData?.type || "EXPENSE");
  const [currency, setCurrency] = useState<"VND" | "USD">(initialData?.currency || "VND");
  const [projectId, setProjectId] = useState<string>(initialData?.projectId || "");
  const [vendorId, setVendorId] = useState<string>(initialData?.vendorId || "");

  const filteredCategories = categories.filter((c) => c.type === type);

  const isEdit = !!initialData;
  
  const [categoryId, setCategoryId] = useState<string>(
    initialData?.type === type ? (initialData?.categoryId || "") : ""
  );

  const selectedCategory = categories.find(c => c.id === categoryId);

  const [attachments, setAttachments] = useState<any[]>(initialData?.attachments || []);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemoveAttachment(id: string) {
    if (!confirm("Remove this receipt? This deletes the file.")) return;
    setRemovingId(id);
    try {
      await deleteAttachment(id);
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

    try {
      let res;
      if (isEdit) {
        res = await editTransaction(initialData.id, formData);
      } else {
        res = await createTransaction(formData);
      }

      if (res.success) {
        router.push("/ledger");
      } else {
        alert(res.message);
      }
    } catch (err) {
      alert("Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  const defaultDate = initialData?.date 
    ? new Date(initialData.date).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-6">
          {/* Type Toggle */}
          <div className="flex bg-muted p-1 rounded-lg">
            <button
              type="button"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${type === "EXPENSE" ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => {
                setType("EXPENSE");
                if (initialData?.type === "EXPENSE") setCategoryId(initialData?.categoryId || "");
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
                if (initialData?.type === "INCOME") setCategoryId(initialData?.categoryId || "");
                else setCategoryId("");
              }}
            >
              Income
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required defaultValue={defaultDate} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-2">
                <Label htmlFor="amount">Amount</Label>
                <div className="flex bg-muted p-0.5 rounded text-xs font-medium cursor-pointer">
                  <span onClick={() => setCurrency("VND")} className={`px-2 py-0.5 rounded-sm transition-all ${currency === "VND" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>VND</span>
                  <span onClick={() => setCurrency("USD")} className={`px-2 py-0.5 rounded-sm transition-all ${currency === "USD" ? "bg-white shadow-sm" : "text-muted-foreground"}`}>USD</span>
                </div>
              </div>
              <Input id="amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" defaultValue={initialData?.amount} />
            </div>

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
              <Input id="invoiceNumber" name="invoiceNumber" placeholder="e.g. INV-2026-001" defaultValue={initialData?.invoiceNumber || ""} />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" name="description" placeholder="What was this for?" required defaultValue={initialData?.description || ""} />
            </div>

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
                      <input id="files" name="files" type="file" multiple className="sr-only" accept="image/*,application/pdf,.zip,application/zip,application/x-zip-compressed" />
                    </label>
                    <p className="pl-1">or take a photo</p>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground mt-2">PNG, JPG, PDF, ZIP (e.g. original e-invoice) up to 10MB</p>
                </div>
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              isEdit ? "Update Transaction" : "Save Transaction"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
