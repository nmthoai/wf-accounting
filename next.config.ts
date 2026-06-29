import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  // xlsx (SheetJS) uses Node-specific dynamic requires that trip Turbopack's
  // file tracing — load it via native require at runtime instead of bundling.
  serverExternalPackages: ["xlsx"],
};

export default withNextIntl(nextConfig);
