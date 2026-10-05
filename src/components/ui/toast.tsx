"use client"

import { Toast } from "@base-ui/react/toast"
import { CheckCircle2, CircleAlert, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// One manager for the whole app, so any client component can confirm an
// action without a hook: notify.success("Entry saved").
const toastManager = Toast.createToastManager()

export const notify = {
  success: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "success" }),
  // Errors stay longer and are announced straight away.
  error: (title: string, description?: string) =>
    toastManager.add({ title, description, type: "error", priority: "high", timeout: 8000 }),
}

// For actions that answer { success, message }: confirm or report, and say
// whether it worked.
export function notifyResult(
  res: { success: boolean; message?: string } | null | undefined,
  done: string,
  failed = "Could not save."
) {
  if (res?.success) notify.success(done)
  else notify.error(res?.message || failed)
  return !!res?.success
}

export function Toaster() {
  return (
    <Toast.Provider toastManager={toastManager}>
      <Toast.Portal>
        <Toast.Viewport className="fixed right-4 bottom-4 z-[100] w-[calc(100vw-2rem)] sm:right-6 sm:bottom-6 sm:w-[22.5rem]">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList() {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      data-slot="toast"
      className={cn(
        // Stacking and swipe behaviour from the Base UI toast reference.
        "[--gap:0.75rem] [--peek:0.75rem] [--scale:calc(max(0,1-(var(--toast-index)*0.1)))] [--shrink:calc(1-var(--scale))] [--height:var(--toast-frontmost-height,var(--toast-height))] [--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))]",
        "absolute right-0 bottom-0 left-auto z-[calc(1000-var(--toast-index))] w-full origin-bottom select-none",
        "[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))]",
        "after:absolute after:top-full after:left-0 after:h-[calc(var(--gap)+1px)] after:w-full after:content-['']",
        "h-[var(--height)] data-expanded:h-[var(--toast-height)] data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--offset-y)))]",
        "data-limited:opacity-0 data-ending-style:opacity-0 data-starting-style:[transform:translateY(150%)] [&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))] data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "[transition:transform_0.5s_cubic-bezier(0.22,1,0.36,1),opacity_0.5s,height_0.15s]",
        // Looks like the app's dialogs.
        "rounded-xl bg-popover text-popover-foreground text-sm shadow-lg ring-1 ring-foreground/10",
        "data-[type=success]:border-l-4 data-[type=success]:border-l-green-600 data-[type=error]:border-l-4 data-[type=error]:border-l-destructive"
      )}
    >
      <Toast.Content className="flex h-full items-start gap-3 overflow-hidden p-3 pr-2 transition-opacity duration-[250ms] data-behind:opacity-0 data-expanded:opacity-100">
        {toast.type === "error" ? (
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Toast.Title className="font-medium leading-5" />
          <Toast.Description className="text-muted-foreground" />
        </div>
        <Toast.Close
          aria-label="Dismiss"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <XIcon className="h-3.5 w-3.5" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}
