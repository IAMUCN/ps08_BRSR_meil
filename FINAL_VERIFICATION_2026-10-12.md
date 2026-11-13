# EmeilSG — Final security and compliance verification, 2026-10-12

_Closes the 2026-10-12 audit. Branch `feature-security-audit-fixes` on top of `main` at `d7add8c`:
82 files changed, 22 new, **nothing committed, nothing pushed, nothing changed on hosted or in any dashboard**._

**This is not a security certification.** It does not say the application has no vulnerabilities, complies
with any law, or is ready for production. It says what was verified, how, what failed or stays open, and what
cannot be verified from this repository at all. The application has never been deployed, so every
infrastructure control is unverified.

## 1. How this verification was done

Each fix was re-derived from the source as it stands now — not from the earlier reports — and then
exercised: the gates and scope calls were re-read file by file, the whole changeset was inspected, and every
suite was re-run on the final tree against a local stack (Postgres with all 47 migrations, Auth, Storage,
mail catcher), through a production build of the app, with synthetic accounts.

| Suite (final tree) | Result |
| ------------------ | ------ |
| Unit tests | 195 / 195 |
| Database tests (pgTAP) — working database | 312 / 312 |
| Database tests — fresh database, all 47 migrations applied from nothing | 312 / 312 (run earlier today; no migration file changed since) |
| End-to-end through the app, nine scripts, real OCR worker image | 344 / 344 |
| — of which the audit regression script (`tests/e2e/audit-regression.mjs`) | 110 / 110 |
| Cross-project calls to the real procedures (`test:isolation`) | 107 / 107 |
| Chatbot with a scripted hostile model (`test:chatbot`) | 49 / 49 |
| Accessibility in a browser, three themes, with data (`test:a11y`) | 185 passed, 0 failed, 2 known open |
| Lint, typecheck, format, production build | pass (lint: 5 warnings in files not touched) |
| Dependency gate (`pnpm audit --prod --audit-level=high`) | pass, 2 recorded exceptions |

Baseline on `d7add8c` this morning: unit 181, database 271, 14 dependency advisories.

## 2. Findings by severity and status

Counted once each across the seven reports (duplicates merged).

| Severity | Total | PASS (fixed and verified) | PARTIAL | FAIL (open) |
| -------- | ----- | ------------------------- | ------- | ----------- |
| Critical | 0 | — | — | — |
| High | 6 | 4 | 2 | 0 |
| Medium | 17 | 13 | 2 | 2 |
| Low | 27 | 8 | 1 | 18 |
| Informational | 10 | — | — | — |

Found by the final verification itself: one more Low item (development widget code shipped in the production
bundle), fixed and included above.

### High

