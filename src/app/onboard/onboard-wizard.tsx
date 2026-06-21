"use client";

import { useState, useEffect } from "react";
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
          setError(res.message || "Failed to generate the 2FA secret.");
        }
      } catch {
        if (!cancelled) setError("Could not start 2FA setup. Refresh and try again.");
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
        setError(res?.message || "Could not update password.");
        return;
      }
      // Password done. Either move to 2FA or finish.
      if (needs2FA) {
        setStep("twofa");
      } else {
        await finishOnboarding(); // signs out → /login
      }
    } catch {
      setError("Something went wrong. Please try again.");
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
      await finishOnboarding(); // signs out → /login
    } catch (err: unknown) {
      // Allow Next.js redirects (from finishOnboarding) to propagate
      const message = (err as { message?: string; digest?: string })?.message || "";
      const digest = (err as { digest?: string })?.digest || "";
      if (message.includes("NEXT_REDIRECT") || digest.includes("NEXT_REDIRECT")) throw err;
      setError("Verification failed. Please try again.");
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
          Secure your account
        </h2>
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium">{username}</span>. Finish setup to continue.
        </p>
        {totalSteps > 1 && (
          <p className="text-xs text-muted-foreground">
            Step {currentIndex} of {totalSteps}
          </p>
        )}
      </div>

      <div className="rounded-xl bg-card p-6 shadow-sm border space-y-6">
        {step === "password" ? (
          <form onSubmit={handlePassword} className="space-y-4">
            <div className="flex items-center gap-2 text-primary">
              <KeyRound className="h-5 w-5" />
              <h3 className="font-semibold">Set a new password</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              You&apos;re using a default password. Choose your own — only you should know it.
            </p>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                placeholder="Re-enter your new password"
                autoComplete="new-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save password"}
            </Button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="font-semibold">Set up two-factor authentication</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Scan this QR code with your authenticator app (Authy, Google Authenticator), then enter the 6-digit code.
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
                    alt="2FA QR Code"
                    className="w-48 h-48 border rounded-lg bg-white p-2"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Or enter this key manually:</p>
                    <code className="bg-muted px-2 py-1 rounded text-xs text-primary tracking-widest break-all">
                      {secret}
                    </code>
                  </div>
                </>
              ) : null}
            </div>

            <form onSubmit={handleVerify2FA} className="space-y-4 pt-4 border-t">
              <div className="space-y-2 text-left">
                <Label htmlFor="token">Verification code</Label>
                <Input
                  id="token"
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter 6-digit code"
                  value={token}
                  onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
                  required
                  maxLength={6}
                  className="text-center tracking-widest text-lg"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" type="submit" disabled={busy || token.length < 6 || !qrCodeUrl}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & finish"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
