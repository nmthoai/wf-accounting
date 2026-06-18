import Image from "next/image";
import { useTranslations } from "next-intl";
import { LoginForm } from "./login-form";
import { LanguageSwitcher } from "@/components/language-switcher";

export default function LoginPage() {
  const t = useTranslations("Auth");

  return (
    <div className="flex min-h-screen items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-md space-y-8 bg-card/50 backdrop-blur-sm p-8 rounded-2xl border shadow-lg">
        <div className="text-center space-y-4">
          <div className="flex justify-center mb-6">
            <Image src="/logo.svg" alt="WorkFactory AI Logo" width={80} height={50} priority unoptimized className="dark:brightness-150" />
          </div>
          <h2 className="font-serif text-4xl font-bold tracking-tight">
            <span className="text-primary">Work</span>
            <span className="text-[#0EA5E9]">Factory</span>
          </h2>
          <div className="mt-2 text-sm text-muted-foreground flex flex-col gap-1">
            <p>{t("subtitle1")}</p>
            <p>{t("subtitle2")}</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
