"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, KeyRound, ShieldOff, UserPlus, Loader2, LockOpen } from "lucide-react";
import { createUser, deleteUser, setUserActive, resetUserPassword, resetUser2FA, unlockUser } from "@/app/actions/users";
import { notify, notifyResult } from "@/components/ui/toast";

type ManagedUser = {
  id: string;
  username: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
};

export function UserManagement({ users, currentUserId }: { users: ManagedUser[]; currentUserId: string }) {
  const router = useRouter();
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    const form = e.currentTarget;
    try {
      const data = new FormData(form);
      const res = await createUser(data);
      if (!res.success) {
        setAddError(res.message || t("users.toast.couldNotCreate"));
        return;
      }
      notify.success(t("users.toast.created"), (data.get("username") as string)?.trim());
      form.reset();
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setAdding(false);
    }
  }

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string) {
    setBusyId(id);
    try {
      const res = await fn();
      notifyResult(res, done, t("users.toast.couldNotUpdate"));
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setBusyId(null);
    }
  }

  function statusBadge(u: ManagedUser) {
    if (u.locked)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{t("users.status.locked")}</span>;
    if (!u.isActive)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">{t("users.status.deactivated")}</span>;
    if (u.mustChangePassword || !u.twoFactorEnabled)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{t("users.status.onboarding")}</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{t("users.status.active")}</span>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("users.title")}</CardTitle>
        <CardDescription>{t("users.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAdd} className="flex gap-3 items-end flex-wrap">
          <div className="space-y-2 flex-1 min-w-[140px]">
            <Label htmlFor="username">{t("users.username")}</Label>
            <Input id="username" name="username" placeholder={t("users.usernamePlaceholder")} required />
          </div>
          <div className="space-y-2 flex-1 min-w-[140px]">
            <Label htmlFor="password">{t("users.defaultPassword")}</Label>
            <Input id="password" name="password" type="text" placeholder={t("users.passwordPlaceholder")} required />
          </div>
          <div className="space-y-2 w-28">
            <Label htmlFor="role">{t("users.role")}</Label>
            <Select name="role" defaultValue="USER" items={[{ value: "USER", label: t("users.roles.USER") }, { value: "ADMIN", label: t("users.roles.ADMIN") }]}>
              <SelectTrigger id="role">
                <SelectValue placeholder={t("users.role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">{t("users.roles.USER")}</SelectItem>
                <SelectItem value="ADMIN">{t("users.roles.ADMIN")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            {tc("actions.add")}
          </Button>
        </form>
        {addError && <p className="text-sm text-destructive">{addError}</p>}

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md flex-wrap">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {u.username}
                  {u.id === currentUserId && <span className="text-xs text-muted-foreground"> {t("users.you")}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{u.role === "ADMIN" ? t("users.roles.ADMIN") : t("users.roles.USER")}</span>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(u)}

                {/* Unlock (only when locked out) */}
                {u.locked && (
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-amber-700" disabled={busyId === u.id}
                    onClick={() => run(u.id, () => unlockUser(u.id), t("users.toast.unlocked", { username: u.username }))}>
                    <LockOpen className="h-3.5 w-3.5" /> {t("users.unlock")}
                  </Button>
                )}

                {/* Reset password */}
                <Dialog>
                  <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={t("users.resetPassword.button")} />}>
                    <KeyRound className="h-4 w-4" />
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("users.resetPassword.title", { username: u.username })}</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        await run(u.id, () => resetUserPassword(u.id, fd), t("users.toast.passwordReset", { username: u.username }));
                      }}
                      className="space-y-4 pt-2"
                    >
                      <p className="text-sm text-muted-foreground">
                        {t("users.resetPassword.intro", { username: u.username })}
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`pw-${u.id}`}>{t("users.resetPassword.newLabel")}</Label>
                        <Input id={`pw-${u.id}`} name="password" type="text" placeholder={t("users.passwordPlaceholder")} required minLength={8} />
                      </div>
                      <Button type="submit" className="w-full">{t("users.resetPassword.submit")}</Button>
                    </form>
                  </DialogContent>
                </Dialog>

                {/* Reset 2FA */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                  title={t("users.reset2fa.button")}
                  disabled={busyId === u.id}
                  onClick={() => {
                    if (confirm(t("users.reset2fa.confirm", { username: u.username })))
                      run(u.id, () => resetUser2FA(u.id), t("users.toast.twoFactorReset", { username: u.username }));
                  }}
                >
                  <ShieldOff className="h-4 w-4" />
                </Button>

                {/* Activate / Deactivate */}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={busyId === u.id}
                  onClick={() => run(u.id, () => setUserActive(u.id, !u.isActive), u.isActive ? t("users.toast.deactivated", { username: u.username }) : t("users.toast.activated", { username: u.username }))}
                >
                  {u.isActive ? t("users.deactivate") : t("users.activate")}
                </Button>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  title={t("users.delete.button")}
                  disabled={busyId === u.id}
                  onClick={() => {
                    if (confirm(t("users.delete.confirm", { username: u.username })))
                      run(u.id, () => deleteUser(u.id), t("users.toast.deleted", { username: u.username }));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
