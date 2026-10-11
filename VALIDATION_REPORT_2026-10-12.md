# TraceESG — Security regression and application validation, 2026-10-12

_Eighth and last report of the 2026-10-12 audit. Branch `feature-security-audit-fixes`, uncommitted. Everything
ran on this machine against the **local** stack with synthetic accounts and records; nothing touched the
hosted project. No load test and no test against production was run._

A passing suite is not proof that no vulnerability is left. This report says what was executed, what it
showed, and what was not executed.

## 1. Summary

- **The fixes of the earlier stages hold** when exercised through the running application and the database.
- **Validation found four more defects**, all fixed and re-tested here. The most serious: the evidence bundle
  had never worked against the real schema — the earlier fix of one table name only uncovered the next wrong
  column, exactly the residual risk that report had flagged.
- **No regression caused by the fixes was found.** One existing end-to-end check failed, and it turned out to
  disagree with the code on `main` already.
- Two accessibility items remain known-open; the open security items from the earlier reports are unchanged
  (§5).

## 2. Baseline and environment

| | |
| - | - |
| Code under test | `main` at `d7add8c` plus the uncommitted audit changes (82 files changed, 20+ new) |
| Before the audit (measured on `d7add8c` this morning) | Unit 181/181, database 271/271, 14 dependency advisories. The end-to-end suite was not run on the baseline |
| App | Production build (`next build` / `next start`), port 3100 |
| Backend | Local Supabase: Postgres 17 with all 47 migrations, Auth, Storage, API gateway, mail catcher |
| OCR | The existing `traceesg-ocr-worker:latest` image (`rules-13`), started by the suite |
| Browser | Edge, headless, driven by puppeteer |
| Accounts | Created by the suites: an Admin, Project Manager, HR, EHS, Corporate ESG approver, an "outsider" Project Manager on a sibling project, and throwaway accounts |
| AI provider | Replaced by a stand-in that records every outgoing request; the real model was never called |

## 3. Results by category

Status: **Pass** = executed, result as expected. Counts are checks, not files.

