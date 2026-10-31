"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2, CircleAlert } from "lucide-react";
import { notify, notifyFailure } from "@/components/ui/toast";

type Category = { id: string; name: string; type: string; description: string | null };

export function EditCategoryDialog({
  category,
  action,
}: {
  category: Category;
  action: (id: string, formData: FormData) => Promise<{ success: boolean; message?: string }>;
}) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [type, setType] = useState(category.type);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    try {
      const res = await action(category.id, fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      setOpen(false);
      notify.success(t("categories.toast.saved"));
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setSaving(false);
    }
  }

  const typeLabel: Record<string, string> = { INCOME: tc("type.INCOME"), EXPENSE: tc("type.EXPENSE") };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" title={tc("actions.edit")} aria-label={tc("actions.edit")} />}>
        <Pencil aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("categories.editTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`cn-${category.id}`}>{t("fields.name")}</Label>
            <Input id={`cn-${category.id}`} name="name" defaultValue={category.name} required />
          </div>
          <div className="grid gap-2">
            <Label>{t("fields.type")}</Label>
            <Select value={type} onValueChange={(v) => setType(v || "EXPENSE")}>
              <SelectTrigger className="w-full"><span>{typeLabel[type] || type}</span></SelectTrigger>
              <SelectContent>
                <SelectItem value="INCOME">{tc("type.INCOME")}</SelectItem>
                <SelectItem value="EXPENSE">{tc("type.EXPENSE")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`cd-${category.id}`}>{t("fields.description")}</Label>
            <Input id={`cd-${category.id}`} name="description" defaultValue={category.description ?? ""} placeholder={t("categories.descriptionPlaceholder")} />
          </div>
          {err && (
            <p role="alert" className="flex items-center gap-1.5 text-[12px] text-destructive">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("saveChanges")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
