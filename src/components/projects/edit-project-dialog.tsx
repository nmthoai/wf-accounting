"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2, CircleAlert } from "lucide-react";
import { updateProject } from "@/app/actions/projects";
import { notify, notifyFailure } from "@/components/ui/toast";

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
  // Only a hint: the browser won't offer an end date before the start; the server checks too.
  const [startDate, setStartDate] = useState(project.startDate ?? "");

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
      notifyFailure();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setStartDate(project.startDate ?? ""); }}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Pencil aria-hidden="true" />{tc("actions.edit")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("edit.title")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="name">{t("edit.name")}</Label>
            <Input id="name" name="name" defaultValue={project.name} required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="ep-client">{t("edit.client")}</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v === "none" ? "" : v || "")}>
                <SelectTrigger id="ep-client" className="w-full">{clientId ? <span className="truncate">{clients.find(c => c.id === clientId)?.name}</span> : <span className="text-muted-foreground">{t("noClient")}</span>}</SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noClient")}</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ep-status">{t("edit.status")}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v || "ACTIVE")}>
                <SelectTrigger id="ep-status" className="w-full"><span>{t.has(`status.${status}`) ? t(`status.${status}`) : status}</span></SelectTrigger>
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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="startDate">{t("edit.startDate")}</Label>
              <Input id="startDate" name="startDate" type="date" defaultValue={project.startDate ?? ""} onChange={(e) => setStartDate(e.target.value)} className="wf-num" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="endDate">{t("edit.endDate")}</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={project.endDate ?? ""} min={startDate || undefined} className="wf-num" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">{t("edit.description")}</Label>
            <textarea id="description" name="description" defaultValue={project.description ?? ""} rows={3}
              className="w-full min-w-0 rounded-lg border border-input bg-card px-3 py-2 text-[15px] text-foreground transition-colors duration-150 ease-wf outline-none placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              placeholder={t("edit.descriptionPlaceholder")} />
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t("edit.saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
