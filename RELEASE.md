# EmeilSG — release checklist, rollback and operations

feature_enhancement.md Phase 10.2. The state on **2026-11-09**, after the 40-requirement roadmap. Deployment
settings are in `DEPLOYMENT.md`, the production database in `docs/PRODUCTION_DATABASE.md`, the local server in
`docs/LOCAL_DATABASE_SERVER.md`, and phones in `docs/MOBILE_APP.md`.

## 1. Where the requirements stand

- **39 of 40 are complete.** All P0 and P1 requirements pass their acceptance tests; the status of each is in
  `PS_Documents/implementation_docs/feature_enhancement.md` Appendix A.
- **Requirement 15** (handwritten bus tickets, P2) is **blocked**: it needs 3–5 real photos from the owner.
- **Not verified on real devices:** the installable app on an Android phone and an iPhone (`docs/MOBILE_APP.md`).

## 2. Regression run of 2026-11-09 (final build, local stack)

| Check | Command | Result |
|---|---|---|
| Unit tests | `pnpm test` | 287/287 |
| Database tests (pgTAP) | `pnpm db:test` | 471/471 |
| End-to-end, all roles and levels | `pnpm --filter web test:e2e` | 19 of 20 scripts pass in full. `feedback-2026-11` stops at the old Add ID step (85 checks pass before it), as in every run since Phase 1 |
| Cross-project data isolation | `pnpm --filter web test:isolation` | 264 passed (2 can only run inside the app) |
| Chatbot against a hostile model | `test:chatbot` | 49/49 |
| Factors, analytics, search | `test:factors`, `test:analytics`, `test:search` | 46/46, 44/44, 23/23 |
| Larger data volumes | `test:scale` | 21,600 records at 311 org units: analytics 81 ms, full-year report snapshot 0.4 s, search under 0.1 s |
| Large files | `release-checks.mjs` (in the suite) | A 48 MB PDF uploaded end to end in 1.3 s; size and fingerprint match |
| Accessibility (WCAG 2.2 AA, axe) | `test:a11y` | 190 passed, 0 failed, 0 known open (31 routes, 3 themes, keyboard, reflow at 320px, target size, reduced motion) |
| Phones, tablets, installable app | `ui-phase9.mjs` | 42/42 (390, 360, 820 and 1440 px; bottom bar; offline page; cursor after a tap) |
| Help centre | `ui-phase10.mjs` | 16/16 |
| Report templates and exports | `phase8-templates-search.mjs`, `ui-phase8.mjs` | 35/35, 30/30 (every template generated and read back; the GHG workbook opened) |
| Lint, types, format, build | `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` | Lint: 0 errors, 6 old warnings. Format: the two ui-lane files `app/loading.tsx` and `app/page.tsx` still fail, as before. Typecheck and build pass. |

**Not run:**
- a real email through Brevo;
- the real NVIDIA model (the configured models are retired or refused for the account);
- anything on Vercel;
- the OCR integration harness (no worker change since Phase 3).

## 3. Security and data integrity

- **Audits.** The October audits (`FINAL_VERIFICATION_2026-10-12.md`) and the Phase 1 re-check
  (`FEATURE_ENHANCEMENT_AUDIT_2026-11-07.md`) found no open critical or high finding. The 2 Medium items left
  are the client address used for rate limits and the inline scripts allowed by the CSP.
- **Server-side enforcement.** Every procedure checks the session, the role and the org scope.
  `test:isolation`, `test:search` and `test:analytics` call them as people of other units and get nothing.
- **Database guarantees.** The audit log and calculations are append-only. A record's owner and unit cannot
  change. Factor versions in use are frozen. Report and alert figures are kept as they were. All of these are
  enforced by triggers and tested by `pnpm db:test`.
- **Audit log review.** Hosted's audit log was reset on the owner's instruction on 2026-11-09. The previous
  1,287 entries are in the backup, and one `platform.reset` entry records the reset. Locally, the suites check
  that every action writes its entry.

## 4. Releasing

1. Merge to `main` with CI green: format, lint, typecheck, unit tests, the worker's tests and Ruff, the database
   tests, and the advisory gate.
2. **Before each new migration on a hosted database:** take a dump, using the `hosted-NNNN.cjs check` / `apply`
   pattern in `test data/_backup/` (read-only check first, apply refuses if the state differs). Apply the
   migration *before* the code that needs it, and *before* replacing the OCR worker.
3. Deploy the web app (Vercel). `CRON_SECRET` must be set, or the daily reminder and alert run refuses every call.
4. Smoke test on the deployed site:
   - sign in as a Super Admin;
   - upload a bill, verify, approve;
   - generate each report template and open the PDF and the workbook;
   - search;
   - open Help;
   - install the app on a phone.
5. Rebuild and replace the OCR worker only if `apps/ocr-worker` changed (CONTEXT.md §5: push the migration first).

## 5. Rollback

| What | How |
|---|---|
| Web app | Vercel → Deployments → promote the previous deployment. |
| A migration | The undo SQL is in the header of every migration since `0050`. Run it in a transaction after a dump; then remove the row from `supabase_migrations.schema_migrations`. |
| Data | Restore the dump taken before the change (`pg_restore`). Every hosted change since Phase 1 went through a script that wrote one. The full pre-reset state of 2026-11-09 is in `test data/_backup/hosted-reset-2026-11-09/`. |
| OCR worker | Start the previous container (the last one is kept stopped as `traceesg-ocr-worker-hosted-rules13`). |

**Tested:** the 2026-11-09 backup was restored into a throwaway database and matched hosted on all 55 tables. The
local server was built the same way and verified against hosted.

## 6. Operations

- **Daily, 09:00 India time:** Vercel Cron calls `/api/cron/reminders`. It sends deadline reminders and runs the
  emission alert check. The Reporting Deadlines page shows the sent log; Carbon Analytics shows the alerts.
- **Every five minutes:** a database job closes periods whose last upload date has passed.
- **OCR worker:** one container, always on. It only runs while Docker on its host runs. If uploads stay
  "Processing", check `docker ps`; a container that exited with 137 is out of memory, so start it again.
- **Errors:** Sentry when `SENTRY_DSN` is set (server side, personal data collection off).
- **People:** Super Admins (at most 2) invite people from Users. Invitation links last 24 hours. Sessions end
  after 3 hours idle and 72 hours in all. A forgotten password is reset by a code by email.
- **Secrets to rotate:** the database password, which was shared in chat in 2026. Keep keys out of the
  repository; `.env*` files are git-ignored.

## 7. Known limitations

- **Requirement 15** (handwriting) is blocked on sample photos.
- **The installable app** is verified only in emulation. There is no store app and no push notifications
  (`docs/MOBILE_APP.md`).
- **AI wording and the chatbot** need a working NVIDIA model in the settings. Real figures would go to a trial
  service, so read its terms first.
- **The transaction pooler** is not yet used in production (`docs/PRODUCTION_DATABASE.md`).
- **Some BRSR answers are typed, not evidence-backed:** energy in joules, wages and complaints, among others
  (`ASSURANCE.md`).
- **OCR** has been tried on a few real bills (TPCODL electricity); the others are synthetic samples.
- **The hosted project is the development one.** Production needs its own project
  (`docs/PRODUCTION_DATABASE.md` §3).
- **Legal texts** (privacy notice, terms) are drafts for a lawyer (`docs/PRIVACY_NOTICE_DRAFT.md`).
