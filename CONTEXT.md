# TraceESG (BRSR_MEIL) — Working context

The **live state** of the project: what is in flight, what is waiting on the owner, the machine and
infrastructure facts, how the owner works, and the traps already hit. Loaded automatically by `CLAUDE.md`, so
nobody has to re-explain it at the start of a session.

- [`PROGRESS.md`](PROGRESS.md) is the **history**: what each phase delivered, test results, open items.
- This file is the **now**: short, rewritten at the end of every session. If a fact here is also in
  `PROGRESS.md`, this file only points to it.
- Details of any decision live in `.grill/`; deviations from the specification in `supabase/SCHEMA_DEVIATIONS.md`
  and `apps/web/APP_FLOW_DEVIATIONS.md`.

_Last updated: 2026-10-10._

---

## 1. Where we are right now

- **Phases 1–20 and the out-of-sequence work below are committed** (`2392b6e`, merged to `main`; branch `feature`
  is one commit ahead of `main`). **Phase 21 (Deployment) comes after the audit fixes; the owner will choose the
  hosting then** — do not start it or assume Render (the owner does not use it).
- **Out-of-sequence work, committed; what is still unconfirmed in each group:**
  1. *Out-of-sequence features the owner asked for directly* (2026-09-25 onward): bulk import of employees and
     org units, OTP password reset by email, password-composition policy with a live meter, the theme toggle in
     the top bar, migrations `0029`–`0031`. Decisions: `.grill/bulk-import-decisions.md`,
     `.grill/password-policy-decisions.md`, `.grill/theme-toggle-decisions.md`. **No test results were recorded
     for these** — run the usual checks (PROGRESS.md §6 rule 8) before committing them.
  2. *OCR rules for real Indian electricity (DISCOM) bills*: `EXTRACTOR_VERSION` `rules-5` to `rules-9`
     (2026-10-03 to 05, from a real TPCODL bill; decisions in `.grill/ocr-real-bills-decisions.md`). Consumption from
     "UNITS ADVANCED", billing period from the PREV/PRES meter-reading dates, unit kWh implied (confidence 60), the
     source = the utility name (TPCODL), and (`rules-9`) a water bill's "consumption" read as Water withdrawn with
     discharge left for the person to type. The owner confirmed the electricity fields on a real upload; the
     source and water rules are built and running but **not yet confirmed on a real upload** (no real water bill
     has been tried). `rules-10` adds classification keywords for `FUEL_INVOICE`.
  3. *A PDF with several bills* (2026-10-05, owner's request; `.grill/multi-bill-pdf-decisions.md`, D24, A23, migration
     `0032`, new dependency `pdf-lib`): upload one PDF, the OCR proposes the split, the uploader confirms on
     `/app/upload/split/[documentId]`, each kept bill becomes its own record. Tested end to end locally (full suite
     189/189, Edge 17/17, OCR harness 9/9, production build, database 164/164, web unit 78/78, worker unit 40/40) but **not yet tried with a real upload on the hosted
     project or on a real multi-bill PDF**. Also in this change: the e2e suite's passwords now meet the password
     policy, four stale database tests were updated, `E2E_ENV_FILE` and `NEXT_DIST_DIR` were added.
