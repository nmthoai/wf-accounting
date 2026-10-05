"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pencil, Loader2 } from "lucide-react";
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
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={tc("actions.edit")} />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{kind === "client" ? t("edit.clientTitle") : t("edit.vendorTitle")}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor={`n-${contact.id}`}>{t("form.name")}</Label>
            <Input id={`n-${contact.id}`} name="name" defaultValue={contact.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`e-${contact.id}`}>{t("form.email")}</Label>
            <Input id={`e-${contact.id}`} name="email" type="email" defaultValue={contact.email ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`p-${contact.id}`}>{t("form.phone")}</Label>
            <Input id={`p-${contact.id}`} name="phone" type="tel" defaultValue={contact.phone ?? ""} placeholder="+84 …" />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t("edit.save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
