# TraceESG — Security review (Phase 18)

_Date: 2026-09-22. Scope: everything built through Phase 17 — the web app (`apps/web`), the database
(`supabase/`), Storage and the OCR worker (`apps/ocr-worker`). Plan: `06_IMPLEMENTATION_PLAN.md` Phase 18.
Decisions: `.grill/phase-18-audit-security-decisions.md`._

This is an internal review by the implementing team, not a third-party penetration test. Every finding is
either **fixed** in this phase or recorded as an **accepted risk** or a **deployment action**, with the reason.

## Findings

| #   | Finding                                                                 | Severity | Status               |
| --- | ----------------------------------------------------------------------- | -------- | -------------------- |
| F1  | Sign-in throttling was effectively global                               | High     | Fixed                |
| F2  | The audit log was append-only by grant only                             | Medium   | Fixed                |
| F3  | No CSRF check on the tRPC endpoint (SameSite=Lax cookies only)          | Medium   | Fixed                |
| F4  | No upload rate limit                                                    | Low      | Fixed                |
| F5  | A record entering the approval queue was not audited                    | Low      | Fixed                |
| F6  | Audit entries from one transaction listed in random order               | Low      | Fixed                |
| F7  | Signed upload URLs live two hours                                       | Low      | Accepted risk        |
| F8  | Supabase Auth per-IP limits count the app server, not the user          | Medium   | Deployment action    |
| F9  | Reference and configuration tables are readable by every signed-in user | Info     | Accepted (by design) |
| F10 | The development database password was shared in chat                    | High     | Deployment action    |

**F1 — Sign-in throttling was effectively global.** Sign-in is a Server Action, so Supabase Auth sees every
attempt as coming from the app server's address. Its limit (30 sign-ins per 5 minutes per IP) would lock
the whole organisation out together and never limit password guessing against one account. **Fixed:** the
app limits failed attempts to 5 per account and 50 per client address per 15 minutes (`org_settings.rate_limits`),
counted in `rate_limit_events` under SHA-256 bucket names — no emails or addresses are stored (migration
`0027`, deviation D19). A locked account gets "Too many sign-in attempts — wait 15 minutes and try again",
even with the right password; a successful sign-in resets its count. The Profile page's current-password
check shares the per-account limit, so a signed-in session is not a password oracle.

**F2 — The audit log was append-only by grant only.** Browser roles could only read `audit_logs` (Admins)
and never write it, but the server's own connection could change or delete entries. **Fixed:** triggers
refuse UPDATE, DELETE and TRUNCATE for every role (migration `0027`); the pgTAP test and the API test both
try it as the server's own role.

**F3 — CSRF on tRPC.** Server Actions already get Next.js's Origin-equals-Host check; tRPC is a plain route
handler and relied on SameSite=Lax alone, which does not stop a same-site sibling (another subdomain).
**Fixed:** a non-GET request to `/api/trpc` is refused (403) unless its `Origin` is the app's own host;
without an `Origin`, a browser saying `Sec-Fetch-Site: cross-site` is refused (`lib/security/origin.ts`,
unit-tested). Queries stay GET-only and mutations cannot be sent as GET, so a cross-site page can trigger no
change. Non-browser clients carry no ambient cookies, so allowing a missing `Origin` from them is safe.

**F4 — Upload rate limit.** **Fixed:** 60 signed upload URLs per user per 10 minutes (a month-end batch is
legitimate); the 61st is refused with a clear message.

**F5 — Audit coverage.** Every material event in schema §12.1 was checked against the code paths (upload,
OCR completion and failure, field correction, verification, rejection, validation, calculation, factor
change, approval, mapping change, report generation, admin configuration). One gap: a record entering the
approval queue. **Fixed:** `approval.submitted` is written in the same transaction.

**F6 — Event order.** Entries written in one transaction shared `now()` and so were listed in random order
(validation before verification). **Fixed:** `audit_logs.created_at` defaults to `clock_timestamp()`
(migration `0027`). Entries written before this change keep their shared timestamp.

**F7 — Signed upload URL lifetime (accepted risk).** Supabase issues upload URLs with a fixed two-hour
lifetime that cannot be shortened. Each URL is bound to one server-chosen path containing a fresh document
id, cannot overwrite an object once written (tested: a second PUT is refused even with `x-upsert`), and the
server re-reads the bytes and recomputes SHA-256 before any database row exists. A leaked URL could at most
place one file at one unreferenced path within two hours. There are **no download signed URLs**: evidence and
report PDFs are served only through routes that check the session and scope on every request.

**F8 — Supabase Auth limits in production (deployment action).** Because sign-in and session refresh run
on the server, Supabase counts the Vercel egress addresses, not users. On the hosted project, raise the
per-IP `sign_in_sign_ups` limit well above the app's own (e.g. to several hundred per 5 minutes) and check
`token_refresh` (150 per 5 minutes) against the number of active users; the app's limits (F1) are the ones
that protect accounts.

