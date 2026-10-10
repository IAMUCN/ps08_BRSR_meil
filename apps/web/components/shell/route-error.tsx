"use client";

import { RotateCw, ServerCrash, WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// UI brief §15.3 / App Flow §3: an error names what happened and what to do next — never a bare "Something
// went wrong". A page that failed to load is retriable, so Try again is always offered.

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const offline = !useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  useEffect(() => console.error(error), [error]);

  const Icon = offline ? WifiOff : ServerCrash;
  return (
    <div role="alert" className="max-w-xl rounded-md border border-status-error bg-card p-6">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-6 shrink-0 text-status-error" strokeWidth={1.5} aria-hidden />
        <div className="space-y-2">
          <h1 className="text-xl leading-7 font-semibold">
            {offline ? "You appear to be offline" : "This page couldn't be loaded"}
          </h1>
          <p className="text-sm leading-5">
            {offline
              ? "Check your network connection, then try again. Nothing you submitted earlier is lost."
              : "The server ran into a problem while preparing this page. Try again; if it keeps happening, tell your Admin and quote the reference below."}
          </p>
          {error.digest && !offline ? (
            <p className="text-xs text-muted-foreground">
              Reference: <span className="font-mono">{error.digest}</span>
            </p>
          ) : null}
          <Button onClick={() => retry()} className="mt-2">
            <RotateCw aria-hidden />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