- **Audit fixes ([`AUDIT_FIXES.md`](AUDIT_FIXES.md), audit of 2026-10-06, 52/100).** Done 2026-10-07 and committed on
  branch `feature` (not yet merged to `main`): P0-3 (indicator codes follow SEBI's July-2023 numbering, migration `0033`, D25) and
  P0-2 (the report prints SEBI's GHG, waste and Scope 3 tables with a previous-year column, tCO2e, intensity,
  assurance note and a methodology / factor-source section; turnover, PPP rate and assurance are entered once per
  financial year on Admin → Reports, D26, A24). Decisions: `.grill/audit-p0-decisions.md`. Checked: web unit 82/82,
  database 165/165, end-to-end scenarios A–D 82/82 on the local stack with the real worker image, the PDF read page
  by page, lint, typecheck, format, production build. **Not run:** scenarios E / authorization / edge-cases, the OCR
  harness (no worker change), and the new inputs form was not clicked through in a browser (its procedures were
  exercised by the end-to-end run). **Migration `0033` was pushed to hosted on 2026-10-07** and checked there.
  P0-1: the owner approved the factor values (table in `.grill/audit-p0-decisions.md`); **they are not on hosted yet** —
  an Admin enters them at `/admin/conversion-factors` and retires the 0.02 grid factor. P0-4 (deployment) comes last.
  **P1 done 2026-10-07, uncommitted** (`.grill/audit-p1-decisions.md`): migration `0034` (hierarchy rules as a database
  trigger, D27) and `0035` (18 new activities: coal by grade, LNG, PNG, refrigerants and SF6 by gas, travel by air /
  rail / road in passenger-km, cement and steel by weight, freight and commuting by spend; 5 of 10 Scope 3 categories
  active), `EXTRACTOR_VERSION` `rules-11`. Checked: web unit 83/83, worker unit 41/41 and Ruff, database 177/177, the
  full end-to-end suite 206/206 on the local stack with the rebuilt worker image (new Scenario F), lint, typecheck,
  format, production build. **Not run:** the OCR harness, a browser click-through. **`0034` and `0035` were pushed to hosted on 2026-10-07** (checked there) and the hosted
  worker container was recreated from the `rules-11` image and is running. No factor exists for any new activity;
  values for nine of them are proposed in `.grill/audit-p1-decisions.md` and await the owner's approval. **P2 done 2026-10-07, uncommitted** (`.grill/audit-p2-decisions.md`): migration `0036` (calculations append-only;
  audit entries carry address, browser and session, D28) — **on hosted**; audit entries in true order; security
  headers; evidence fingerprint re-checked on read. Checked: database 183/183, web unit 83/83, the full end-to-end
  suite on the local stack (all eight scripts pass; Scenario A has 7 new P2 checks, 25/25), lint, typecheck, format,
  production build. Not run: a browser click-through. **The two remaining P2 items were done the same day** on the owner's instruction: hierarchy levels are
  configuration (`org_levels`, migration `0037`, D29 — **on hosted**; Admin → Organization has a Hierarchy levels
  section) and a record can hold several evidence files (supporting files added on the verify screen or record
  drawer until approval; not read by OCR). Checked: database 194/194, web unit 83/83, full end-to-end suite 226/226,
  lint, typecheck, format, production build. Not run: a browser click-through of the two new sections.
  **P3 done 2026-10-07, uncommitted** (`.grill/audit-p3-decisions.md`):
  `AUTH_SECRET` removed from `.env.example`; server-side Sentry in `apps/web/instrumentation.ts` (new dependency
  `@sentry/nextjs`), off unless `SENTRY_DSN` is set, checked against a local stand-in endpoint; lint, typecheck,
  format, unit 83/83 and build pass; the end-to-end suite was not re-run for P3. The owner's `ps_documents/provided_docs/KT_Session_Transcript_and_Context.md` is still untracked.
- **All of the work above is committed and pushed** (`23e1925`, branch `feature`); pull request #2
  (`feature` → `main`) is open, not merged. CI on `23e1925`: web and worker jobs pass, the database job fails on a
  fresh database (three tests assumed a provisioned user). The fix is in `f2cb730`, **committed locally, not
  pushed** — the owner asked for local commits only (2026-10-08), so CI stays red until they push.
- **Second audit (2026-10-07 and again 2026-10-08, read-only, in chat): 72/100, conditionally ready.** The owner
  then asked for everything except deployment to be closed. Decisions and the factor table:
  `.grill/audit-2-decisions.md`.