**F9 — Readable reference data (accepted, by design).** The only `true` RLS policies are SELECT policies for
`authenticated` on reference and configuration tables (scopes, categories, metrics, formulas, factors,
document types, BRSR sections/indicators/mappings, roles and permissions, reporting periods, validation
rules, `org_settings`). None holds personal or evidence data; the upload and verification screens need them.
`user_display_names` exposes only ids and display names.

**F10 — Database password (deployment action).** The hosted development database password was shared in
chat while the hosted project was being set up. Rotate it in the Supabase dashboard before anything real is stored there.

## Checks performed

- **RLS audit.** All 37 public tables have RLS enabled. `anon` holds no grant on any of them. `authenticated`
  holds no table-level write grant anywhere: every write goes through the server. The one column grant
  (`notifications.is_read`) is limited to the user's own rows. Tables with RLS and no policy are
  intentionally closed (`rate_limit_events`). Scoped tables (records, documents, OCR, calculations,
  validation, approvals, notifications, audit log) use `my_org_unit_ids()` / `is_admin()` / own-row
  policies. The consolidation views are `security_invoker` and revoked from browser roles.
- **RLS bypass attempts at the database layer**, as a signed-in non-admin with the application out of the
  way (pgTAP, `set local role authenticated` with JWT claims): reading another project's records and
  documents, inserting records/documents/approvals/audit entries, setting approval or validation status,
  changing another user's notification, writing configuration, reading or changing the audit log, touching
  rate-limit counters — all refused (`phase2_smoke`, `phase16_control_tower`, `phase18_audit_security`).
- **Storage.** `evidence` and `reports` buckets are private with no client policies; a public-URL request
  for stored evidence is refused (API test).
- **Service-role key exposure.** `lib/supabase/admin.ts` and `lib/db.ts` import `server-only`, so a client
  import fails the build. The production client bundle (`.next/static`, 58 files) was scanned for the values
  of `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL`: not present. No secret is committed (`.env*` are
  git-ignored; `.env.example` holds names only).
- **Dependency scan.** `pnpm audit`: no known vulnerabilities. `pip-audit` on the OCR worker's installed
  packages: no known vulnerabilities.
- **Route-level checks.** `/admin/*` requires an active Admin in the layout and every Admin procedure checks
  again server-side; `/app/*` requires an active user; the evidence and report file routes check the session
  and scope per request; deactivated users are refused at all three layers (Phase 3).

## Out of scope

Third-party penetration testing, CAPTCHA on sign-in, and a web application firewall. Moving from synthetic
to real MEIL documents is allowed from this phase and needs the owner's data, not code.

## Addendum 2026-10-11 — ESG data analyst (chatbot)

A language model now chooses which lookups run for a question. Overview: `CHATBOT.md`; decisions:
`.grill/chat-analyst-decisions.md`.

**New exposure:** each question, up to 10 earlier messages and the lookup results (org unit names, period and
metric names, summed figures, factors and their sources) are sent to NVIDIA's hosted inference service. This
is the first data other than email to leave Supabase and the web host. Accepted by the owner for now; a model
served inside the network is a configuration change (`NVIDIA_NIM_BASE_URL`).

| Risk | Control | Checked by |
|---|---|---|
| The model is talked into reading another project | Org units resolve only inside the scope read from the database for this question; an out-of-scope unit reads as non-existent; both sides of a comparison are resolved before either is read | `tests/chat.test.ts` |
| The model asks for SQL, code or a tool that does not exist | A fixed list of eight tools; strict argument schemas; queries are fixed text with bound ids | `tests/chat.test.ts` |
| Anything in the chat path writes | Tools only read; the database role holds `SELECT` only and its transactions are read-only | `chat_analyst.test.sql`; an update tried through the chat connection was refused (25006) |
| People, documents or the audit trail reach the model | The role cannot read those tables or the columns naming a person | `chat_analyst.test.sql` |
| Instructions hidden in data or in earlier messages | Tool results and history are data to the model; no tool acts on text; scope does not come from history | `tests/chat.test.ts` |
| Access removed after a conversation | Scope is read per question; earlier answers about a unit now out of scope are withheld and not sent as context | Reading of `routers/chat.ts`; tool-level test |
| The key reaches the browser | Read only in server code; the built browser bundle was searched for the key, the variable names, the provider address and the prompt: none found | Build of 2026-10-11 |
| Provider errors leak account details | The provider's text is never shown or logged; fixed messages | `tests/chat.test.ts` |
| Markup from the model | Wording rendered as text; tables and charts from a validated schema | Browser check: no markup elements in answers |
| Abuse and cost | 20 questions per person per 10 minutes (`org_settings.rate_limits`), 6 lookups, 60 seconds, bounded sizes | `tests/chat.test.ts` (limits); the rate limit itself was not exercised |
| A wrong figure in the wording | Figures in tables and charts never come from the model; wording that names a figure not in the data gets a visible warning (a heuristic) | `tests/chat.test.ts` |

**Accepted or open:** NVIDIA's terms and limits for the free endpoints have not been reviewed; `chat_reader`
can call functions that `PUBLIC` may execute (none writes, and its transactions are read-only); the rule that
hides earlier answers has no automated test at the router level; expired conversations are removed when the
chat is next opened, not on a schedule.
