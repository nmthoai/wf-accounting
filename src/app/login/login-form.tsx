"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/wf/ledger-ui";

export function LoginForm() {
  const t = useTranslations("auth");
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
        setError(t("loginForm.invalid"));
        setLoading(false);
        return;
      }
      // Full navigation = clean dashboard load, no stale client state.
      window.location.href = res.url || "/";
    } catch {
      setError(t("loginForm.failed"));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-7 grid gap-4">
      {justOnboarded && <Notice tone="success">{t("loginForm.onboarded")}</Notice>}
      {timedOut && <Notice tone="warning">{t("loginForm.timedOut")}</Notice>}
      <div className="grid gap-2">
        <Label htmlFor="username">{t("username")}</Label>
        <Input id="username" name="username" type="text" required className="h-11" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" required className="h-11" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="token">
          {t("token")} <span className="font-normal text-muted-foreground">{t("tokenHint")}</span>
        </Label>
        <Input
          id="token"
          name="token"
          type="text"
          inputMode="numeric"
          placeholder="123456"
          className="h-11 font-mono text-[17px] tracking-[0.3em]"
        />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <Button className="mt-2 h-11 w-full" type="submit" disabled={loading}>
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {t("login")}
        {!loading && <ArrowRight aria-hidden="true" />}
      </Button>
    </form>
  );
}
