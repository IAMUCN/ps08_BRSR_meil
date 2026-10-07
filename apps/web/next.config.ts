import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end run builds into its own folder so it never touches a dev server's output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Report PDFs (TRD §17): a headless browser and its binary are loaded at runtime, never bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // Security headers on every response (audit fix P2, SECURITY_REVIEW.md). The policy stops the app being
  // framed, plugins and injected <base>/form targets; it does not restrict scripts — that needs per-request
  // nonces, recorded as an open item rather than shipped half-working.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      ],
    },
    {
      // Not on /api: a header set here replaces a route's own, and the evidence file route sends a
      // stricter policy (sandbox, nothing loadable) that must stay in force.
      source: "/((?!api/).*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
        },
      ],
    },
  ],
};

export default nextConfig;