- **Done 2026-10-08, committed locally (not pushed), migration `0038` NOT on hosted:**
  - Migration `0038` (D30, A26): process CO2, purchased steam, heat / cooling, road freight by truck class in and
    out (downstream transport active, 6 of 10 Scope 3 categories), commuting by bus, air emissions (NOx, SOx, PM,
    indicator `P6-E6`), the optional waste category field, `conversion_factor_versions.gases`,
    `esg_metrics.emission_source`, and a guard that a record cannot be verified without a document.
  - Report (snapshot version 3): break-up by gas, Scope 1 by emission source, SEBI's full waste table, a
    consolidation table per child org unit, a part-of-the-year note; activities with no data are counted, not listed.
  - Factor screen: gases covered, rename. Nm3 unit. Deadline reminder. `script-src` in the security policy.
    Notifications page no longer logs a hydration error. OCR `rules-12` (waste category label, three document
    types); **image rebuilt, hosted container NOT replaced** (it must wait for `0038` on hosted).
  - **28 sourced factors entered on the local database** through the Admin procedures (table and caveats in
    `.grill/audit-2-decisions.md`). Local waste and travel-by-spend factors are still synthetic (the suite needs them).
  - Checked: web unit 91/91, worker unit 43/43 and Ruff, database 206/206, lint, typecheck, format, production
    build; end-to-end 231 checks, all eight scripts passing (A, B, C, E, authorization in one full run; D, F and
    edge-cases re-run after two stale expectations were updated; D's first attempt lost its connection at 0.4 GB
    free memory); a real-browser pass in Edge over 17 Admin and 5 Project Manager screens, 48/48, no console
    errors; a 300-project, 86,400-record scale check (group roll-up for a year in 0.23 s, rolled back).
    **Not run:** the OCR integration harness, and no end-to-end run with the `rules-12` image.
