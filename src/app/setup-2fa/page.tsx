import { redirect } from "next/navigation";

// 2FA setup now lives in the unified onboarding wizard.
export default function Setup2FAPage() {
  redirect("/onboard");
}
