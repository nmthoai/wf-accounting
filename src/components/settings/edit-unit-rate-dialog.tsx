"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { notify } from "@/components/ui/toast";

type UnitRate = { id: string; description: string; rate: number; unit: string };

export function EditUnitRateDialog({
  unitRate,
  action,
}: {
  unitRate: UnitRate;
  action: (id: string, formData: FormData) => Promise<{ success: boolean; message?: string }>;
}) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [unit, setUnit] = useState(unitRate.unit);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    fd.set("unit", unit);
    try {
      const res = await action(unitRate.id, fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      setOpen(false);
      notify.success(t("unitRates.toast.saved"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  const unitLabel: Record<string, string> = { hours: t("unitRates.units.hours"), project: t("unitRates.units.project"), manday: t("unitRates.units.manday") };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={tc("actions.edit")} />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("unitRates.editTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor={`ud-${unitRate.id}`}>{t("fields.description")}</Label>
            <Input id={`ud-${unitRate.id}`} name="description" defaultValue={unitRate.description} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`ur-${unitRate.id}`}>{t("fields.rate")}</Label>
              <Input id={`ur-${unitRate.id}`} name="rate" type="number" step="0.01" min="0" defaultValue={unitRate.rate} required />
            </div>
            <div className="space-y-2">
              <Label>{t("fields.unit")}</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v || "hours")}>
                <SelectTrigger><span>{unitLabel[unit] || unit}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours">{t("unitRates.units.hours")}</SelectItem>
                  <SelectItem value="project">{t("unitRates.units.project")}</SelectItem>
                  <SelectItem value="manday">{t("unitRates.units.manday")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("saveChanges")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
