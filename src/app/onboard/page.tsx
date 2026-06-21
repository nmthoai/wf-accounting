import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { OnboardWizard } from "./onboard-wizard";

export default async function OnboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) redirect("/login");

  // Already fully onboarded → nothing to do here
  if (!user.mustChangePassword && user.twoFactorEnabled) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <OnboardWizard
          username={user.username}
          needsPasswordChange={user.mustChangePassword}
          needs2FA={!user.twoFactorEnabled}
        />
      </div>
    </div>
  );
}