| # | Category | What was executed | Expected | Actual | Evidence / limits |
| - | -------- | ----------------- | -------- | ------ | ----------------- |
| 1 | Sign-in, sign-out, sessions | Real sign-in form; session cookie flags; sign-out with a second device signed in; a copy of the old cookie replayed; tampered and made-up cookies; deactivated user; expired session | Cookie HttpOnly, Secure, SameSite=Lax; sign-out ends the session everywhere; forged cookies refused | **Pass** | `audit-regression` (sessions), `authorization`, `edge-cases`. Observed: signing out ends **all** of the person's sessions, and a replayed copy of the old cookie gets 401. Limit: the one-hour token expiry was simulated, not waited for |
| 1 | Password recovery | In a browser: request a code, five wrong codes, then the right one; a fresh request and the right code; old and new password; reuse of the code; audit entry | Five attempts, then refusal even of the right code; a fresh code works once; old password stops working | **Pass** | `audit-regression` F-07. Limit: no email is delivered locally, so the test replaces the stored fingerprint with a known one. A reset still does not end the account's other sessions (known, unchanged) |
| 1 | Setting a password after a link | `/reset-password` with a plain session; a real recovery link; the same link twice; a made-up token; a disallowed link type | Refused without the link's marker; link works once | **Pass** | `audit-regression` F-09 |
| 2 | Roles and server-side authorization | Every Admin-only and permission-gated procedure called as the wrong role, over HTTP | 403, nothing written | **Pass** | `authorization` (42), `audit-regression` (deadlines, validation queue, reports, bundle, delete user) |
| 3 | Cross-user and cross-project | 53 procedures called with a sibling project's ids, as a Project Manager and as a role holding every scoped permission; evidence file, verification data and record evidence over HTTP as the outsider; carbon credits and Control Tower figures | Refused or empty; the other project unchanged | **Pass** | `test:isolation` 107/107; `audit-regression` (evidence files, carbon credits, Control Tower) |
| 4 | Injection, markup, cross-site, redirects | SQL and template text in search and sign-in; an id that is not an id; a display name with markup, then the rendered page; a change sent with another site's origin, and as a GET; a pre-flight from another origin; six hostile return paths after sign-in | Treated as text; escaped; 403 / 405; no access granted; land inside the app | **Pass after a fix** | `audit-regression`. First run: `next=/app/../../evil` was accepted and the browser resolved it to `/evil` — **V-02, fixed** |
| 5 | Uploads | Wrong type, oversized, corrupted, a program renamed `.pdf`, `../` in the file name, another project as target, duplicate, reuse of an upload URL | Refused before or after the bytes are read; storage path chosen by the server | **Pass** | `edge-cases` (34), `audit-regression` (uploads). The `../` file was stored under a server-generated path with no part of the name in it |
| 6 | Rate limits and expensive operations | Sign-in lock-out and reset; upload quota; 21 chatbot questions; 30 lookups in one question; a model that never stops; reset-code attempts; 40 parallel guesses at a reset code | Refused at the limit; nothing sent for a refused question | **Pass** | `authorization`, `test:chatbot`, `audit-regression`, the parallel run of the security stage. Not tested: limits by client address behind a real proxy; report and bundle generation have no limit; no load test (not authorised) |
| 7 | Database policies | All 47 migrations applied to a **fresh** database, then the database suite; the same suite on the working database; the database API called directly with a Project Manager's token and with none | Row-level isolation; no browser write; settings, accounts, carbon and chat tables closed | **Pass** | 312/312 on a fresh database and on the working one; `audit-regression` (database API section), `authorization` (RLS section). The fresh run used a throwaway copy of the stack, removed afterwards |
| 8 | Webhooks | — | — | **Not applicable** | The application has no webhook, OAuth callback or inbound third-party endpoint. The only callback is `/auth/confirm`, tested under 1 |
| 9 | Chatbot | Own project; comparison; a project without permission by name, code, id, search, comparison and ranking; personal data as a non-Admin; requests to change data; the database role tried directly; injection in the question and in data with an obeying model; oversized and repeated requests; provider failures; an Admin's people lookup; other people's conversations; access removed mid-conversation | Scope decided by the server; read-only at the database; nothing of another project or person leaves | **Pass** | `test:chatbot` 49/49. Limit: a scripted model, not the real one |
| 10 | Secrets | Browser bundle searched for every server-only value; the server log of the whole run searched for keys, tokens and test passwords; error bodies; `/.env`, `/.git/config`, source maps, dev endpoints | None present; 404 | **Pass** | Bundle scan (dependency stage); log scan: no server-only value, no token-shaped string, no test password in the log; `audit-regression` (headers and error bodies) |
| 11 | Privacy controls | Cookies before sign-in; other hosts loaded by the landing and sign-in pages; deleting an unused account; deleting an account with records; a non-Admin deleting | No cookie before sign-in; no third-party host; unused account gone from both the profile and sign-in tables; used account refused | **Pass** | `audit-regression` (cookies, hosts, deleting an account). Not testable: consent (none is collected), the privacy notice (does not exist), deletion at Brevo or the AI provider |
| 12 | Accessibility, responsive, journeys | axe-core on 31 routes in three themes, now **with records on screen**; keyboard, skip link, dialogs, reflow at 320px, target size; the upload → OCR → verify → validate → calculate → approve → report journeys for four roles | No violation; journeys complete | **Pass, 2 known open** | `test:a11y` 185 passed, 0 failed, 2 known open (Roles & Permissions and BRSR Disclosures at 320px). Scenarios A–F 158 checks. The run with data exposed one more unreadable table header — **V-04, fixed**. No screen reader |
| 13 | Migrations, build, existing tests | Fresh-database migration run; production build; lint; typecheck; format; unit tests; dependency gate | Clean | **Pass** | 47 migrations, 48 tables, none without RLS; unit 195/195; lint 0 errors; `pnpm audit --prod --audit-level=high` exits 0 with two recorded exceptions |

**End-to-end suite, final run on the fixed build: 342 checks passed, 0 failed across nine scripts**
(Scenario A 32, B 16, C 20, D 33, E 40, F 17, authorization 42, edge cases 34, audit regression 108).
Scenario counts differ by one or two between runs because some checks depend on what earlier runs left in
the database.

After that run one CSS class on one table header changed (V-04); the accessibility checks and the audit
regression script were re-run on the final build, the rest of the suite was not.

## 4. What validation found

