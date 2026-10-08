# Grill: Phase 18 — Audit and security hardening

Date: 2026-09-22

## Intent

Surface the audit log (Audit Trail page, per-record history from upload to report inclusion), confirm every
material event writes an entry, and run a deliberate security review whose findings are fixed or recorded
as accepted risk (`06_IMPLEMENTATION_PLAN.md` Phase 18). The review itself is `SECURITY_REVIEW.md`.

## Key decisions

- Decision: **CSRF — an Origin check on the tRPC endpoint.** A state-changing request whose `Origin` (or,
  without one, a browser's `Sec-Fetch-Site: cross-site`) is not the app's own host is refused. Server actions
  already get the same check from Next.js. Alternatives: rely on SameSite=Lax alone (leaves same-site
  subdomains); double-submit tokens (more moving parts for the same protection).
- Decision: **rate limits — verify Supabase Auth, add a database-backed limit on uploads.** Verifying found a
  real gap (below), so sign-in gets the same limiter. Alternative: document the missing upload limit.

## Found while reviewing

- **Sign-in throttling was effectively global.** Sign-in is a server action, so Supabase sees every attempt as
  coming from the app server's one address; its 30-per-5-minutes-per-IP limit would lock out the whole
  organisation (31 people signing in together, or one attacker) and never limits guessing against one
  account. Fixed with an app-level limiter: 5 failed attempts per account and 50 per client address per 15
  minutes (`rate_limit_events`, deviation D19, hashed buckets). Hosted Supabase's per-IP limit should be
  raised accordingly (SECURITY_REVIEW.md).
- **The audit log was append-only by grant only.** Browser roles could only read it, but the server role
  could change or delete entries. A trigger now refuses UPDATE, DELETE and TRUNCATE for every role
  (migration `0027`).
- **A record entering the approval queue was not audited** (`approval.submitted` added).

## Surfaced assumptions

- Upload limit: 60 upload preparations per user per 10 minutes (a month-end batch is legitimate). All
  limits live in `org_settings.rate_limits`.
- Per-record history = the record's events, its document's (upload, OCR), its fields' edits, and every
  report run whose snapshot includes it.
- Signed upload URLs keep Supabase's fixed two-hour lifetime; each is bound to one path, cannot overwrite an
  existing object, and the server re-verifies the bytes before any row exists (recorded as accepted risk).

## Out of scope

- Moving to real MEIL documents (the plan allows it from this phase; it needs the owner's data, not code),
  penetration testing by a third party, and Supabase CAPTCHA.
