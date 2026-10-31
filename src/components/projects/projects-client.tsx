"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Loader2, FolderPlus, Paperclip, CircleAlert } from "lucide-react";
import { createProject, deleteProject, setProjectStatus } from "@/app/actions/projects";
import { notify, notifyFailure } from "@/components/ui/toast";
import { fmtMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Chip, PanelHead, PROJECT_STATUS_TONE } from "@/components/wf/ledger-ui";

type ProjectRow = {
  id: string; name: string; status: string; clientId: string | null; clientName: string | null;
  income: number; expense: number; net: number; txnCount: number;
  openCount: number; openLabel: string; attachmentCount: number;
};
type ClientOpt = { id: string; name: string };

// Income, expenses and net come in the viewer's summary currency.
export function ProjectsClient({ projects, clients, isAdmin, currency }: {
  projects: ProjectRow[]; clients: ClientOpt[];
  isAdmin: boolean; // deleting a project is the owner's decision
  currency: string;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const money = (n: number) => fmtMoney(n, currency);
  const [addingProject, setAddingProject] = useState(false);
  const [projectClientId, setProjectClientId] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string, detail?: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) notify.success(done, detail);
      else notifyFailure(res.message);
      router.refresh();
    } catch {
      notifyFailure();
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
      notifyFailure();
    } finally {
      setAddingProject(false);
    }
  }

  const statusChip = (s: string) => (
    <Chip tone={PROJECT_STATUS_TONE[s] ?? "neutral"} mono dot={s === "ACTIVE"}>
      {t.has(`status.${s}`) ? t(`status.${s}`) : s}
    </Chip>
  );

  return (
    <div className="grid gap-6">
      <Card>
        <PanelHead title={t("list.newProject")} />
        <CardContent>
          <form onSubmit={handleAddProject} className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto]">
            <div className="grid gap-2">
              <Label htmlFor="name">{t("list.name")}</Label>
              <Input id="name" name="name" placeholder={t("list.namePlaceholder")} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="np-client">{t("list.client")}</Label>
              <Select value={projectClientId} onValueChange={(v) => setProjectClientId(v === "none" ? "" : v || "")}>
                <SelectTrigger id="np-client" className="w-full">
                  {projectClientId ? <span className="truncate">{clients.find(c => c.id === projectClientId)?.name}</span> : <span className="text-muted-foreground">{t("noClient")}</span>}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noClient")}</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingProject}>
              {addingProject ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FolderPlus aria-hidden="true" />}
              {tc("actions.add")}
            </Button>
          </form>
          {err && (
            <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <PanelHead title={t("list.title")} count={projects.length} />
        <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("list.description")}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.columns.project")}</TableHead>
              <TableHead>{t("list.columns.client")}</TableHead>
              <TableHead className="text-right">{t("list.columns.income")}</TableHead>
              <TableHead className="text-right">{t("list.columns.expenses")}</TableHead>
              <TableHead className="text-right">{t("list.columns.net")}</TableHead>
              <TableHead><span className="sr-only">{t("list.columns.actions")}</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="py-3">
                  <Link href={`/projects/${p.id}`} className="block max-w-[12rem] truncate font-semibold text-foreground hover:text-primary" title={p.name}>{p.name}</Link>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {statusChip(p.status)}
                    {p.openCount > 0 && (
                      <Chip tone="warn" title={t("list.unpaidTitle", { count: p.openCount, amounts: p.openLabel })}>
                        {t("list.unpaid", { count: p.openCount })}
                      </Chip>
                    )}
                    {p.attachmentCount > 0 && (
                      <Chip title={t("list.attachmentsTitle", { count: p.attachmentCount })}>
                        <Paperclip className="size-3" aria-hidden="true" />
                        <span className="wf-num" aria-hidden="true">{p.attachmentCount}</span>
                        <span className="sr-only">{t("list.attachmentsTitle", { count: p.attachmentCount })}</span>
                      </Chip>
                    )}
                  </span>
                </TableCell>
                <TableCell className="py-3">
                  <span className={cn("block max-w-[10rem] truncate", p.clientName ? "text-foreground" : "text-muted-foreground")} title={p.clientName ?? undefined}>{p.clientName || t("noClient")}</span>
                  <span className="block text-[13.5px] text-muted-foreground">{t("list.txnCount", { count: p.txnCount })}</span>
                </TableCell>
                <TableCell className="text-right text-pos">{money(p.income)}</TableCell>
                <TableCell className="text-right">{p.expense ? "−" : ""}{money(p.expense)}</TableCell>
                <TableCell className={cn("text-right font-semibold", p.net >= 0 ? "text-primary" : "text-neg")}>{money(p.net)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {p.status !== "ARCHIVED" ? (
                      <Button variant="outline" size="sm" disabled={busyId === p.id}
                        onClick={() => run(p.id, () => setProjectStatus(p.id, "ARCHIVED"), t("toast.archived"), p.name)}>
                        {t("list.archive")}
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" disabled={busyId === p.id}
                        onClick={() => run(p.id, () => setProjectStatus(p.id, "ACTIVE"), t("toast.reactivated"), p.name)}>
                        {t("list.reactivate")}
                      </Button>
                    )}
                    {isAdmin && (
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive" disabled={busyId === p.id}
                        aria-label={t("list.deleteLabel", { name: p.name })}
                        onClick={() => { if (confirm(t("list.confirmDelete", { name: p.name }))) run(p.id, () => deleteProject(p.id), t("toast.deleted"), p.name); }}>
                        <Trash2 aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {projects.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t("list.empty")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
