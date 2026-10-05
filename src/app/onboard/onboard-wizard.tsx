"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import {
  changePassword,
  generate2FASecret,
  verifyAndEnable2FA,
  finishOnboarding,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/toast";
import { Loader2, KeyRound, ShieldCheck } from "lucide-react";

type Step = "password" | "twofa";

export function OnboardWizard({
  username,
  needsPasswordChange,
  needs2FA,
}: {
  username: string;
  needsPasswordChange: boolean;
  needs2FA: boolean;
}) {
  const t = useTranslations("auth.onboard");
  const [step, setStep] = useState<Step>(needsPasswordChange ? "password" : "twofa");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // 2FA state
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [token, setToken] = useState("");
  const [loadingQr, setLoadingQr] = useState(false);

  // Load the QR as soon as we enter the 2FA step
  useEffect(() => {
    if (step !== "twofa") return;
    let cancelled = false;
    async function loadQr() {
      setLoadingQr(true);
      setError("");
      try {
        const res = await generate2FASecret();
        if (cancelled) return;
        if (res.success && res.otpauthUrl) {
          const url = await QRCode.toDataURL(res.otpauthUrl);
          setQrCodeUrl(url);
          setSecret(res.secret as string);
        } else {
          setError(res.message || t("errors.generateFailed"));
        }
      } catch {
        if (!cancelled) setError(t("errors.startFailed"));
      } finally {
        if (!cancelled) setLoadingQr(false);
      }
    }
    loadQr();
    return () => {
      cancelled = true;
    };
  }, [step]);

  async function handlePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await changePassword(new FormData(e.currentTarget));
      if (!res?.success) {
        setError(res?.message || t("errors.passwordFailed"));
        return;
      }
      notify.success(t("toast.passwordChanged"));
      // Password done. Either move to 2FA or finish.
      if (needs2FA) {
        setStep("twofa");
      } else {
        await finishOnboarding(); // signs out → /login
      }
    } catch (err: unknown) {
      // Allow Next.js redirects (from finishOnboarding) to propagate
      const message = (err as { message?: string; digest?: string })?.message || "";
      const digest = (err as { digest?: string })?.digest || "";
      if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) throw err;
      setError(t("errors.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await verifyAndEnable2FA(token);
      if (res && res.success === false) {
        setError(res.message as string);
        return;
      }
      notify.success(t("toast.twoFactorEnabled"));
      await finishOnboarding(); // signs out → /login
    } catch (err: unknown) {
      // Allow Next.js redirects (from finishOnboarding) to propagate
      const message = (err as { message?: string; digest?: string })?.message || "";
      const digest = (err as { digest?: string })?.digest || "";
      if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) throw err;
      setError(t("errors.verifyFailed"));
    } finally {
      setBusy(false);
    }
  }

  const totalSteps = (needsPasswordChange ? 1 : 0) + (needs2FA ? 1 : 0);
  const currentIndex = step === "password" ? 1 : needsPasswordChange ? 2 : 1;

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="font-serif text-3xl font-bold tracking-tight text-primary">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t.rich("signedInAs", { username, b: (c) => <span className="font-medium">{c}</span> })}
        </p>
        {totalSteps > 1 && (
          <p className="text-xs text-muted-foreground">
            {t("step", { current: currentIndex, total: totalSteps })}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-card p-6 shadow-sm border space-y-6">
        {step === "password" ? (
          <form onSubmit={handlePassword} className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <KeyRound className="h-5 w-5" />
              <h3 className="font-semibold">{t("password.title")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("password.intro")}
            </p>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("password.newLabel")}</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                placeholder={t("password.newPlaceholder")}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("password.confirmLabel")}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder={t("password.confirmPlaceholder")}
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("password.save")}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="font-semibold">{t("twoFactor.title")}</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("twoFactor.intro")}
            </p>

            <div className="flex flex-col items-center text-center gap-4">
              {loadingQr ? (
                <div className="flex h-48 w-48 items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : qrCodeUrl ? (
                <>
                  <img
                    src={qrCodeUrl}
                    alt={t("twoFactor.qrAlt")}
                    className="w-48 h-48 border rounded-lg bg-white p-2"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t("twoFactor.manualKey")}</p>
                    <code className="bg-muted px-2 py-1 rounded text-xs text-primary tracking-widest break-all">
                      {secret}
                    </code>
                  </div>
                </>
              ) : null}
            </div>

            <form onSubmit={handleVerify2FA} className="space-y-4 pt-4 border-t">
              <div className="space-y-2 text-left">
                <Label htmlFor="token">{t("twoFactor.codeLabel")}</Label>
                <Input
                  id="token"
                  type="text"
                  inputMode="numeric"
                  placeholder={t("twoFactor.codePlaceholder")}
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                  required
                  maxLength={6}
                  className="text-center tracking-widest text-lg"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={busy || token.length < 6 || !qrCodeUrl}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("twoFactor.verify")}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
