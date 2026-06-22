"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { addProjectDocument } from "@/app/actions/projects";
import { deleteAttachment } from "@/app/actions/ledger";

type Doc = { id: string; fileName: string; filePath: string; createdAt: string };

export function ProjectDocuments({ projectId, documents }: { projectId: string; documents: Doc[] }) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function onUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!(fd.getAll("files") as File[]).some((f) => f && f.size > 0)) return;
    setUploading(true);
    try {
      await addProjectDocument(projectId, fd);
      form.reset();
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this document? This deletes the file.")) return;
    setRemovingId(id);
    try { await deleteAttachment(id); router.refresh(); } finally { setRemovingId(null); }
  }

  return (
    <div className="space-y-4">
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
              <a href={`/api/uploads/${d.filePath.split("/").pop()}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 truncate" title={d.fileName}>
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.fileName}</span>
                <span className="text-xs text-muted-foreground shrink-0">· {d.createdAt}</span>
              </a>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                disabled={removingId === d.id} onClick={() => remove(d.id)} title="Remove">
                {removingId === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={onUpload} className="flex items-end gap-3 flex-wrap">
        <div className="space-y-2 flex-1 min-w-[220px]">
          <Label htmlFor="files" className="flex items-center gap-2"><UploadCloud className="h-4 w-4" /> Add document(s)</Label>
          <Input id="files" name="files" type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" />
        </div>
        <Button type="submit" disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upload"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">PDF, Word, Excel or images. Stored privately — only viewable while signed in.</p>
    </div>
  );
}