| ID | Finding | Status | Where the fix is | Evidence the attack path is closed |
| -- | ------- | ------ | ---------------- | --------------------------------- |
| F-01 | Any signed-in user could read every org unit's deadline tasks with staff emails | **PASS** | `lib/trpc/routers/deadlines.ts:28,36` (both `adminProcedure`) | Over HTTP a Project Manager gets 403 for the list and the figures; an Admin gets the data; no staff email in the non-Admin's answer |
| F-03 | Carbon-credit procedures ignored org scope | **PASS** | `lib/trpc/routers/carbonCredits.ts` — all ten procedures call the scope helper (`lib/auth/scope.ts`) | Own project 200; sibling and group 403; a batch outside scope is invisible and cannot be retired; no transaction written |
| F-04 | Control Tower figures open to any `monitoring.view` holder for any unit | **PASS** | `lib/trpc/routers/records.ts:136,150` | Corporate ESG at a subsidiary: own subsidiary 200, group 403 |
| V-01 | The evidence bundle could not be generated: six queries used columns that do not exist | **PASS** | `lib/reports/bundle.ts` (queries rewritten to the schema); `app/api/reports/bundle/route.ts:46-47,96` | An Admin's download returns a real ZIP; a generated bundle held 36 files with all checksums verified; anonymous 401, Project Manager 403; a failing request returns a fixed message |
| F-02 | Bulk-imported accounts had guessable passwords | **PARTIAL** | `lib/users/rules.ts:42` (`generateInitialPassword`, cryptographic source), used at `lib/trpc/routers/users.ts:608` | New accounts: verified by unit test (200 passwords, policy, uniqueness). **Not closed:** accounts created before the fix keep their old password until someone resets them; the new password is still emailed in clear text and no change is forced |
| F-05 | 14 dependency advisories, one critical | **PARTIAL** | `apps/web/package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | 12 removed. Two remain with no fixed version (`braces` through a build-time tool; `uuid` inside `exceljs`, which calls only the unaffected function) — recorded with reasons and enforced by the CI gate |

### Medium

| ID | Finding | Status | Evidence / what remains |
| -- | ------- | ------ | ----------------------- |
| F-06 | Bundle: no permission check, raw error text | **PASS** | HTTP tests above |
| F-07 | Reset-code attempts could be raced past the limit | **PASS** | Browser flow: five wrong codes, then the right one refused; 40 parallel guesses, 5 granted |
| F-09 | A session could set a password without the old one | **PASS** | `/reset-password` without the link's marker redirects away; a real recovery link works once |
| F-11 | Reports not scope-checked on read | **PASS** | `reports.ts:278,320,378`, file route `:27`; isolation run with a role holding the permission |
| F-13 | Session cookies readable by scripts | **PASS** | `Set-Cookie` on sign-in: HttpOnly, Secure, SameSite=Lax; sign-out revokes every session |
| F-14 / D-02 | Validation queue without scope | **PASS** | `validation.ts:42,122`; isolation run |
| F-15 | CSV exports could carry formulas | **PASS** | Unit test (`lib/csv.ts`) |
| D-03 | Settings readable by every signed-in user at the database | **PASS** | Database test and a direct database-API call with a Project Manager's token: no rows |
| D-04, D-05 | A record or document could be moved, or linked across org units | **PASS** | Database tests; a direct API attempt to move a record changes nothing |
| D-06 | Carbon ledger could be over-drawn | **PASS** | Database tests (trigger and constraints) |
| C-01, C-02 | Emails, employee ids and file names sent to the AI provider | **PASS** | Captured provider requests contain none of the three; the app-drawn table still does |
| F-12 | A hard-coded "integrity check passed" | **PARTIAL** | The check is now computed. An invented price of ₹2,500 is still shown when none is configured |
| P-11 | Worker error reports would include stack-frame variables | **PARTIAL** | Fixed in `worker/logs.py` and verified by loading it in the existing image. **Not deployed:** the image has not been rebuilt |
| F-08 / P-02 | Per-address rate limits trust `X-Forwarded-For` | **FAIL** | Unchanged. Correct only on a host that overwrites the header |
| F-10 / P-01 | Content-Security-Policy allows inline scripts | **FAIL** | Unchanged. Needs per-request nonces |

### Low — still open (18)

Response time reveals whether an email is registered · five wrong passwords lock any known email out for 15
minutes · deadline emails fall back to `localhost` without `NEXT_PUBLIC_APP_URL` · the dev server binds all
interfaces while pointed at the hosted project · rate-limit check and count are two statements · no privacy
notice · every signed-in user can read all display names · reference and factor tables readable by every
signed-in user · the app connects with an all-powerful database role · names appear in the chatbot's system
message · no concurrency cap or `Retry-After` on the chatbot · conversations purged only when the chat is
opened · the chatbot's database role is scoped by the application, not the database · `.env.production.local`
with hosted settings on this machine · worker packages unpinned · email TLS not required · CI does not build
or run the browser suites · the seed file sets a known local password for the chatbot role.
**PARTIAL:** the custom cursor (mounted once now; still hides the system pointer everywhere).

## 3. Requirement-by-requirement status

| # | Requirement | Status | Basis |
| - | ----------- | ------ | ----- |
| 1 | Critical and High attack paths blocked | **PARTIAL** | 4 of 6 PASS; F-02 and F-05 as above |
| 2 | Medium and Low rechecked, unresolved risks documented | **PASS** (as a documentation requirement) | §2; two Medium and eighteen Low remain open |
| 3 | Server-side authorization and project isolation across endpoints | **PASS** for what was exercised | Every procedure's gate re-read; 53 id-taking procedures called cross-project twice (107), plus file routes, verification mutations and carbon credits over HTTP. **NOT TESTED:** the `organization`, `brsr` and `users` management procedures beyond their permission gate — they are organisation-wide by design and Admin-held |
| 4a | Database policies | **PASS** | 48 tables, none without RLS; 312 database tests on a fresh and on the working database; direct database-API calls as a user and without one |
| 4b | Secrets | **PASS** locally | No server-only value in the browser bundle or the server log; none in the changeset or history scan. **NOT TESTED:** the hosted environment. The hosted database password was shared in chat earlier and is still to be rotated |
| 4c | Token handling | **PASS** | HttpOnly Secure cookie; tampered, made-up and replayed-after-sign-out cookies refused. **NOT TESTED:** a real one-hour expiry |
| 4d | File uploads | **PASS** | Wrong type, oversized, corrupted, disguised program, `../` in the name, other project, duplicate, URL reuse. No malware scanning exists (files are displayed and read, never executed) |
| 4e | Rate limits | **PARTIAL** | Sign-in, reset code, upload and chatbot limits verified. Per-address limits spoofable off Vercel (F-08); none on report or bundle generation |
| 4f | Webhook verification | **NOT APPLICABLE** | No webhook, OAuth callback or inbound third-party endpoint exists |
| 4g | AI data access | **PASS** with a stated limit | 49 checks with a model scripted to misbehave. **NOT TESTED:** the real provider and model |
| 5 | No new tracking, SDKs, fake content or extra collection | **PASS** | Dependency changes: `next` patch, `xlsx` source, `axe-core` (dev), `@types/jszip` removed. Pages load nothing from another host. The audit *reduced* what goes to the AI provider and the audit log. One pre-existing item found and fixed: the dev feedback widget's code was in the production bundle |
| 6 | Privacy notices, cookie controls, legal pages, business details, deletion match behaviour | **FAIL** | None of the documents exists. Cookie controls are **NOT APPLICABLE** today (only strictly necessary storage, verified). Account deletion behaves as the code says (verified both ways) but no process or notice describes it. A draft notice exists for a lawyer; it is not published |
| 7 | Accessibility and design fixes without breaking function | **PARTIAL** | Automated and scripted checks pass with 2 known open; all journeys still pass end to end. **NOT TESTED:** screen reader, keyboard by a person, real phone, Special and Dark themes by eye |
| 8 | Tests, scans, build and regression re-run | **PASS** | §1 |
| 9 | Changeset inspection | **PASS** | No debug statement, disabled check, skipped test or secret-shaped string in added lines; every removed authorization line is replaced by a call to the shared scope helper; test files hold only the local stack's standard credentials |
| 10 | Deployment-dependent requirements identified | **PASS** (identified, not met) | §5 |

## 4. Failed tests and unresolved vulnerabilities

**Failing tests on the final tree:** none. **Known open in the test suites:** Roles & Permissions and BRSR
Disclosures do not fit a 320px-wide window (reported as OPEN on every accessibility run).

**Unresolved, in order of risk:**
1. Accounts already created by bulk import have guessable passwords (F-02) — an operational action, not code.
2. Client-address rate limits can be bypassed on a host that passes `X-Forwarded-For` through (F-08).
3. Inline scripts are allowed by the Content-Security-Policy (F-10); the HttpOnly cookie now limits what an
   injected script could take.
4. A password reset does not end the account's other sessions.
5. No rate limit on report or bundle generation; the bundle is built in memory.
6. The fallback carbon price is an invented figure with an invented source (F-12, compliance report).

## 5. Infrastructure requirements not verifiable from source

| Area | Required | State |
| ---- | -------- | ----- |
| Hosted database | Migration `0047` pushed (after its check query); password rotated; `chat_reader` given a password by hand, never through the seed | **NOT TESTED** — hosted was not touched |
| Supabase Auth | Sign-ups off; 12-character policy with four classes; site URL and redirect list on the production domain; per-IP limits raised; custom SMTP | Dashboard |
| Backups | Schedule or point-in-time recovery; who may download | Dashboard |
| Web host | Server-only settings in a secret store; `NEXT_PUBLIC_APP_URL`; HTTPS only (the session cookie is Secure); what the host writes into `X-Forwarded-For`; memory and time-out for PDF and bundle generation | Host not chosen |
| Worker host | Always-on, about 2 GB, no inbound port; image rebuilt from the changed `Dockerfile` | Host not chosen; image not rebuilt |
| DNS and TLS | Custom domain, certificate, HTTP→HTTPS redirect, HSTS effective on the real domain | Nothing exists yet |
| Email | Verified sender with SPF, DKIM, DMARC; SMTP key as a secret | Dashboard |
| AI provider | Terms reviewed, or a model served inside the network | Owner |
| GitHub | Branch protection, required CI, secret scanning; the changed workflow has **never run** | Not verifiable here |
| Webhooks | — | **NOT APPLICABLE** |
| Monitoring | Alerts for a stopped worker, failed reports, bursts of failed sign-ins | None exists |

## 6. Remaining risks outside security

- **Legal and privacy.** No privacy notice, terms, operator identity, retention periods or request process.
  The audit log keeps IP addresses permanently; OCR text of every upload is kept indefinitely; a deleted
  user's email stays in the audit log. Which law applies and what it requires is a lawyer's call.
- **Claims.** Landing wording that is not supported as written ("Portfolio-Wide Deployment for MEIL", "by
  MEIL. All rights reserved" against a GPL-2.0 licence file, an absolute "No" on OCR errors); six photographs
  with no recorded licence.
- **Accessibility.** No person or screen reader has tested anything. Charts lack text alternatives; Admin
  forms do not tie errors to fields; the session ends without warning; the system pointer is hidden.
- **Operations.** One shared hosted project serves as "development" with no staging; the hosted OCR worker
  runs on this machine's Docker and stops when it does; no monitoring.
- **Evidence of correctness.** OCR accuracy on real MEIL documents, the real AI model, email delivery and
  the report PDF on the production host are untested.

## 7. Release checklist, in priority order

**Before anything is merged**
1. Review and commit this branch; open the pull request; watch the first run of the changed CI workflow.
2. By hand in a browser: follow one invite link; download and open one evidence bundle as an Admin.

**Before anyone outside the team signs in**
3. Reset the password of every account created by bulk import before today.
4. Run the check query, then push migration `0047` to hosted; rotate the hosted database password.
5. Rebuild the worker image and recreate the container.
6. Decide: `xlsx` from the vendor's site or drop `.xls`; contact details kept out of the AI provider
   (changed today); what the carbon page shows with no price configured; the custom cursor.

**Before production**
7. Choose the hosts; set secrets, `NEXT_PUBLIC_APP_URL`, HTTPS, domain; confirm the forwarded-address
   header and fix F-08 for that host.
8. Nonce-based Content-Security-Policy (F-10); rate limits on report and bundle generation; end other
   sessions on password reset.
9. Supabase Auth settings, custom SMTP, backups; sender domain records for email.
10. Privacy notice, terms, operator details and retention periods, reviewed by a lawyer and linked from the
    sign-in page and footer; correct the landing claims; confirm image licences.
11. A keyboard and screen-reader pass by a person; the two reflow pages; chart alternatives.
12. Monitoring and alerts; a staging project separate from production.
13. Re-run the whole regression set against staging; then a third-party penetration test.

## 8. The reports

`SECURITY_AUDIT` · `DATABASE_AUDIT` · `CHATBOT_AUDIT` · `COMPLIANCE_AUDIT` · `UI_AUDIT` ·
`ACCESSIBILITY_AUDIT` · `DEPENDENCY_AUDIT` · `VALIDATION_REPORT` — all `_2026-10-12.md` at the repository
root — and `docs/PRIVACY_NOTICE_DRAFT.md`. Where an earlier report and this one differ, this one is later.
