// Error tracking for the web server (TRD §19; audit fix P3, .grill/audit-p3-decisions.md), matching what the
// OCR worker already does: a no-op unless SENTRY_DSN is set. Server side only — errors thrown while rendering,
// in route handlers, Server Actions and the proxy, plus everything the code already logs with console.error
// (failed report runs, unexpected procedure errors). Request bodies, cookies and user details are not sent.
import type { Instrumentation } from "next";

export async function register() {
  // Times shown by the server read in India time (owner's request, 2026-11-12). Vercel's servers run on UTC,
  // so every date the pages format without naming a zone was 5½ hours behind; Node switches its zone when
  // TZ is set. APP_TIME_ZONE overrides it. (A developer machine in India already ran this way.)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.APP_TIME_ZONE?.trim() || "Asia/Kolkata";
  }
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // This SDK collects cookies, headers, request bodies, user details and local variables unless told not
    // to. An error report needs the stack and the route, not a session cookie or a password being typed.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    // Errors only: no performance traces, so nothing is sampled from ordinary requests.
    tracesSampleRate: 0,
    integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME !== "nodejs") return;
  (await import("@sentry/nextjs")).captureRequestError(...args);
};