| ID | Severity | Finding | How it showed | Fix | Re-test |
| -- | -------- | ------- | ------------- | --- | ------- |
| V-01 | High (a deliverable that did not work) | **The evidence bundle could not be generated for any scope with records.** Six of its queries named columns and tables that do not exist (`r.approved_by`, `c.trace_log`, `cfv.factor_value`, `e.field_key`, `bmm.metric_id`, …). Its unit tests covered only the helper functions. The table-name fix of the security stage removed the first error and left the rest | The regression script's Admin download returned 500; the server log named the column | The queries now follow the schema: verification and approval details come from their own tables, calculations from the engine's stored values, extracted fields from `ocr_fields`; a single-factor calculation is listed with its factor so every factor used appears | A real bundle from local data: 36 files, 21 evidence documents, the report PDF, 23 records, 11 calculations, 12 factor rows, 111 audit events; all 35 checksums verify. The HTTP download test requires a real ZIP |
| V-02 | Low | **A return path with `..` was accepted after sign-in.** `/app/../auth/signout` starts with `/app`, passes the check, and the browser resolves it elsewhere on the same site. It never leaves the site, so it is not an open redirect to another domain, and the destination page still checks the role | `next=/app/../../evil` landed on `/evil` | `safeNextPath` refuses dot segments, encoded or not, and backslashes | Unit test (14 paths); HTTP test with six hostile and two legitimate paths |
| V-03 | — (test) | An end-to-end check expected report snapshot version 3; the code has produced version 4 since the full-BRSR-format change. The suite had not been run since — the same mismatch is on `main` | Scenario D: 32 passed, 1 failed | The check accepts version 3 or later; the arithmetic it guards (break-up by gas equals each scope's total) passes | Scenario D 33/33 |
| V-04 | Low (accessibility) | The evidence-bundle preview table had the unreadable first header cell fixed elsewhere in the UI stage. It only appears when there are records, so the earlier runs on an empty database missed it | axe: contrast 1.07–1.9:1 once the end-to-end run had created records | Standard table header tokens | `test:a11y` 185/0/2 |

Two failures in the first run of the new script were mistakes in the script, not in the product, and were
corrected: it signed out the account it then tried to use, and it expected an error where the verification
screen correctly answers "nothing" for a document the caller may not see.

One run of the existing suite failed entirely at set-up because the local stack had been started without its
mail catcher, which the invite step needs. That was the test environment, not the application.

## 5. State of the earlier findings

**Fixed and confirmed through the running application:** deadlines Admin-only (F-01); carbon credits inside
scope, with a computed ledger check (F-03, F-12); Control Tower figures inside scope (F-04); evidence bundle
permission, scope, error text — and now generation itself (F-06, V-01); reset-code attempts (F-07); set-password
only after a link (F-09); reports need the permission (F-11); HttpOnly session cookies (F-13); CSV formula
text (unit test); validation queue (D-02); settings Admin-only at the database (D-03); ownership and ledger
rules at the database (D-04 to D-06, database tests); chatbot data minimisation and audit entries (C-01 to
C-04); no framework header, API never cached, robots file (P-series).

**Still open — none newly exploitable, all recorded before:**
- Accounts created by bulk import **before** the fix keep their guessable password until reset (F-02).
- Per-address rate limits trust `X-Forwarded-For` (F-08) — depends on the host.
- Content-Security-Policy allows inline scripts (F-10).
- A password reset does not end the account's other sessions; a wrong-password lock-out can be triggered by
  anyone who knows an email (F-18).
- No limit on report or bundle generation; the bundle is built in memory.
- Two pages do not fit a 320px window; charts lack text alternatives; the custom cursor hides the system
  pointer.
- No privacy notice, retention periods or erasure process.

## 6. Not run, and why

| Test | Why |
| ---- | --- |
| The real NVIDIA model | It would send data to an outside service with the owner's key; a stand-in was used |
| Email delivery (reset code, account email, reminders) | Brevo is not configured locally; codes were injected at the database |
| Anything on the hosted project, including migration `0047` | No authorisation to change or probe shared infrastructure |
| The changed CI workflow | It runs only on a pull request or a push to `main` |
| A rebuilt worker image in the end-to-end run | The suite used the existing image; the worker changes (error reporting, pip) are in the `Dockerfile` and source only |
| The OCR integration harness | Needs the worker's full Python environment (PaddleOCR), which this checkout does not have |
| Real session expiry after an hour; rate limits by address behind a proxy | Time and infrastructure |
| Load, stress and denial-of-service tests | Not authorised, and destructive by nature |
| Screen reader, real phone, the Special and Dark themes by eye | Need a person |
| The UI screenshot pass on the final build | Done at the UI stage; the accessibility checks were repeated instead |

## 7. Still needed from a person or the infrastructure

1. In a browser, once: an invite link end to end, and downloading and opening one evidence bundle as an
   Admin (both now pass in automated tests, but nobody has looked at them).
2. Reset the passwords of accounts created by bulk import before today.
3. Push migration `0047` to hosted after its check query; rebuild the worker image and recreate the container.
4. Open the pull request and watch the first run of the changed CI workflow.
5. The dashboard checklist in `DEPENDENCY_AUDIT_2026-10-12.md` §6 and the manual script in
   `ACCESSIBILITY_AUDIT_2026-10-12.md` §6.
6. A third-party penetration test before production.

## 8. How to repeat

With the local stack running (including the mail catcher), a production build on port 3100 using a
local-only env file, and a browser path set:

```
pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm db:test
pnpm --filter web test:e2e          # nine scripts; audit-regression is the last
pnpm --filter web test:isolation
pnpm --filter web test:chatbot
pnpm --filter web test:a11y
```

`E2E_ENV_FILE`, `E2E_APP_URL`, `E2E_PYTHON` (a Python with `pypdfium2`, `pillow`, `numpy`) and
`CHROMIUM_EXECUTABLE_PATH` select the environment. Every script refuses a database that is not local.

The local database now holds what these suites create (their accounts, records and documents); that is how
the end-to-end suite is designed.
