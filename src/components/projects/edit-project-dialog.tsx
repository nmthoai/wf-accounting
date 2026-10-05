"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
import { updateProject } from "@/app/actions/projects";
import { notify } from "@/components/ui/toast";

type Project = {
  id: string; name: string; clientId: string | null; status: string;
  description: string | null; startDate: string | null; endDate: string | null;
};

export function EditProjectDialog({ project, clients }: { project: Project; clients: { id: string; name: string }[] }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [clientId, setClientId] = useState(project.clientId ?? "");
  const [status, setStatus] = useState(project.status);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    fd.set("clientId", clientId);
    fd.set("status", status);
    try {
      const res = await updateProject(project.id, fd);
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      setOpen(false);
      notify.success(t("toast.saved"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
        <Pencil className="h-4 w-4" /> {tc("actions.edit")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("edit.title")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t("edit.name")}</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("edit.client")}</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v === "none" ? "" : v || "")}>
                <SelectTrigger>{clientId ? <span>{clients.find(c => c.id === clientId)?.name}</span> : <span className="text-muted-foreground">{t("noClient")}</span>}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noClient")}</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("edit.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v || "ACTIVE")}>
                <SelectTrigger><span>{t.has(`status.${status}`) ? t(`status.${status}`) : status}</span></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOT_STARTED">{t("status.NOT_STARTED")}</SelectItem>
                  <SelectItem value="ACTIVE">{t("status.ACTIVE")}</SelectItem>
                  <SelectItem value="PENDING">{t("status.PENDING")}</SelectItem>
                  <SelectItem value="DONE">{t("status.DONE")}</SelectItem>
                  <SelectItem value="ARCHIVED">{t("status.ARCHIVED")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t("edit.startDate")}</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={project.startDate ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{t("edit.endDate")}</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={project.endDate ?? ""} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t("edit.description")}</Label>
            <textarea id="description" name="description" defaultValue={project.description ?? ""} rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t("edit.descriptionPlaceholder")} />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("edit.saveChanges")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
