import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
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
