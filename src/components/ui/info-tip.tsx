"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { Info } from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

// The (i) beside a title or label: the explanation the screen leaves out.
// Opens on hover, and on tap or keyboard where there is no hover.
function InfoTip({ children, className }: { children: React.ReactNode; className?: string }) {
  const t = useTranslations("common")
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        aria-label={t("moreInfo")}
        className={cn(
          "inline-flex size-5 shrink-0 cursor-help items-center justify-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-popup-open:text-foreground",
          className
        )}
      >
        <Info className="size-3.5" aria-hidden />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" sideOffset={6} className="isolate z-50">
          <PopoverPrimitive.Popup className="w-max max-w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-xl border border-border-strong bg-popover px-3 py-2 text-[13.5px] leading-relaxed font-normal text-popover-foreground normal-case tracking-normal shadow-float duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export { InfoTip }
