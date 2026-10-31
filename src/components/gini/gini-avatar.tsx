/* eslint-disable @next/next/no-img-element -- Gini is fixed art in /public/gini */
import { cn } from "@/lib/utils";

// Gini, drawn once and used three ways: the full figure (a cut-out with a rim for
// its ground: -on-dark under the dark theme, -on-light under light), the bust in a
// round badge and the face in a circle. Never recoloured, re-cropped or redrawn.

/**
 * The full figure stands alone on the empty report canvas (pass `title` as her
 * text alternative); the face sits beside her name and is decorative.
 */
export function GiniAvatar({
  variant = "face",
  animated = false,
  title,
  className,
}: {
  variant?: "full" | "face";
  animated?: boolean;
  title?: string;
  className?: string;
}) {
  if (variant === "face") {
    return <img src="/gini/gini-face.webp" alt={title ?? ""} className={cn("rounded-full object-cover", className)} />;
  }
  const cls = cn(animated && "wf-gini-figure", className);
  return (
    <>
      <img src="/gini/gini-full-on-dark.webp" alt={title ?? ""} className={cn("wf-on-dark", cls)} />
      <img src="/gini/gini-full-on-light.webp" alt={title ?? ""} className={cn("wf-on-light", cls)} />
    </>
  );
}

/** The bust filling a round badge: size it with a size-* class (64, 40 or 36px). */
export function GiniBadge({ className }: { className?: string }) {
  return (
    <span className={cn("wf-gini-badge size-9", className)} aria-hidden="true">
      <img src="/gini/gini-bust.webp" alt="" />
    </span>
  );
}
