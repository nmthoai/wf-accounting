import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { LoginForm } from "./login-form";
import { AuthShell } from "@/components/auth/auth-header";
import { Card, CardContent } from "@/components/ui/card";

export default function LoginPage() {
  const t = useTranslations("auth");

  return (
    <AuthShell lead={t("lead")}>
      <Card className="w-full max-w-[440px]">
        <CardContent className="p-6 sm:p-8">
          <p className="wf-label">{t("note")}</p>
          <h2 className="mt-3 text-[26px] leading-tight font-extrabold tracking-[-0.025em] text-foreground">{t("login")}</h2>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
