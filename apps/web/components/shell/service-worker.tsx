"use client";

import { useEffect } from "react";

// Registers public/sw.js (feature_enhancement.md 9.2): the offline page for the installable app. Production only,
// so a development server never serves pages through it.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Without it the app works the same; only the offline page is missing.
    });
  }, []);
  return null;
}
