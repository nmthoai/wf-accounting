"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, KeyRound, ShieldOff, UserPlus, Loader2, LockOpen, CircleAlert } from "lucide-react";
import { createUser, deleteUser, setUserActive, resetUserPassword, resetUser2FA, unlockUser } from "@/app/actions/users";
import { notify, notifyResult } from "@/components/ui/toast";
import { Chip, PanelHead } from "@/components/wf/ledger-ui";

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
    if (u.locked) return <Chip tone="neg" mono dot>{t("users.status.locked")}</Chip>;
    if (!u.isActive) return <Chip tone="neutral" mono dot>{t("users.status.deactivated")}</Chip>;
    if (u.mustChangePassword || !u.twoFactorEnabled) return <Chip tone="warn" mono dot>{t("users.status.onboarding")}</Chip>;
    return <Chip tone="pos" mono dot>{t("users.status.active")}</Chip>;
  }

  return (
    <Card>
      <PanelHead title={t("users.title")} count={users.length} />
      <CardContent className="grid gap-4 border-b border-border">
        <p className="text-[13px] text-muted-foreground">{t("users.description")}</p>
        <form onSubmit={handleAdd} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_9rem_auto] lg:items-end">
          <div className="grid gap-2">
            <Label htmlFor="username">{t("users.username")}</Label>
            <Input id="username" name="username" placeholder={t("users.usernamePlaceholder")} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">{t("users.defaultPassword")}</Label>
            <Input id="password" name="password" type="text" placeholder={t("users.passwordPlaceholder")} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role">{t("users.role")}</Label>
            <Select name="role" defaultValue="USER" items={[{ value: "USER", label: t("users.roles.USER") }, { value: "ADMIN", label: t("users.roles.ADMIN") }]}>
              <SelectTrigger id="role" className="w-full">
                <SelectValue placeholder={t("users.role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">{t("users.roles.USER")}</SelectItem>
                <SelectItem value="ADMIN">{t("users.roles.ADMIN")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding} className="self-end justify-self-start">
            {adding ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
            {tc("actions.add")}
          </Button>
        </form>
        {addError && (
          <p role="alert" className="flex items-center gap-1.5 text-[12px] text-destructive">
            <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{addError}
          </p>
        )}
      </CardContent>

      <ul className="wf-rows">
        {users.map((u) => (
          <li key={u.id} className="flex-wrap">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-strong font-mono text-[11.5px] font-medium text-primary uppercase" aria-hidden="true">
                {u.username.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {u.username}
                  {u.id === currentUserId && <span className="font-normal text-muted-foreground"> {t("users.you")}</span>}
                </p>
                <p className="wf-label mt-1">{u.role === "ADMIN" ? t("users.roles.ADMIN") : t("users.roles.USER")}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1.5">{statusBadge(u)}</span>

              {/* Unlock (only when locked out) */}
              {u.locked && (
                <Button variant="outline" size="sm" disabled={busyId === u.id}
                  onClick={() => run(u.id, () => unlockUser(u.id), t("users.toast.unlocked", { username: u.username }))}>
                  <LockOpen aria-hidden="true" />{t("users.unlock")}
                </Button>
              )}

              {/* Reset password */}
              <Dialog>
                <DialogTrigger render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-primary" title={t("users.resetPassword.button")} aria-label={t("users.resetPassword.button")} />}>
                  <KeyRound aria-hidden="true" />
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
                    className="grid gap-4"
                  >
                    <p className="text-[13.5px] text-text-secondary">
                      {t("users.resetPassword.intro", { username: u.username })}
                    </p>
                    <div className="grid gap-2">
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
                size="icon-sm"
                className="text-muted-foreground hover:text-warn"
                title={t("users.reset2fa.button")}
                aria-label={t("users.reset2fa.button")}
                disabled={busyId === u.id}
                onClick={() => {
                  if (confirm(t("users.reset2fa.confirm", { username: u.username })))
                    run(u.id, () => resetUser2FA(u.id), t("users.toast.twoFactorReset", { username: u.username }));
                }}
              >
                <ShieldOff aria-hidden="true" />
              </Button>

              {/* Activate / Deactivate */}
              <Button
                variant="outline"
                size="sm"
                disabled={busyId === u.id}
                onClick={() => run(u.id, () => setUserActive(u.id, !u.isActive), u.isActive ? t("users.toast.deactivated", { username: u.username }) : t("users.toast.activated", { username: u.username }))}
              >
                {u.isActive ? t("users.deactivate") : t("users.activate")}
              </Button>

              {/* Delete */}
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={t("users.delete.button")}
                aria-label={t("users.delete.button")}
                disabled={busyId === u.id}
                onClick={() => {
                  if (confirm(t("users.delete.confirm", { username: u.username })))
                    run(u.id, () => deleteUser(u.id), t("users.toast.deleted", { username: u.username }));
                }}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
