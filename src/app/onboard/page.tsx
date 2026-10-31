import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/auth-header";
import { OnboardWizard } from "./onboard-wizard";

export default async function OnboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  // Already fully onboarded → nothing to do here
  if (!user.mustChangePassword && user.twoFactorEnabled) redirect("/");

  const t = await getTranslations("auth.onboard");

  return (
    <AuthShell
      lead={t.rich("signedInAs", {
        username: user.username,
        b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
      })}
    >
      <OnboardWizard needsPasswordChange={user.mustChangePassword} needs2FA={!user.twoFactorEnabled} />
    </AuthShell>
  );
}
