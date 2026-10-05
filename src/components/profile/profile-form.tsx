"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify, notifyResult } from "@/components/ui/toast";
import { updateProfile } from "@/app/actions/profile";

export function ProfileForm({ displayName }: { displayName: string }) {
  const t = useTranslations("profile");
  const tc = useTranslations("common");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      notifyResult(await updateProfile(new FormData(e.currentTarget)), t("toast.saved"));
    } catch {
      notify.error(t("toast.connectionError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="displayName">{t("form.displayName")}</Label>
        <Input key={displayName} id="displayName" name="displayName" defaultValue={displayName} maxLength={60} placeholder={t("form.displayNamePlaceholder")} autoComplete="name" />
      </div>
      <Button type="submit" disabled={saving} className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        {tc("actions.save")}
      </Button>
    </form>
  );
}
