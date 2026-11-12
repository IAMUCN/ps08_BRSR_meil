import type { MetadataRoute } from "next";

// EmeilSG as an installable app (feature_enhancement.md 9.2, requirement 14; owner's choice: an installable web
// app now, a store app later — docs/MOBILE_APP.md). Opens the workspace in its own window.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EmeilSG",
    short_name: "EmeilSG",
    description: "Evidence-first ESG and BRSR reporting: upload, verify, approve and report.",
    id: "/app",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#37358f",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Upload a document", short_name: "Upload", url: "/app/upload" },
      { name: "My uploads", short_name: "Uploads", url: "/app/submissions" },
    ],
  };
}
