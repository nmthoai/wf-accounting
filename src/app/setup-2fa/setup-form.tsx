"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { generate2FASecret, verifyAndEnable2FA } from "@/app/actions/auth";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function Setup2FAForm() {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [secret, setSecret] = useState<string>("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function setup() {
      try {
        const res = await generate2FASecret();
        console.log("Server response:", res);
        if (res.success && res.otpauthUrl) {
          const url = await QRCode.toDataURL(res.otpauthUrl);
          setQrCodeUrl(url);
          setSecret(res.secret as string);
        } else if (res.message === "2FA already enabled") {
          router.push("/");
        } else {
          setError(res.message || "Failed to generate 2FA secret");
        }
      } catch (err: any) {
        console.error("Client error:", err);
        setError(err.message || "Something went wrong on client");
      } finally {
        setIsLoading(false);
      }
    }
    setup();
  }, [router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setError("");

    try {
      const res = await verifyAndEnable2FA(token);
      // If verifyAndEnable2FA succeeds, it will throw a NEXT_REDIRECT to log the user out.
      // If we reach this line, it means it returned an error object.
      if (res && res.success === false) {
        setError(res.message as string);
      }
    } catch (err: any) {
      // Next.js uses errors to handle redirects. We must re-throw them!
      if (err?.message?.includes("NEXT_REDIRECT") || err?.digest?.includes("NEXT_REDIRECT")) {
        throw err;
      }
      console.error("Verification error:", err);
      setError("Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-card p-6 shadow-sm border space-y-6 flex flex-col items-center text-center">
        {qrCodeUrl ? (
          <>
            <img src={qrCodeUrl} alt="2FA QR Code" className="w-48 h-48 border rounded-lg bg-white p-2" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Or enter code manually:</p>
              <code className="bg-muted px-2 py-1 rounded text-sm text-primary tracking-widest">
                {secret}
              </code>
            </div>
          </>
        ) : null}

        <form onSubmit={handleVerify} className="w-full space-y-4 pt-4 border-t">
          <div className="space-y-2 text-left">
            <Label htmlFor="token">Verification Code</Label>
            <Input
              id="token"
              type="text"
              placeholder="Enter 6-digit code from Authy"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              maxLength={6}
              className="text-center tracking-widest text-lg"
            />
          </div>
          <Button className="w-full" type="submit" disabled={isVerifying || token.length < 6}>
            {isVerifying ? "Verifying..." : "Verify & Enable"}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
      </div>
    </div>
  );
}
