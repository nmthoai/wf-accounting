/* eslint-disable @next/next/no-img-element -- Gini is fixed SVG art in /public/gini */
import { cn } from "@/lib/utils";

// Gini, drawn once and cropped three ways. Each crop has a sticker rim for its
// ground: -on-dark under the dark theme, -on-light under light. Never recoloured.
type Variant = "full" | "bust" | "face";

function Crop({ variant, alt, className }: { variant: Variant; alt: string; className?: string }) {
  return (
    <>
      <img src={`/gini/gini-${variant}-on-dark.svg`} alt={alt} className={cn("wf-on-dark", className)} />
      <img src={`/gini/gini-${variant}-on-light.svg`} alt={alt} className={cn("wf-on-light", className)} />
    </>
  );
}

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
  variant?: Variant;
  animated?: boolean;
  title?: string;
  className?: string;
}) {
  return <Crop variant={variant} alt={title ?? ""} className={cn(animated && "wf-gini-figure", className)} />;
}

/** The bust in a round badge: size it with a size-* class (64, 40 or 36px). */
export function GiniBadge({ className }: { className?: string }) {
  return (
    <span className={cn("wf-gini-badge size-9", className)} aria-hidden="true">
      <Crop variant="bust" alt="" />
    </span>
  );
}
