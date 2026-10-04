import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end run builds into its own folder so it never touches a dev server's output.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Report PDFs (TRD §17): a headless browser and its binary are loaded at runtime, never bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
