"use client";

import { useState } from "react";
import { notifyResult, notifyFailure } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// A server-action form that confirms (or reports) the result with a toast.
// Its fields are locked while saving (no second save from a double click) and
// cleared only once the save worked: a refused save or an ended session keeps
// what was typed.
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
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const fd = new FormData(form); // before the fieldset disables the fields
    setBusy(true);
    try {
      if (notifyResult(await action(fd), success)) form.reset();
    } catch {
      notifyFailure();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset disabled={busy} className={cn("m-0 min-w-0 border-0 p-0", className)}>
        {children}
      </fieldset>
    </form>
  );
}
