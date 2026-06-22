"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const t = useTranslations("Auth");
  const params = useSearchParams();
  const justOnboarded = params.get("onboarded") === "1";
  const timedOut = params.get("timeout") === "1";

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      // Posts straight to Auth.js's stable callback endpoint (no server action),
      // so a single attempt works reliably even right after sign-out / a deploy.
      const res = await signIn("credentials", {
        username: (fd.get("username") as string) ?? "",
        password: (fd.get("password") as string) ?? "",
        token: (fd.get("token") as string) ?? "",
        redirect: false,
        callbackUrl: "/",
      });
      if (!res || res.error) {
        setError("Invalid username, password, or 2FA code. (5 failed tries locks the account for 15 minutes.)");
        setLoading(false);
        return;
      }
      // Full navigation = clean dashboard load, no stale client state.
      window.location.href = res.url || "/";
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {justOnboarded && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700 text-center">
          Setup complete — sign in with your new password and 2FA code.
        </div>
      )}
      {timedOut && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700 text-center">
          Signed out due to inactivity. Please sign in again.
        </div>
      )}
      <div className="space-y-4">
        <div className="space-y-2 text-left">
          <Label htmlFor="username">{t("username")}</Label>
          <Input id="username" name="username" type="text" required className="bg-background/50" />
        </div>
        <div className="space-y-2 text-left">
          <Label htmlFor="password">{t("password")}</Label>
          <Input id="password" name="password" type="password" required className="bg-background/50" />
        </div>
        <div className="space-y-2 text-left">
          <Label htmlFor="token">{t("token")} <span className="text-muted-foreground font-normal">{t("tokenHint")}</span></Label>
          <Input id="token" name="token" type="text" inputMode="numeric" placeholder="123456" className="bg-background/50 tracking-widest text-lg" />
        </div>
      </div>
      <Button className="w-full py-6 text-md shadow-md" type="submit" disabled={loading}>
        {loading ? "..." : t("login")}
      </Button>
      {error && (
        <div className="text-sm text-destructive text-center font-medium">
          {error}
        </div>
      )}
    </form>
  );
}
