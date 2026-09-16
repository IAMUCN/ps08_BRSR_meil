"use client";

import { Toaster as SonnerToaster } from "sonner";

// UI brief §15.4: routine confirmations are bottom-right, auto-dismissing toasts (sonner announces
// them politely to screen readers). Colors come from the theme tokens.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-card !text-card-foreground !border-border !rounded-md",
          description: "!text-muted-foreground",
        },
      }}
    />
  );
}
