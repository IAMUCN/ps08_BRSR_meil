# TraceESG — Security audit, 2026-10-12

_Audited commit: `d7add8c` (`main`). Fixes are on branch `feature-security-audit-fixes`, **uncommitted**, no
migration, nothing pushed, nothing done on the hosted project._

An internal review by reading the code and exercising the changed queries on the local database. It is not a
penetration test. Nothing here says the application is secure or legally compliant: it lists what was found,
what was fixed, how each fix was checked, and what was not looked at.

## 1. Executive summary

The foundations hold: every tRPC procedure needs an active session, all writes go through the server, SQL
is parameterised everywhere, uploads are re-verified on the server, evidence and reports are never public,
RLS is on for all 48 tables, the audit log is append-only, and no secret was found in the repository or its
history.

The problems were concentrated in features added after the Phase 18 review (deadlines, carbon credits, the
evidence bundle, bulk import): they read through the server's own connection, which bypasses RLS, without
the scope checks the older code has.

| Severity | Found | Fixed | Open |
| -------- | ----- | ----- | ---- |
| Critical | 0 | — | — |
| High | 5 | 4, and 1 in part | dependency `xlsx` (in F-05) |
| Medium | 9 | 6 | F-08, F-10, F-14 |
| Low / Info | 10 | 0 | all listed in §5 |

## 2. Architecture and trust boundaries

- **Web app** `apps/web`: Next.js 16 App Router, tRPC 11 at `/api/trpc`, Server Actions, three file routes
  (`/api/documents/[id]/file`, `/api/reports/[id]/file`, `/api/reports/bundle`), `/auth/confirm`,
  `/auth/signout`. `proxy.ts` refreshes the session and redirects; it does not authorize.
- **Identity**: Supabase Auth (cookie session, no self sign-up, passwords hashed by Supabase — the app never
  stores one). `lib/auth/session.ts` resolves user, roles and permissions on every request through the
  user's own RLS-limited client, calling `getUser()` so a banned user is refused.
- **Database**: Postgres with RLS on every table and no browser write grants. The server writes through
  `lib/db.ts` (direct connection) and `lib/supabase/admin.ts` (service role); **both bypass RLS**, so there
  the procedure's own check is the only boundary.
- **Storage**: two private buckets, no client policies, no download signed URLs.
- **OCR worker**: Python, polls Postgres, service-role key, non-root container, no inbound port.
- **Third parties**: Brevo SMTP, NVIDIA NIM (chatbot), Sentry (off unless configured). No webhooks.
- **Hosting**: undecided; F-08 and the HSTS/TLS items depend on it.

## 3. Findings fixed

Each lists: where, what an attacker could do, the fix, the regression test, and what remains.
"Static test" means a unit test that reads the source file — it stops the fix being undone, it does not
exercise the running procedure.

### F-01 · High · Deadline data with names and emails open to every signed-in user
- **Where:** `lib/trpc/routers/deadlines.ts` (`list`, `kpis`); data from `lib/deadlines/service.ts`.
- **Expected / actual:** Admin only (the page is under `/admin`) / any active account could call
  `/api/trpc/deadlines.list` and receive every org unit's tasks with the display name, email and role of
  owners, Project Managers, Corporate ESG users and Admins.
- **Fix:** both procedures are `adminProcedure`.
- **Test:** static test in `tests/security.test.ts`. **Residual:** none known.

### F-02 · High · Guessable initial passwords for bulk-imported accounts
- **Where:** `lib/users/rules.ts`, used by `users.bulkImport`.
- **Expected / actual:** an unpredictable secret / `<FirstName>@<EmployeeId>` plus fixed filler, with no
  forced change — a colleague's first guess would be right.
- **Fix:** `generateInitialPassword()` — 16 random characters from the platform's cryptographic generator,
  always meeting the policy, no look-alike characters. The import flow is otherwise unchanged (emailed once,
  shown to the importer when email is not configured).
