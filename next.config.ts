import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Browser-side protections for every response (nginx adds none of these).
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // No framing, no plugins, no foreign form targets; scripts are left to Next.
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // xlsx (SheetJS) uses Node-specific dynamic requires that trip Turbopack's
  // file tracing — load it via native require at runtime instead of bundling.
  serverExternalPackages: ["xlsx"],
  experimental: {
    // Attachments up to 10 MB per save (src/lib/upload-limit.ts) plus the form itself.
    serverActions: { bodySizeLimit: "11mb" },
    // The request proxy (middleware) buffers bodies and truncates past this —
    // keep it above the server-action limit.
    proxyClientMaxBodySize: "12mb",
  },
};

export default withNextIntl(nextConfig);
