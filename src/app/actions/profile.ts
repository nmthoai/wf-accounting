"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getT } from "@/i18n/server";

const NAME_MAX = 60;

// Each user edits only their own profile. The username is the login and the
// name in the change history, so it isn't editable here.
export async function updateProfile(formData: FormData) {
  const session = await getSession();
  const t = await getT("profile");
  if (!session?.user?.id) return { success: false, message: t("errors.unauthorized") };

  const raw = formData.get("displayName");
  const displayName = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (displayName.length > NAME_MAX) {
    return { success: false, message: t("errors.nameTooLong", { max: NAME_MAX }) };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { displayName: displayName || null },
  });

  // The greeting sits in the dashboard layout.
  revalidatePath("/", "layout");
  return { success: true };
}
