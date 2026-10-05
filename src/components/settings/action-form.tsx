"use client";

import { useTranslations } from "next-intl";
import { notify, notifyResult } from "@/components/ui/toast";

// A plain server-action form that confirms (or reports) the result with a toast.
export function ActionForm({
  action,
  success,
  className,
  children,
}: {
  action: (formData: FormData) => Promise<{ success: boolean; message?: string }>;
  success: string;
  className?: string;
  children: React.ReactNode;
}) {
  const tc = useTranslations("common");
  return (
    <form
      className={className}
      action={async (formData) => {
        try {
          notifyResult(await action(formData), success);
        } catch {
          notify.error(tc("errors.somethingWrong"));
        }
      }}
    >
      {children}
    </form>
  );
}
