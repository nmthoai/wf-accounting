"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { authenticate } from "@/app/actions/auth";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [errorMessage, dispatch, isPending] = useActionState(
    authenticate,
    undefined
  );
  const t = useTranslations("Auth");
  const params = useSearchParams();
  const justOnboarded = params.get("onboarded") === "1";
  const timedOut = params.get("timeout") === "1";

  return (
    <form action={dispatch} className="space-y-6">
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
          <Input id="token" name="token" type="text" placeholder="123456" className="bg-background/50 tracking-widest text-lg" />
        </div>
      </div>
      <Button className="w-full py-6 text-md shadow-md" type="submit" disabled={isPending}>
        {isPending ? "..." : t("login")}
      </Button>
      {errorMessage && (
        <div className="text-sm text-destructive text-center font-medium">
          {errorMessage}
        </div>
      )}
    </form>
  );
}
