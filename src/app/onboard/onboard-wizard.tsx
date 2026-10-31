"use client";

import Image from "next/image";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notify } from "@/components/ui/toast";
import { Notice } from "@/components/wf/ledger-ui";
import { Loader2 } from "lucide-react";

type Step = "password" | "twofa";

export function OnboardWizard({
  needsPasswordChange,
  needs2FA,
}: {
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
    // Only on entering the 2FA step: re-running when `t` changes would issue a
    // new secret and change the QR code while it is being scanned.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const titleClass = "mt-3 text-[26px] leading-tight font-extrabold tracking-[-0.025em] text-foreground";

  return (
    <Card className="w-full max-w-[440px]">
      <CardContent className="p-6 sm:p-8">
        <p className="wf-label">
          {t("title")}
          {totalSteps > 1 && <> · {t("step", { current: currentIndex, total: totalSteps })}</>}
        </p>

        {step === "password" ? (
          <>
            <h2 className={titleClass}>{t("password.title")}</h2>
            <p className="mt-2 text-text-secondary">{t("password.intro")}</p>
            <form onSubmit={handlePassword} className="mt-7 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">{t("password.newLabel")}</Label>
                <Input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  placeholder={t("password.newPlaceholder")}
                  autoComplete="new-password"
                  className="h-11"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">{t("password.confirmLabel")}</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  placeholder={t("password.confirmPlaceholder")}
                  autoComplete="new-password"
                  className="h-11"
                />
              </div>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" className="mt-2 h-11 w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("password.save")}
              </Button>
            </form>
          </>
        ) : (
          <>
            <h2 className={titleClass}>{t("twoFactor.title")}</h2>
            <p className="mt-2 text-text-secondary">{t("twoFactor.intro")}</p>

            <div className="mt-6 flex flex-col items-center gap-4 text-center">
              {loadingQr ? (
                <div className="flex size-48 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              ) : qrCodeUrl ? (
                <>
                  {/* The QR image carries its own white quiet zone, so it scans in either theme. */}
                  <Image
                    src={qrCodeUrl}
                    alt={t("twoFactor.qrAlt")}
                    width={192}
                    height={192}
                    className="size-48 rounded-lg border border-border-strong"
                  />
                  <div className="grid w-full gap-2">
                    <p className="wf-label">{t("twoFactor.manualKey")}</p>
                    <code className="rounded-md bg-muted/40 px-2.5 py-1.5 font-mono text-[14.5px] tracking-[0.12em] break-all text-foreground">
                      {secret}
                    </code>
                  </div>
                </>
              ) : null}
            </div>

            <form onSubmit={handleVerify2FA} className="mt-6 grid gap-4 border-t border-border pt-6">
              <div className="grid gap-2">
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
                  className="h-11 font-mono text-[17px] tracking-[0.3em] placeholder:font-sans placeholder:tracking-normal"
                />
              </div>
              {error && <Notice tone="error">{error}</Notice>}
              <Button className="mt-2 h-11 w-full" type="submit" disabled={busy || token.length < 6 || !qrCodeUrl}>
                {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : t("twoFactor.verify")}
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
