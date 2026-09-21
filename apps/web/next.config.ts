import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Report PDFs (TRD §17): a headless browser and its binary are loaded at runtime, never bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
};

export default nextConfig;
