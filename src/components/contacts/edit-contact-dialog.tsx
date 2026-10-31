"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CircleAlert, Pencil, Loader2 } from "lucide-react";
import { notify } from "@/components/ui/toast";

type Contact = { id: string; name: string; email: string | null; phone: string | null };

export function EditContactDialog({
  contact,
  kind,
  action,
}: {
  contact: Contact;
  kind: "client" | "vendor";
  action: (id: string, formData: FormData) => Promise<{ success: boolean; message?: string }>;
}) {
  const router = useRouter();
  const t = useTranslations("contacts");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErr("");
    try {
      const res = await action(contact.id, new FormData(e.currentTarget));
      if (!res.success) { setErr(res.message || tc("errors.couldNotSave")); return; }
      notify.success(kind === "client" ? t("toast.clientUpdated") : t("toast.vendorUpdated"));
      setOpen(false);
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" aria-label={tc("actions.edit")} title={tc("actions.edit")} />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{kind === "client" ? t("edit.clientTitle") : t("edit.vendorTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`n-${contact.id}`}>{t("form.name")}</Label>
            <Input id={`n-${contact.id}`} name="name" defaultValue={contact.name} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`e-${contact.id}`}>{t("form.email")}</Label>
            <Input id={`e-${contact.id}`} name="email" type="email" defaultValue={contact.email ?? ""} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`p-${contact.id}`}>{t("form.phone")}</Label>
            <Input id={`p-${contact.id}`} name="phone" type="tel" defaultValue={contact.phone ?? ""} placeholder="+84 …" />
          </div>
          {err && (
            <p className="flex items-center gap-1.5 text-[12px] text-destructive" role="alert">
              <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{err}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}{t("edit.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
