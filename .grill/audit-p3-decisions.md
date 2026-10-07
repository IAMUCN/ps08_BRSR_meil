# Grill: Audit fixes P3

Date: 2026-10-07

From `AUDIT_FIXES.md`, section P3: "`AUTH_SECRET` is documented but unused — remove or implement. Web app has no
Sentry (the worker does)."

## Key decisions

- **`AUTH_SECRET` is removed** from `apps/web/.env.example`. Nothing reads it: sessions are Supabase Auth's, and
  there is no second signing secret to hold. `SENTRY_AUTH_TOKEN` goes with it for the same reason (it is only for
  uploading source maps at build time, which is not set up).
- **The web server reports errors to Sentry when `SENTRY_DSN` is set**, and does nothing when it is not — the same
  rule as the OCR worker. `apps/web/instrumentation.ts` (Next.js's own hook): errors thrown while rendering, in
  route handlers, Server Actions and the proxy, plus whatever the code already logs with `console.error` (a failed
  report run, an unexpected procedure error). Errors only; no performance tracing.
- **Nothing personal is sent.** This SDK version collects cookies, headers, request bodies, query strings, user
  details and local variables by default; each is switched off. Tested by forcing a server error on a request
  carrying a marked cookie, header and query value against a stand-in endpoint on this machine: one event arrived
  (the error and its stack), with none of the three in it. The event does carry the server's host name.
- **New dependency: `@sentry/nextjs`** (`apps/web/package.json`, a shared file; `pnpm-lock.yaml` changed). The
  build is not wrapped with Sentry's config helper, so the build itself is unchanged.

## Not done

- **Errors in the browser are not reported** — only the server's. That needs a public DSN variable and adds the
  SDK to every page's download; left until someone wants it.
- **Readable stack traces in production** (source maps uploaded at build) are not set up.
- Not tried against a real Sentry project: no DSN is configured anywhere yet. Set `SENTRY_DSN` on the web host at
  deployment.
