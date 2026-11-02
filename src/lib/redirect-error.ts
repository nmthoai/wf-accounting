// A server action that redirects (sign-out) rejects its promise with Next's
// NEXT_REDIRECT error while the router navigates: that is success, not failure.
export function isRedirect(err: unknown) {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}
