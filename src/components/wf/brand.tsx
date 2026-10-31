import Link from "next/link";
import { cn } from "@/lib/utils";

// The WorkFactory.AI mark with the wordmark and the product line. The mark's
// colours are its own: never recoloured.
export function BrandLockup({
  product,
  logoAlt,
  href = "/",
  size = "md",
  className,
}: {
  product: string;
  logoAlt: string;
  href?: string | null;
  size?: "md" | "lg";
  className?: string;
}) {
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed-size SVG mark */}
      <img className="wf-brand__mark" src="/logo.svg" alt={logoAlt} />
      <span className="wf-brand__text">
        <span className="wf-brand__word">
          WorkFactory<span className="wf-brand__ai">.AI</span>
        </span>
        <span className="wf-brand__product">{product}</span>
      </span>
    </>
  );
  const cls = cn("wf-brand", size === "lg" && "wf-brand--lg", className);
  return href === null ? <div className={cls}>{body}</div> : <Link href={href} className={cls}>{body}</Link>;
}
