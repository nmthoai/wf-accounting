"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, KeyRound, ShieldOff, UserPlus, Loader2, LockOpen } from "lucide-react";
import { createUser, deleteUser, setUserActive, resetUserPassword, resetUser2FA, unlockUser } from "@/app/actions/users";

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
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setAddError("");
    const form = e.currentTarget;
    try {
      const res = await createUser(new FormData(form));
      if (!res.success) {
        setAddError(res.message || "Could not create user.");
        return;
      }
      form.reset();
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try {
      const res = await fn();
      if (!res.success && res.message) alert(res.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  function statusBadge(u: ManagedUser) {
    if (u.locked)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Locked</span>;
    if (!u.isActive)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">Deactivated</span>;
    if (u.mustChangePassword || !u.twoFactorEnabled)
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Onboarding</span>;
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active · 2FA</span>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <CardDescription>Invite-only. New users get a default password and onboard themselves (change password + 2FA).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={handleAdd} className="flex gap-3 items-end flex-wrap">
          <div className="space-y-2 flex-1 min-w-[140px]">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" placeholder="e.g. accountant1" required />
          </div>
          <div className="space-y-2 flex-1 min-w-[140px]">
            <Label htmlFor="password">Default password</Label>
            <Input id="password" name="password" type="text" placeholder="share this with them" required />
          </div>
          <div className="space-y-2 w-28">
            <Label htmlFor="role">Role</Label>
            <Select name="role" defaultValue="USER">
              <SelectTrigger id="role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">Staff</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={adding} className="gap-2">
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Add
          </Button>
        </form>
        {addError && <p className="text-sm text-destructive">{addError}</p>}

        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md flex-wrap">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {u.username}
                  {u.id === currentUserId && <span className="text-xs text-muted-foreground"> (you)</span>}
                </span>
                <span className="text-xs text-muted-foreground">{u.role === "ADMIN" ? "Admin" : "Staff"}</span>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(u)}

                {/* Unlock (only when locked out) */}
                {u.locked && (
                  <Button variant="outline" size="sm" className="h-8 gap-1 text-amber-700" disabled={busyId === u.id}
                    onClick={() => run(u.id, () => unlockUser(u.id))}>
                    <LockOpen className="h-3.5 w-3.5" /> Unlock
                  </Button>
                )}

                {/* Reset password */}
                <Dialog>
                  <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Reset password" />}>
                    <KeyRound className="h-4 w-4" />
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Reset password for {u.username}</DialogTitle>
                    </DialogHeader>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        await run(u.id, () => resetUserPassword(u.id, fd));
                      }}
                      className="space-y-4 pt-2"
                    >
                      <p className="text-sm text-muted-foreground">
                        Sets a new default password. {u.username} will be forced to change it on next login.
                      </p>
                      <div className="space-y-2">
                        <Label htmlFor={`pw-${u.id}`}>New default password</Label>
                        <Input id={`pw-${u.id}`} name="password" type="text" placeholder="share this with them" required minLength={8} />
                      </div>
                      <Button type="submit" className="w-full">Set default password</Button>
                    </form>
                  </DialogContent>
                </Dialog>

                {/* Reset 2FA */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                  title="Reset 2FA"
                  disabled={busyId === u.id}
                  onClick={() => {
                    if (confirm(`Reset 2FA for ${u.username}? They'll re-enrol on next login.`))
                      run(u.id, () => resetUser2FA(u.id));
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
                  onClick={() => run(u.id, () => setUserActive(u.id, !u.isActive))}
                >
                  {u.isActive ? "Deactivate" : "Activate"}
                </Button>

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                  title="Delete user"
                  disabled={busyId === u.id}
                  onClick={() => {
                    if (confirm(`Delete ${u.username}? This cannot be undone.`))
                      run(u.id, () => deleteUser(u.id));
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
