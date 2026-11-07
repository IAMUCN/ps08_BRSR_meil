import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Responses do not advertise the framework (no X-Powered-By header).
  poweredByHeader: false,
  // The end-to-end run builds into its own folder so it never touches a dev server's output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Report PDFs (TRD §17): a headless browser and its binary are loaded at runtime, never bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  // The browser itself is a set of compressed files in the package's bin folder, opened by path at runtime:
  // file tracing does not see them, so a deployed function would have the package and no browser. They are
  // added to the two places a report can be started from (the Reports page's action and the API route).
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  outputFileTracingIncludes: Object.fromEntries(
    ["/admin/reports", "/api/trpc/*"].map((route) => [
      route,
      ["../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**"],
    ]),
  ),
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
      // Protected dashboard routes must not be cached by browsers (audit / back navigation safety)
      source: "/:prefix(admin|app)/:path*",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      source: "/:prefix(admin|app)",
      headers: [
        { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
        { key: "Pragma", value: "no-cache" },
        { key: "Expires", value: "0" },
      ],
    },
    {
      // Not on /api: a header set here replaces a route's own, and the evidence file route sends a
      // stricter policy (sandbox, nothing loadable) that must stay in force.
      source: "/((?!api/).*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: `frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; script-src 'self' 'unsafe-inline'${
            process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
          }`,
        },
      ],
    },
  ],
};

export default nextConfig;
