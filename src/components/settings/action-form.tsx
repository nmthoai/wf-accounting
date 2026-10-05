"use client";

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
  return (
    <form
      className={className}
      action={async (formData) => {
        try {
          notifyResult(await action(formData), success);
        } catch {
          notify.error("Something went wrong — please try again.");
        }
      }}
    >
      {children}
    </form>
  );
}