- **SDG tags on the report (2026-10-09, owner's request), committed locally:** migration `0039` (D31), tags beside
  each indicator and a goals table; the mapping is the agent's own reading (`.grill/audit-2-decisions.md`). Checked:
  web unit 92/92, database 208/208, scenario D 34/34. Not on hosted.
- **Migrations `0038` and `0039` were pushed to hosted on 2026-10-09** (owner's go-ahead, after the dev server on
  port 3000 failed with "column v.gases does not exist") and checked there: 39 migrations, 13 new activities, the
  three columns, the guard; the nine records and the one factor untouched. The hosted worker still runs `rules-11`.
- **Owner's page feedback (2026-10-09), committed:** My Submissions lists multi-bill PDFs waiting for their
  split (the "disappeared PDF"), whole rows clickable, no redirect after an upload, a livelier upload animation,
  a forgot-password link on Profile (`.grill/page-feedback-2026-10-09-decisions.md`, A27). No migration. Checked:
  typecheck, lint, format, web unit. **Not run:** scenario E and `browser-bundle.mjs` (both updated, memory too
  low) — run them before merging.
- **Full BRSR format (2026-10-09, owner's decision), committed; migration `0040` pushed to hosted 2026-10-09 (owner's go-ahead) and checked there (40 migrations, 146 questions, mappings and records untouched):** all 146
  questions of Sections A, B and C seeded; an Admin types written answers on Admin → BRSR Disclosures; the
  report (snapshot version 4) prints everything in SEBI's order, "Not reported" where empty, and all 17 SDGs
  (`.grill/full-brsr-report-decisions.md`, D32, A28). Checked: web unit 93/93, database 218/218, lint,
  typecheck, format, a report built from the local database and read. **Not run:** end-to-end, a browser
  click-through of the new screen, production build. Discard for a wrong multi-bill PDF was
  added the same day.
- **Safety incidents and water discharge (2026-10-09, owner's request), committed on `feature` (not pushed); migration `0041` pushed to hosted and the hosted worker recreated from the `rules-13` image
  the same day (owner's go-ahead; 41 migrations, records and factor untouched, worker reports ready):** P3-E11 from a safety incident statement (two EHS activities, LTIFR), P6-E4 from two optional
  fields on the water record; OCR `rules-13`. `.grill/safety-and-water-discharge-decisions.md`,
  D33. Checked: web unit 96/96, worker unit 44/44, database 225/225, lint, typecheck, format, both report tables
  on local data. Not run: an upload through the app, end-to-end, the build. `ps_documents/implementation_docs/PPT_CONTEXT.md` (the owner moved it there) is
  the presentation context for mid evaluation.
- **Grand Finale deliverables (2026-10-09), committed on `feature` (not pushed):** `ASSURANCE.md` (the assurance account for BRSR Core
  KPIs), a KPI-trends-by-financial-year card on the Control Tower, and "Send reminders" for missing submissions
  (in-app + email, manual, audited). Also page feedback: BRSR Mapping sections, Reports history and evidence
  pages, expected submissions by scope, template dropdowns (`.grill/grand-finale-deliverables-decisions.md`,
  `.grill/page-feedback-2026-10-09-decisions.md`, A29). No migration. Checked: web unit 98/98, lint, typecheck,
  format; queries run on local and hosted. Not run: end-to-end, a browser view, the reminder through the app.
  **The owner will build the demo data** (three plants, users per role, three earlier periods for the anomaly demo).
- **Committed on `feature`, not pushed (2026-10-09, after `6e8ddeb`):** Organization page in three columns with renamed add cards, and
  every side panel docking on screens of 1900px and wider with an Expand button (`components/ui/sheet.tsx`, A30);
  the record panel in two columns when expanded; whole rows clickable in the panel-opening tables.
  Typecheck, lint, format pass; **not viewed in a browser** — the docking is CSS and Radix behaviour that only
  a real screen confirms.
- **Uncommitted (2026-10-10, owner's page feedback, A31):** Organization page — the add forms open in the side
  panel from two buttons, the unit and its expected submissions are one tile, and the ticks are written by a
  Save button (Clear all unticks). Typecheck, lint, format pass; **not viewed in a browser**.
- **Audit Evidence Bundle (2026-10-10, PS-08 deliverable, branch `feature/hackathon-deliverables`):**
  End-to-end cryptographic audit evidence package generation and streaming download.
  - Backend collection & packaging service: `apps/web/lib/reports/bundle.ts` & `apps/web/lib/reports/bundle-utils.ts`
  - Secure streaming API: `apps/web/app/api/reports/bundle/route.ts` with org authorization check, audit logging (`report.evidence_bundle_exported`), and anti-sniffing headers
  - tRPC procedure & Server Action: `reports.bundlePreview` in `apps/web/lib/trpc/routers/reports.ts` and `bundlePreviewAction` in `apps/web/app/admin/reports/actions.ts`
  - Interactive Preview & Download UI: `apps/web/app/admin/reports/bundle/` (with entry points from Reports and Evidence list)
  - Deterministic Lineage: connects reported BRSR metric -> calculation run -> factor version -> activity record -> OCR extraction -> physical evidence document
  - Integrity & Assurance: SHA-256 fingerprint verification against original upload hash, `manifest.json`, `checksums.sha256`, and explicit `limitations/missing-evidence.csv`
  - Verification: 105/105 web unit tests pass (7 new tests in `apps/web/tests/bundle.test.ts`), 44/44 OCR worker tests pass, Next.js production build (`next build`) passes cleanly.
- **Carbon Reduction Simulator (2026-10-11, PS-08 deliverable, branch `feature/hackathon-deliverables`):**
  Interactive decision-support simulator for exploring hypothetical emissions-reduction scenarios.
  - Pure calculation engine: `apps/web/lib/simulator/engine.ts` ($A = B \times r / 100$, $P = B - A$, $P_{org} = B_{total} - A$, overall % reduction)
  - Server baseline query: `apps/web/lib/simulator/service.ts` querying `public.consolidation_records` across Scope 1, 2, and 3
  - tRPC router & Server Action: `simulator.options` and `simulator.baseline` in `apps/web/lib/trpc/routers/simulator.ts` and `simulatorBaselineAction` in `apps/web/app/admin/simulator/actions.ts`
  - Admin UI & Navigation: `/admin/simulator` with persistent `SIMULATION — NOT OFFICIAL BRSR DATA` disclaimer, interactive synchronized slider & numeric inputs, 4 KPI cards, responsive baseline-vs-projected trajectory chart, 3 standard comparison scenarios (5%, 15%, 25%) + custom, and action templates
  - Non-destructive & Auditable: Read-only simulation leaves all official records, calculations, and approvals untouched
  - Verification: 113/113 web unit tests pass (8 new tests in `apps/web/tests/simulator.test.ts`), typecheck clean, lint clean, production build cleanly generates `/admin/simulator` route.
- **Hosted is not set up for a demo yet** and the owner chose hosted for the demo: still the 0.02 grid factor, one
  org unit, one open period `AUG26`, three users at the group. Needs, in order: a second Admin invited
  by the owner for the agent (see §2); then the factor script and an org tree.
- **Uncommitted, not from the feature sessions:** `apps/web/app/layout.tsx`, `apps/web/package.json` and
  `pnpm-lock.yaml` changed at 18:17–18:21 on 2026-10-07 (a development-only `agentation` widget). It fails `pnpm format:check` (`app/layout.tsx`). Left out of
  every commit; ask the owner.
- **Commit only when the owner asks.** One phase at a time; stop and wait for the go-ahead.

## 2. Waiting on the owner (do not decide these alone)

| Question | Notes |
|---|---|
| Where to host the web app and the OCR worker | Vercel was planned for the web app. Worker needs a host with a long-running, always-on process (no sleeping tier), ~2 GB RAM, no web port. |
| Delete the other Docker images? | Kept for now: the Supabase local-stack images (`public.ecr.aws/supabase/*`, needed by `pnpm db:start`/`db:test`) and the other project's `suraksha-backend` and `postgres:15-alpine` (plus its stopped containers and `suraksha_postgres_data` volume). Removing them is the owner's call. |
| Hosted demo setup | The owner chose hosted for the demo (2026-10-08). Waiting on: (1) go-ahead to replace the hosted worker container with the `rules-12` image; (2) a second Admin invited from Admin → Users for the agent — the provisioning script refuses a second Admin by design and the owner's password must not be reset; (3) the owner's review of the factor table in `.grill/audit-2-decisions.md`. |
| Push `feature` | Two local commits wait (`f2cb730` and the second-audit work). CI on the pull request stays red until they are pushed. |
| Factors with no source | PNG (needs the supplier's gas density), purchased steam / heat (the supplier's own factor), freight / commuting / travel by spend and waste (no Indian source found). Supply values, or leave those activities out of the demo. |
| Approve the proposed P1 factors, and find the missing ones | `.grill/audit-p1-decisions.md`: coal grades, LNG, R-32, R-134a, R-410A, SF6 proposed with sources. No value proposed for PNG (needs the supplier's gas density), R-22 (an HCFC — keep the activity?), travel per passenger-km, cement, steel, freight, commuting. AR5 or AR6 GWPs is the owner's choice. |
| Factors for waste to landfill and business travel spend | No Indian source found; the owner must supply values and sources. |
| Production Supabase: new project, or promote the dev one | PROGRESS.md §4. Must be decided explicitly. |

## 3. The owner and how they work

- **Solo owner/product lead**, not necessarily reading code; wants plain explanations and the answer first.
- **Tests with real documents** and reports what fails (e.g. a real electricity bill photo). Treat such a report as
  a bug to reproduce with the real worker, not a reason to guess.
- **Asks for features mid-session, outside the plan.** Record each one in `.grill/<topic>-decisions.md`, add a
  deviation entry (D/A numbers continue: next are **D34** and **A32**), and note it in PROGRESS.md.
- **Wants to be asked before a decision the documents don't settle**, and wants progress files kept current so
  sessions do not start cold (that is why this file exists).
- **Two roles work in parallel, each on their own branch** (from 2026-10-05; the previous work is committed on
  `main` and pushed): **feature** and **ui**. The rules for staying out of each other's way — lanes, migration
  numbers, who edits which docs, the shared hosted project — are in `CLAUDE.md`. This work so far is the **feature**
  role.
- **Does not use Render.** Do not recommend or configure it.
- Never print or commit secrets. The owner has pasted database passwords and API keys in chat before; the database
  password is still on the rotate list (PROGRESS.md §5).

## 4. Machine and environment

- **Windows 11**, Git Bash and PowerShell both available. Working directory `D:\Non Newtonian Things\BRSR_MEIL`.
- **Memory is tight (~12 GB machine, Docker Desktop capped at ~5.5 GB).** The dev server, local Supabase and the OCR
  worker together exhaust it. A sudden `cv2.error: Unknown C++ exception` or a container exiting with code 137 means
  out of memory, not a code bug — free memory and retry. Run one heavy thing at a time.
- **Local Supabase** (stopped at the end of the last session to save memory: `pnpm db:start`) on `553xx` ports (API 55321, Postgres 55322, Studio 55323, Mailpit 55324); web dev server on
  port 3000. Local users must be re-created after `pnpm db:reset`.
- **Hosted Supabase** `ps08_brsr_meil` (Mumbai, development only): all migrations `0001`–`0037` pushed (`0033`–`0037` on 2026-10-07, `0032`
  on 2026-10-05; `0029`–`0031` were already there when checked). Checked after the push: the new columns and
  `document_bundle_parts` exist, RLS is on for it and `password_reset_otps`, the browser roles have no access to
  either, `employee_id`, the two bulk-import permissions and the `theme-2` default are in place. Auth settings, first Admin and the password rotation are still to do (PROGRESS.md §5).
- **Docker:** the only OCR image is `traceesg-ocr-worker:latest` (≈2.3 GB, models baked in, rebuilt 2026-10-07 as `rules-11`, and the hosted container was recreated from it the same day, after `0035` reached hosted; the running container was recreated from it on 2026-10-05, right after migration `0032` reached hosted). The one OCR
  container, `traceesg-ocr-worker-hosted`, was recreated from it on 2026-10-04 and again for `rules-8` (restart `unless-stopped`, runs
  `python -m worker` as user `worker`, env = the four hosted Supabase settings, talks to the **hosted** project
  `qcobpqkmlojyznkefnpt`). Old test containers and the `phase6`/`hello-world` images were deleted. To recreate it again,
  rebuild the image, `docker rm -f` the container and `docker run -d --name traceesg-ocr-worker-hosted --restart
  unless-stopped --env-file <file with DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET_EVIDENCE> traceesg-ocr-worker:latest` — take the values from `apps/ocr-worker/.env`, and
  delete the env file afterwards.
- **Env var names** (values are in git-ignored `apps/web/.env.local` and `apps/ocr-worker/.env`): the Supabase URL/keys,
  `DATABASE_URL`, the two storage bucket names, `CHROMIUM_EXECUTABLE_PATH` (locally Edge), `SENTRY_*`, and
  `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` / optional `BREVO_SMTP_LOGIN`. **`BREVO_API_KEY` holds
  Brevo's *SMTP* key** (name is historical).

## 5. Traps already hit (read before touching the same area)

- **Rebuild and recreate after any OCR change.** A worker container keeps running its old image; extraction changes do
  nothing until `docker build -t traceesg-ocr-worker apps/ocr-worker` and the container is recreated. Check with
  `docker run --rm --entrypoint python <image> -c "from worker.extraction.profiles import EXTRACTOR_VERSION as v; print(v)"`.
  Bump `EXTRACTOR_VERSION` on every rule change. A build takes about 2–3 minutes (cached).
- **Which rules processed an upload:** `select model_version from ocr_jobs` ends in the extractor version (e.g. `…;rules-4`).
  On 2026-10-04 every hosted job still said `rules-4`, i.e. the old container was still running. The full OCR lines of
  every upload are kept in `ocr_extractions.raw_output`, so new rules can be replayed on a real upload without
  re-running OCR (`TextLine(text, score, box, page)` from `raw_output["lines"]` into `extract_fields`).
- **Running the worker code by hand:** from `apps/ocr-worker`, use `.venv/Scripts/python.exe` with `PYTHONPATH=.`
  (otherwise `No module named 'worker'`). Put throw-away probe scripts in the session scratchpad, not the repo.
- **Debug OCR on the real file, not on assumptions.** Dump the lines with their boxes and scores first; the
  failure is usually layout (labels and values in separate boxes that overlap by a few pixels, or a header lost to
  glare), not the model. Screenshots shared in chat are heavily downscaled — say so when testing on one.
- **Never guess a missing field** (Master Approach §12); a field that cannot be found is stored empty and the person
  fills it. Confidence means recognition score; do not invent numbers for it.
- **A worker newer than the database fails every job** (it reads columns from newer migrations). Push the migration
  first, then replace the worker container — never the other way round.
- **Testing against the local stack while `.env.local` names the hosted project:** the e2e suite refuses a non-local
  database, so give it a local env file (`E2E_ENV_FILE`, built from `supabase status -o env` plus the buckets; keep it
  out of the repo and never print it) and run a second app on another port with the same variables exported and
  `NEXT_DIST_DIR=.next-e2e` (so the owner's dev server on 3000 is untouched): `next dev -p 3100`. Next rewrites
  `apps/web/tsconfig.json` when `NEXT_DIST_DIR` is used — restore it with `git checkout apps/web/tsconfig.json`.
  Export the same env when running the OCR harness, since `apps/ocr-worker/.env` is the hosted one (real environment
  variables win over `.env`). The worker image used by the e2e suite is whatever `traceesg-ocr-worker` is tagged.
- **Sample-PDF generation and other child processes fail with exit 127 / `3221227274`** when free memory is under
  ~1 GB; stop Supabase Studio/Meta/Mailpit (`docker stop supabase_studio_BRSR_MEIL …`) and retry.
- **A puppeteer click on `button[type="submit"]` hits "Log out"** (the top bar has a submit button): click by label.
- **Prettier** runs for `apps/web` only (`pnpm format:check`); the repo root has none. Ruff covers the worker
  (`.venv/Scripts/python.exe -m ruff check . && … ruff format --check .`).
- **Audit log is append-only for every role**, tests and clean-up scripts included — they must not delete audit rows.
- **The end-to-end suite refuses any non-local database by design.** Running it against production needs a deliberate,
  reviewed switch.
- **Conversion factors:** none are seeded; every local factor is a labelled synthetic value. MEIL must enter real ones
  (with sources) at `/admin/conversion-factors` before emissions calculate.
- **`@sentry/nextjs` 11 collects cookies, headers, bodies, user details and local variables by default**
  (`dataCollection`; the old `sendDefaultPii` option is gone). `instrumentation.ts` switches each off — keep it that
  way when touching the Sentry setup.
- **`exceljs` is installed but unused** (only `xlsx` is imported); remove it when convenient.
- **Line endings:** git warns "LF will be replaced by CRLF" on this Windows checkout; harmless.
- **A local env file written by Python on Windows gets CRLF line endings**; exported into a shell, every value ends in a
  carriage return (the browser path then "is not found"). Strip the trailing carriage returns with `sed`. Load it with a `read` loop,
  not `source` (the Edge path has spaces and brackets). Delete `apps/web/.next-e2e` afterwards — lint and format scan it.
- **The owner's dev server (port 3000) uses the hosted database.** Code in the working tree that needs a new column
  breaks that running app until the migration is on hosted — ask for the push as soon as such code is written.
- **Hierarchy levels are data now** (`org_levels`): never hard-code a level list; rules in `lib/org/rules.ts` take the
  levels the server loaded. `group` is the only level known by name.
- **A long script passed to the shell as a heredoc can fail with "unexpected EOF"**; write it to the scratchpad with
  the file tool and run it from there.
- **A header set in `next.config.ts` replaces a route's own header of the same name** (it replaced the evidence
  route's sandbox policy). The site-wide Content-Security-Policy is therefore not applied under `/api`.
- **Stopping the test app and starting a new one straight away:** the dying process can still answer for a few seconds
  (its `/login` returned 404). Request the page again before concluding anything.
- **Running one e2e scenario alone** can fail on stale local data (scenario D picks the newest test record, which may
  sit in another period); run A–D in order.
- **The end-to-end suite leaves a hierarchy level `e2e_package` (position 45) behind**, and the database test
  `audit_p2_levels` assumes the seven seeded levels and adds its own level at 45 — so `pnpm db:test` fails on a local
  database the suite had run on. Fixed 2026-10-07 (the test uses its own level code and position 47); keep new
  database tests independent of rows the suite leaves behind.
- **The hosted OCR worker only runs while Docker Desktop on this machine is running.** With Docker closed, hosted
  uploads wait in "Processing" (seen 2026-10-07: the container had exited two hours earlier).
- **A factor version that starts later wins.** The engine takes the latest `effective_from` among active *and
  superseded* versions covering the period, so replacing a factor for past periods means retiring every earlier
  version (superseded ones too), not just adding one with an earlier start date.
- **CI runs on pull requests and pushes to `main` only**; pushing `feature` alone starts nothing. `gh` is not
  installed on this machine.
- **An end-to-end scenario that stalls on "the OCR queue" with ~1 GB free memory** is the worker container hanging
  after "worker ready"; remove the leftover container (`docker ps`) and re-run the scenario.
- **A script with apostrophes inside a shell heredoc fails with "unexpected EOF"** even when the heredoc is
  quoted; write it to the scratchpad with the file tool and run it from there.
- **Two browser pages in one puppeteer browser share cookies**; sign a second person in from
  `browser.createBrowserContext()`.
- **Adding an activity or a factor breaks tests that count them**: five database tests and two end-to-end
  checks held counts or used petrol as "the activity with no factor" (now purchased steam, which has none by
  design). Search the tests for the old count before trusting a red run.
- **Setting the owner's uncommitted files aside with `git stash` unlinks their dependency**: with `package.json`
  briefly without it, the next `pnpm` command removed `apps/web/node_modules/agentation` and the dev server broke.
  Do not stash them; if it happens, `pnpm install --frozen-lockfile` restores the link.
- **The owner sends page feedback from the `agentation` widget** (the uncommitted dev-only dependency) and may
  have started another session on the same feedback: `submission-row.tsx` existed, unused, minutes before the
  feature session was asked. Check file times before editing a page named in feedback.
- **Only the database is needed for `supabase test db` and `supabase migration up`:** `npx supabase db start`
  starts Postgres alone (works with under 1 GB free); the full `pnpm db:start` does not fit beside the dev
  server and the hosted worker.
- **Building a report without the app:** the scratchpad's `full.mjs` pattern (Node `registerHooks` resolving
  `@/` and `server-only`) runs `buildSnapshot` and `renderReportHtml` against the local database read-only.
- **The repository's SEBI Annexure I is the 2021 format;** the L&T FY2025-26 report follows the one in
  force. Take question numbers and wording from the L&T report.
- **Long commands:** anything over 10 minutes is moved to the background by the tool; the output file path is given.

## 6. Quick commands

Full list in `README.md`. The ones used most:

| Task | Command |
|---|---|
| Install | `corepack enable` once, then `pnpm install` |
| Dev server | `pnpm dev` (port 3000) |
| Lint / types / unit tests / format / build | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`, `pnpm build` |
| Local database | `pnpm db:start`, `pnpm db:reset`, `pnpm db:test`, `pnpm db:stop` |
| Create a local user | `pnpm --filter web provision-user --email … --name … --role … --org-code …` |
| End-to-end suite | `pnpm --filter web test:e2e` (local only) |
| Worker unit tests | from `apps/ocr-worker`: `.venv/Scripts/python.exe -m unittest discover -s tests/unit -t .` |
| Worker, one pass over the local queue | from `apps/ocr-worker`: `PYTHONPATH=. .venv/Scripts/python.exe -m worker --once` |
| Worker image | `docker build -t traceesg-ocr-worker apps/ocr-worker` |

## 7. Before you say a change is done

Format check, lint, typecheck, unit tests, production build, database tests, an end-to-end API script and a real
browser check (PROGRESS.md §6 rule 8). For OCR work add: the worker unit tests, Ruff, and the real worker run on the
actual document. Say plainly which of these were **not** run.

## 8. End of every session — update this file

1. Change the _Last updated_ date.
2. §1: what is committed, what is not, what is half done.
3. §2: add new questions for the owner; remove the ones answered (and record the answer in `.grill/` or PROGRESS.md).
4. §3–§5: add any new preference, environment fact or trap learned this session; delete what is no longer true.
5. If a phase finished, also update `PROGRESS.md` as its last section says.

Keep it short. History belongs in `PROGRESS.md`, reasons in `.grill/`.
