"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { addProjectDocument } from "@/app/actions/projects";
import { deleteAttachment } from "@/app/actions/ledger";
import { uploadProblem } from "@/lib/upload-limit";
import { notify, notifyResult } from "@/components/ui/toast";

type Doc = { id: string; fileName: string; filePath: string; createdAt: string };

export function ProjectDocuments({ projectId, documents }: { projectId: string; documents: Doc[] }) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!(fd.getAll("files") as File[]).some((f) => f && f.size > 0)) return;
    const tooBig = uploadProblem(fd.getAll("files") as File[], tc);
    if (tooBig) { notify.error(tooBig); return; }
    setUploading(true);
    try {
      const res = await addProjectDocument(projectId, fd);
      if (res.success) {
        const n = (fd.getAll("files") as File[]).filter((f) => f && f.size > 0).length;
        notify.success(t("toast.documentsUploaded", { count: n }));
      } else notify.error(res.message || t("documents.couldNotUpload"));
      form.reset();
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("documents.confirmRemove"))) return;
    setRemovingId(id);
    try {
      const res = await deleteAttachment(id);
      notifyResult(res, t("toast.documentRemoved"), t("documents.couldNotRemove"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally { setRemovingId(null); }
  }

  return (
    <>
      {documents.length > 0 && (
        <ul className="wf-rows border-b border-border">
          {documents.map((d) => (
            <li key={d.id}>
              <a href={`/api/uploads/${d.filePath.split("/").pop()}`} target="_blank" rel="noreferrer"
                className="flex min-w-0 items-center gap-3 text-foreground transition-colors duration-150 hover:text-primary" title={d.fileName}>
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate">{d.fileName}</span>
                <span className="wf-num shrink-0 text-[12px] text-muted-foreground">{d.createdAt}</span>
              </a>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                disabled={removingId === d.id} onClick={() => remove(d.id)} title={tc("actions.remove")} aria-label={`${tc("actions.remove")} ${d.fileName}`}>
                {removingId === d.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onUpload} className="grid gap-2 p-5">
        <Label htmlFor="files"><UploadCloud className="size-4 text-muted-foreground" aria-hidden="true" />{t("documents.add")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" className="min-w-[220px] flex-1" />
          <Button type="submit" variant="outline" disabled={uploading}>
            {uploading && <Loader2 className="animate-spin" aria-hidden="true" />}
            {t("documents.upload")}
          </Button>
        </div>
        <p className="text-[12px] text-muted-foreground">{t("documents.hint")}</p>
      </form>
    </>
  );
}