- **Test:** `tests/admin-rules.test.ts` (200 passwords: policy, uniqueness, character set).
- **Residual:** (a) **accounts already created by bulk import keep their old guessable password — reset
  them.** (b) The password still travels by email in clear text and nothing forces a change at first
  sign-in. Creating the account with no password and using the emailed-code reset would remove both; that
  changes the import flow and is the owner's decision.

### F-03 · High · Carbon-credit procedures ignored org scope
- **Where:** `lib/trpc/routers/carbonCredits.ts` (all eleven procedures).
- **Expected / actual:** a holder of `carbon_credit.view` (which migration `0046` gives to Project Manager)
  sees their own part of the organisation / `reconciliation` returned any org unit's approved Scope 1/2/3
  totals; `list`, `summary`, `icpList` returned the whole organisation; `mint`, `retire`, `transfer`,
  `icpCreate`, `evaluateCapex` accepted any org unit; `options` listed every unit to any signed-in user.
- **Fix:** new `lib/auth/scope.ts` (`scopedOrgUnitIds`, `inOrgScope`, `assertOrgScope`, built on
  `org_unit_tree`); reads are filtered to the caller's scope, writes refuse a unit or batch outside it
  (a batch out of scope reads as "not found"); `options` needs `carbon_credit.view`.
- **Test:** unit tests of the helper with a stand-in connection; static test that each procedure uses it;
  on the local database a batch held by the group was hidden from a project-level user and visible to an
  Admin.
- **Residual:** the procedures were not called through the running app. All their callers are Admin pages,
  so no page changes behaviour.

### F-04 · High · Control Tower figures not limited by org scope
- **Where:** `lib/trpc/routers/records.ts` (`summary`, `kpiTrends`), permission `monitoring.view`, held by
  Corporate ESG, which can be assigned below the group.
- **Actual:** any org unit's pipeline and KPI totals for any holder. **Fix:** `assertOrgScope` on the
  resolved org unit. **Test:** helper tests. **Residual:** not exercised through the app.

### F-05 · High · Dependencies with published advisories
- **Where:** `apps/web/package.json`. `pnpm audit --prod` before: 14 (1 critical, 7 high).
- **Fix:** `next` and `eslint-config-next` 16.3.5 → **16.3.8** (the critical `next/og` issue was not
  reachable — the app does not import it — but the release also fixes an Image Optimization SSRF and
  cache-poisoning issues). Production build, typecheck, lint and unit tests pass on it.
