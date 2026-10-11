import type { MetadataRoute } from "next";

// Only the public landing page is for search engines. The signed-in app, its API and the account pages
// are asked to be left out of indexes; this is a request to well-behaved crawlers, not access control —
// every one of those routes checks the session itself.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/app",
        "/api",
        "/auth",
        "/login",
        "/forgot-password",
        "/reset-password",
      ],
    },
  };
}
