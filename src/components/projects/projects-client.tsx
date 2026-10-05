"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Trash2, Loader2, FolderPlus, Paperclip } from "lucide-react";
import { createProject, deleteProject, setProjectStatus } from "@/app/actions/projects";
import { notify } from "@/components/ui/toast";

type ProjectRow = {
  id: string; name: string; status: string; clientId: string | null; clientName: string | null;
  income: number; expense: number; net: number; txnCount: number;
  openCount: number; openLabel: string; attachmentCount: number;
};
type ClientOpt = { id: string; name: string };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function ProjectsClient({ projects, clients }: { projects: ProjectRow[]; clients: ClientOpt[] }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const [addingProject, setAddingProject] = useState(false);
  const [projectClientId, setProjectClientId] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string, detail?: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) notify.success(done, detail);
      else if (res.message) notify.error(res.message);
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddingProject(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("clientId", projectClientId);
    try {
      const res = await createProject(fd);
      if (!res.success) { setErr(res.message || t("errors.couldNotCreate")); return; }
      notify.success(t("toast.created"), (fd.get("name") as string).trim());
      form.reset();
      setProjectClientId("");
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setAddingProject(false);
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      NOT_STARTED: "bg-slate-100 text-slate-600",
      ACTIVE: "bg-green-100 text-green-700",
      PENDING: "bg-amber-100 text-amber-700",
      DONE: "bg-blue-100 text-blue-700",
      ARCHIVED: "bg-gray-200 text-gray-600",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || ""}`}>{t.has(`status.${s}`) ? t(`status.${s}`) : s}</span>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("list.title")}</CardTitle>
        <CardDescription>{t("list.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAddProject} className="flex gap-3 items-end flex-wrap">
          <div className="space-y-2 flex-1 min-w-[160px]">
            <Label htmlFor="name">{t("list.newProject")}</Label>
            <Input id="name" name="name" placeholder={t("list.namePlaceholder")} required />
          </div>
          <div className="space-y-2 w-44">
            <Label>{t("list.client")}</Label>
            <Select value={projectClientId} onValueChange={(v) => setProjectClientId(v === "none" ? "" : v || "")}>
              <SelectTrigger>
                {projectClientId ? <span>{clients.find(c => c.id === projectClientId)?.name}</span> : <span className="text-muted-foreground">{t("noClient")}</span>}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noClient")}</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={addingProject} className="gap-2">
            {addingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} {tc("actions.add")}
          </Button>
        </form>
        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md flex-wrap">
              <div className="flex flex-col min-w-[140px]">
                <Link href={`/projects/${p.id}`} className="text-sm font-medium flex items-center gap-2 hover:text-primary hover:underline">
                  {p.name} {statusBadge(p.status)}
                  {p.openCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700" title={t("list.unpaidTitle", { count: p.openCount, amounts: p.openLabel })}>
                      {t("list.unpaid", { count: p.openCount })}
                    </span>
                  )}
                  {p.attachmentCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600" title={t("list.attachmentsTitle", { count: p.attachmentCount })}>
                      <Paperclip className="h-3 w-3" /> {p.attachmentCount}
                    </span>
                  )}
                </Link>
                <span className="text-xs text-muted-foreground">{p.clientName || t("noClient")} · {t("list.txnCount", { count: p.txnCount })}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-green-600">{vnd(p.income)}</span>
                <span className="text-red-600">−{vnd(p.expense)}</span>
                <span className={`font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{vnd(p.net)}</span>
                {p.status !== "ARCHIVED" ? (
                  <Button variant="outline" size="sm" className="h-8" disabled={busyId === p.id}
                    onClick={() => run(p.id, () => setProjectStatus(p.id, "ARCHIVED"), t("toast.archived"), p.name)}>
                    {t("list.archive")}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="h-8" disabled={busyId === p.id}
                    onClick={() => run(p.id, () => setProjectStatus(p.id, "ACTIVE"), t("toast.reactivated"), p.name)}>
                    {t("list.reactivate")}
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === p.id}
                  onClick={() => { if (confirm(t("list.confirmDelete", { name: p.name }))) run(p.id, () => deleteProject(p.id), t("toast.deleted"), p.name); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="text-sm text-muted-foreground">{t("list.empty")}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