- **After: 7 (6 high, 1 moderate), all open:** `xlsx` 0.18.5 ×2 (prototype pollution, ReDoS; no fixed
  version on npm; parses, in the browser, a sheet the user chose — replace its reading with `exceljs` or
  SheetJS's own distribution); `sharp` and `source-map-js` inside `next` (wait for a Next release);
  `braces` and `@modelcontextprotocol/sdk` inside `shadcn`, a build-time CLI that `globals.css` imports a
  stylesheet from (not moved to dev dependencies: a host that skips them would fail the build); `uuid` in
  `exceljs`.

### F-06 · Medium · Evidence bundle: wrong table name, error text sent to the browser, no permission
- **Where:** `lib/reports/bundle.ts`, `app/api/reports/bundle/route.ts`, `reports.bundlePreview`.
- **Actual:** (a) the bundle read `public.audit_log`; the table is `audit_logs`, so a download for a scope
  with records failed — the local database confirms the old name does not exist (42P01) and the corrected
  query runs. (b) The 500 response carried the raw error text. (c) Neither the route nor the preview asked
  for a permission: any in-scope user would have received audit entries and people's names without
  `audit.view`.
- **Fix:** table name; the response says only "Failed to generate evidence bundle" (cause stays in the
  server log); both now need `report.generate` plus org scope.
- **Test:** static tests; the audit query run on the local database.
- **Residual:** **a full bundle was not generated and opened** — other faults may sit behind the one fixed.
  _Update, validation stage:_ they did. Five more queries used columns that do not exist; all are fixed and a
  real bundle now generates and verifies (`VALIDATION_REPORT_2026-10-12.md`, V-01). A return path with `..`
  accepted after sign-in was also found and fixed there (V-02).
  The ZIP is built in memory with no rate limit (now reachable only with `report.generate`).

### F-07 · Medium · Password-reset code: parallel guesses could pass the 5-try limit
- **Where:** `app/forgot-password/actions.ts`.
- **Actual:** the attempt count was read, compared, then incremented in separate statements.
- **Fix:** every guess first claims an attempt in one `update … where attempts < max … returning`; the code
  is compared in constant time.
- **Test:** on the local database, 40 guesses over 10 parallel connections: exactly 5 granted; an expired
  code grants none. Static test for the statement.
- **Residual:** a reset still does not end the account's other sessions; F-08 below.

### F-09 · Medium · A signed-in session could set a new password without the old one
- **Where:** `/reset-password` (`page.tsx`, `actions.ts`), reached after `/auth/confirm`.
- **Actual:** any live session could post a new password there, sidestepping Profile's current-password
  check — a stolen or unattended session became a permanent takeover.
- **Fix:** `/auth/confirm` sets a 15-minute HttpOnly cookie scoped to `/reset-password` when the emailed
  link was valid; the page and the action refuse a session without it and clear it on success
  (`lib/auth/password-setup.ts`).
- **Test:** static test. **Residual: not tried in a browser** — follow one invite link end to end before
  merging. Someone who waits more than 15 minutes on the form must ask for a new link.

### F-11 · Medium · Reports were scope-checked when generated but not when read
- **Where:** `reports.list`, `get`, `reportedRecord`, `/api/reports/[id]/file`.
- **Actual:** only `report.generate` was checked. Latent — by the seed only Admin holds it.
- **Fix:** all four filter by the caller's org scope. **Test:** the filter run on the local database with
  an Admin (all rows), a scoped user and a user with no assignment (no rows).

### F-12 · Medium · A hard-coded "integrity check passed"
- **Where:** `carbonCredits.reconciliation`.
- **Actual:** returned `passed: true` and "Reconciliation verified" without checking anything.
- **Fix:** the result is computed on each call — it fails when any batch held by the org unit has more
  retired and transferred than it holds, and says how many. `evaluateCapex` now writes an audit entry in
  the same transaction as the row it stores.
- **Test:** on the local database an over-allocated batch moved the count from 0 to 1. Static test.
- **Residual:** when no carbon price is configured the procedures still fall back to 2,500 — an invented
  figure. Returning "not configured" changes what the page receives, so it is left for the ui role.

### F-13 · Medium · Session cookies were readable by scripts
- **Where:** `lib/supabase/server.ts`, `proxy.ts` (Supabase's default cookies are not HttpOnly).
- **Actual:** with `script-src 'unsafe-inline'` (F-10), any script injection could read the access and
  refresh tokens. No code in the browser uses a Supabase client, so nothing needs to read them.
- **Fix:** `HttpOnly`, `SameSite=Lax`, and `Secure` in production (`lib/supabase/cookie-options.ts`).
- **Test:** unit test of the options and their use. **Residual: sign-in, refresh and sign-out were not
  tried in a browser after this change.** `Secure` means a production build must be served over HTTPS
  (or `localhost`).

### F-15 · Medium · CSV exports could carry spreadsheet formulas
- **Where:** `lib/reports/bundle-utils.ts` (`toCsv`), the audit-trail and records exports, the bulk-import
  results sheet.
- **Actual:** a file name or reason such as `=HYPERLINK(…)` typed by any uploader would run as a formula
  when an Admin or assurer opened the export.
- **Fix:** `lib/csv.ts` — text starting with `= + - @`, tab or carriage return gets a leading apostrophe;
  numbers are untouched. **Test:** `tests/security.test.ts`.

## 4. Findings open

| ID | Sev. | Finding | Why not fixed here |
| -- | ---- | ------- | ------------------ |
| F-08 | Medium | Per-address rate limits (sign-in, reset code) trust the first `X-Forwarded-For` entry (`lib/security/rate-limit.ts`). Correct on Vercel; spoofable on a host that passes the header through. | Depends on the host, which is undecided. |
| F-10 | Medium | Content-Security-Policy allows inline scripts and has no `default-src` / `connect-src` (`next.config.ts`). | Needs per-request nonces; a larger change best done with a browser to test in. |
| F-14 | Medium | `validation.review` procedures (`routers/validation.ts`) have no org-scope check. Latent: only Admin holds the permission by the seed. | **Fixed afterwards** in the database audit (`DATABASE_AUDIT_2026-10-12.md`, D-02), as was F-16 (D-03). |
| F-16 | Low | `org_settings` is readable by every signed-in user through the database API, and now also holds turnover and assurance inputs. | Needs a migration and an owner decision. |
| F-17 | Low | `/forgot-password` emails only existing accounts, so response time reveals whether an address is registered. | |
| F-18 | Low | Five wrong passwords lock any known email out of sign-in for 15 minutes (by design, F1 of the earlier review). | Trade-off; CAPTCHA is the usual answer. |
| F-19 | Low | Deadline emails fall back to `http://localhost:3000` when `NEXT_PUBLIC_APP_URL` is unset. | Set it at deployment. |
| F-20 | Low | `pnpm dev` binds `0.0.0.0`; with `.env.local` naming the hosted project the dev server is reachable on the local network. | Owner's working setup. |
| F-21 | Low | Rate-limit check and count are two statements (small over-run under concurrency). | |
| F-22 | Low | No privacy notice or terms in the app; names, work emails and employee IDs are processed (DPDP Act 2023); users cannot be erased once audit-logged; Admin chatbot answers send names and emails to NVIDIA. | Needs the owner and legal review, not code alone. |
| F-23 | Low | Native cursor suppressed site-wide; `<CustomCursor />` mounted twice (`app/layout.tsx`); `landing.css` has no reduced-motion rule. | ui role; not measured in a browser. |
| F-24 | Info | A refused request returns 429 without `Retry-After`. | |
| F-25 | Info | CI does not run `pnpm audit`, the build or the end-to-end suite. | |
| F-26 | Info | Still open from before: rotate the hosted database password; hosted Auth settings; Supabase per-IP limits. | Owner. |

## 5. Checklist coverage

| Area | Result |
| ---- | ------ |
| SQL injection | No string-built SQL found: every query is a postgres.js tagged template or the Supabase client; search words are bound and their `%`, `_`, `\` escaped; no user-controlled sort or column. No `sql.unsafe`. |
| XSS | One `dangerouslySetInnerHTML`, a constant. Chat answers render as text; link blocks must match a fixed pattern. Report HTML is escaped and rendered with JavaScript and network off. CSP: F-10. |
| CSRF | Cookie session. tRPC mutations need a same-origin `Origin`; Server Actions have Next's check; GET never mutates. Cookies `SameSite=Lax`, now HttpOnly (F-13). |
| File upload | Server-chosen path, declared type and size checked, bytes re-read and re-hashed, real type detected, private bucket, sandboxed serving. No malware scan (files are only shown and OCR'd, never executed). |
| BOLA / IDOR | F-01, F-03, F-04, F-06, F-11 fixed; F-14 open. Documents, records, approvals, consolidation, forecast, simulator, notifications were read and check scope or ownership. |
| Rate limiting | Sign-in, reset code, uploads, chatbot: database-backed. F-07 fixed; F-08, F-21, F-24 open; no limit on bundle or report generation. |
| JWT | Issued and verified by Supabase; the app verifies on every request and holds no signing key. |
| Secrets | Only `NEXT_PUBLIC_SUPABASE_URL`, `…_ANON_KEY`, `…_APP_URL` are public. Service modules import `server-only`. Pattern scan of the whole git history: no key, token or database URL. No browser source maps. |
| Password storage | Supabase Auth; none in the app's tables. Reset codes stored as SHA-256 (six digits, ten minutes). |
| CORS | No CORS headers are set anywhere: same-origin only. |
| Token storage | `localStorage` holds only the theme and the chat pane's open flag. |
| Server-side permissions | Every procedure is protected, Admin or permission-gated; none is public. |
| RLS | Enabled on all 48 tables; browser roles have read-only grants plus one column. Policies were surveyed, not re-tested line by line (the pgTAP suite covers them and was not re-run — no migration changed). |
| Webhooks | None exist. |
| SSRF, redirects, traversal, command injection | Outbound calls go only to Supabase, Brevo and the configured model endpoint; redirect targets are validated or fixed; archive and storage paths come from UUIDs; no shell or `eval`. |
| Logs and errors | Unexpected errors are logged on the server and reported generically; F-06(b) was the exception. Sentry's data collection is switched off. |

## 6. Tests run

| Check | Result |
| ----- | ------ |
| Web unit tests (`pnpm test`) | **188 / 188** (181 before; 7 new in `security.test.ts`, the generator test rewritten) |
| Typecheck, lint, format check | pass (lint: 5 warnings, all in files this change did not touch) |
| Production build on Next 16.3.8 | pass |
| `pnpm audit --prod` | 14 → 7 advisories |
| Changed queries on the local database (writes rolled back) | **17 / 17** |

For the last row, migration `0046` was applied to the **local** database, which did not have it.

**Not run:** the database (pgTAP) suite, the end-to-end suite, the OCR worker's tests, any browser pass,
anything against hosted. **No procedure was called through the running app**, so F-03, F-04, F-06, F-09,
F-11 and F-13 are checked at the level of their queries and helpers only.

**Not reviewed line by line:** `organization.ts`, `verification.ts`, `bundles.ts`, `brsr.ts`,
`chat/tools.ts`, the individual RLS policies of migrations `0001`–`0045`, the worker's Python.

## 7. Files changed

New: `lib/auth/scope.ts`, `lib/auth/password-setup.ts`, `lib/supabase/cookie-options.ts`, `lib/csv.ts`.
Changed: `lib/trpc/routers/{deadlines,carbonCredits,records,reports,users}.ts`, `lib/users/rules.ts`,
`lib/reports/{bundle,bundle-utils}.ts`, `lib/supabase/server.ts`, `lib/bulk-import/xlsx.ts`, `proxy.ts`,
`app/api/reports/bundle/route.ts`, `app/api/reports/[reportId]/file/route.ts`, `app/auth/confirm/route.ts`,
`app/forgot-password/actions.ts`, `app/reset-password/{page.tsx,actions.ts}`,
`tests/{security,admin-rules}.test.ts`, `package.json`, `pnpm-lock.yaml` (Next 16.3.8).
In the ui lane, one line each for the CSV fix: `app/admin/audit-trail/audit-view.tsx`,
`components/records/records-explorer.tsx`.

## 8. Before merging and before go-live

- [ ] In a browser: sign in, stay signed in across a token refresh, sign out (F-13); follow an invite link
      and set a password (F-09); download one evidence bundle and open it (F-06).
- [ ] Run the database and end-to-end suites.
- [ ] Reset the password of every account that was created by bulk import (F-02).
- [ ] Decide: bulk import with no password at all (F-02); the price fallback (F-12).
- [ ] Deployment: confirm how the host sets `X-Forwarded-For` (F-08); set `NEXT_PUBLIC_APP_URL`; serve over
      HTTPS only; rotate the hosted database password; hosted Auth settings.
- [ ] Review who holds `carbon_credit.*`, `monitoring.view`, `report.generate`, `audit.view`.
- [ ] Replace `xlsx`; add `pnpm audit` to CI; nonce-based CSP (F-10); scope on the validation queue (F-14).
- [ ] Privacy notice and a DPDP review; NVIDIA's terms before real data reaches the chatbot.
- [ ] A third-party penetration test before production.
