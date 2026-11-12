# TraceESG (BRSR_MEIL) — Working context

The **live state** of the project: what is in flight, what is waiting on the owner, the machine and
infrastructure facts, how the owner works, and the traps already hit. Loaded automatically by `CLAUDE.md`, so
nobody has to re-explain it at the start of a session.

- [`PROGRESS.md`](PROGRESS.md) is the **history**: what each phase delivered, test results, open items.
- This file is the **now**: short, rewritten at the end of every session. If a fact here is also in
  `PROGRESS.md`, this file only points to it.
- Details of any decision live in `.grill/`; deviations from the specification in `supabase/SCHEMA_DEVIATIONS.md`
  and `apps/web/APP_FLOW_DEVIATIONS.md`.

_Last updated: 2026-11-12._

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
- **Committed and pushed on `feature` (2026-10-10, owner's page feedback, A31; `5b3188c`):** Organization page — the add forms open in the side
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
- **ESG data analyst chatbot (2026-10-11, owner's request), committed on branch `feature-chat-analyst`
  (`67700f8`), not pushed to GitHub, no pull request yet**
  (cut from `main` at `9b0f2b8`; `feature` had nothing `main` lacked). Overview `CHATBOT.md`, decisions
  `.grill/chat-analyst-decisions.md`, D34, A32, `UI_NOTES.md`. Migration `0042` (role `chat_reader`, two
  conversation tables, permission `chat.use`) was **pushed to hosted on 2026-10-11** (owner's go-ahead) and
  checked there: 42 migrations, `chat_reader` exists without a login and with no privilege but SELECT, cannot
  read users, the audit log, documents, OCR fields or conversations, the two tables have RLS and no browser
  grants, all 8 roles hold `chat.use`, the 11 records and 4 org units untouched. **`chat_reader` has no
  password on hosted yet**, so the chatbot is still off there. New files: `apps/web/lib/chat/*`,
  `lib/trpc/routers/chat.ts`, `components/chat/*`, `tests/chat.test.ts`,
  `supabase/tests/database/chat_analyst.test.sql`; touched: `top-bar.tsx` (one line), `rate-limit.ts`,
  `root.ts`, `.env.example`, `seed.sql`, `phase2_smoke.test.sql`. No new dependency. Availability is the
  permission `chat.use` (17 permissions now; every existing role holds it; added to `0042` after the browser
  pass, so the permission gate itself was checked by database tests only). Checked: web unit
  124/124, database 249/249, lint, typecheck, format, production build, totals against `consolidateNodes`
  39/39, a real-browser pass in Edge on the built app with the real model 28/28. **Not run:** the end-to-end
  suite, the rate limit, the 90-day removal, the other two themes, the docked panel, anything on hosted. One
  small change (figures in the wording regrouped the Indian way) was made after the build and the browser
  pass; unit tests, lint, typecheck and format were re-run after it, the build and the browser pass were not.
  The owner's dev server has the NVIDIA key but no `CHAT_DATABASE_URL`, so the chatbot is off there and the
  top bar is unchanged. A local user `chat.pm@traceesg.test` (Project Manager, Project X) was created for
  the browser check; its password was not kept.
- **Chat pane docked "like Copilot in Edge" (2026-10-11, owner's request), committed 2026-10-11, not pushed on
  `feature-chat-analyst`:** `chat-launcher.tsx` (an `<aside>` instead of the Sheet, body padding, open state
  in `localStorage`), and the page's name sent to the model from a fixed server list (`routers/chat.ts`,
  `orchestrate.ts`, `actions.ts`). Checked: format, lint, typecheck, web unit 124/124, production build, a
  real-browser pass in Edge 19/19 on the built app (docking, page still usable, stays open across pages and a
  reload, Escape, phone width, and the `chat.use` gate: without the permission no button is shown). One
  line of the system prompt was reworded after that pass; unit tests and static checks were re-run, the build
  and browser pass were not. A second local user, `chat.pm2@traceesg.test`, exists for that check.
- **Bulk-import templates and a whole branch of org units from one sheet (2026-10-11, owner's request, A33),
  committed 2026-10-11, not pushed on `feature-chat-analyst`:** `lib/bulk-import/xlsx.ts` (both templates rewritten),
  `lib/org/rules.ts` (`treeOrder`, `importOrder`), `organization.bulkImport` (a `parentCode` per row,
  parents first, repeated codes refused), `users.bulkImportOptions` (scope list in tree order with level and
  parent), the two bulk-import components and their two pages. No migration, no new dependency (`exceljs`
  IS used now — by the templates). Checked: format, lint, typecheck, web unit 127/127 (3 new); both templates
  generated as real files and read back, and a 12-row sheet imported through the real procedure on the local
  database, 34/34; the Parent code cell is a pick-list of every existing unit (CODE — Name, or Name — id:… for a
  unit with no code) that still accepts a typed code. On hosted only MEIL has a code (DrillMac, Drilling and
  Olectra were created without one), which is how the missing-parents bug was found. The employee template had the same fault (scope list showed MEIL only): its
  Organization Scope list now holds every in-scope unit, and `users.bulkImport` resolves `id:…` references; checked
  with a real two-account import on the local stack, 7/7 (accounts and unit removed again) (created units removed again). **Not run:** the production build; the screens in a browser
  (the download button, the preview table, the results table); nothing on hosted. This work is unrelated to
  the chatbot and sits on its branch only because that was the branch checked out.
- **Organization tree guide lines (2026-10-11, owner’s page feedback), committed 2026-10-11, not pushed:** `org-manager.tsx` draws a
  vertical line from each parent with a tick to each child (CSS only, `BRANCH`). Lint and typecheck pass; **not
  viewed in a browser** by the agent (no local Admin password). The lines use `--border`, which is pale in the
  Special theme.
- **`feature-chat-analyst` was pushed to `ucn` (`IAMUCN/ps08_BRSR_meil`) `main` by the owner on 2026-10-11**
  (`dba8fa1`); `origin` (MACRO72) does not have it. Everything below this line was committed later on 2026-10-11 (not pushed) unless it says otherwise.
- **No ids in the bulk-import templates (2026-10-11, owner's request), uncommitted:** an org unit with no code is
  listed by its name and matched by name on the server (`unitByRef`, `lib/org/rules.ts`; `users.ts`,
  `organization.ts`, `xlsx.ts`); a name several units share is refused. Checked: format, lint, typecheck, web
  unit 128/128 (1 new). **Not run:** an import through the procedure, the screens in a browser, the build.
- **Hosted was cleared and given MEIL's Admin inputs on 2026-10-11** (owner's request, each group confirmed;
  `.grill/demo-data-decisions.md`). Gone: all records, documents and files, OCR / validation / approval rows,
  notifications, the saved chat, the 0.02 factor, `AUG26`, DrillMac / Drilling / Olectra, the role "test".
  Kept: the three accounts, the audit log (append-only), all configuration. Entered through the Admin
  procedures by script, as the one Admin account: 23 BRSR Disclosure answers for FY 2026-27 (only what meil.in
  or its published annual return and CSR summary state), turnover for FY 2022-23, and 29 conversion factors
  (the 28 sourced ones plus zero for renewable electricity). Hosted now has **one org unit (MEIL), no period,
  three users**. Rows deleted are copied in `test data/_backup/`.
- **Two sets of test data** in `test data/` (git-ignored; `README.md` there says how to use them), made by
  `apps/ocr-worker/scripts/make_test_data.py` and `apps/web/scripts/test-data-sheets.mjs`: per set a filled
  org-unit sheet, an employee sheet with the Email column empty (the owner types addresses and imports), one
  document for each of the 47 activities, a multi-bill PDF and a manifest. Set 1 is August 2026, set 2
  September 2026. Checked: the worker's real OCR and extraction on all 63 single documents of set 1 (every
  required field read, document type chosen; the faint Men figure is misread on purpose), the sheets against
  `importOrder` and `canBeChildOf`, Ruff. **Not run:** set 2 through OCR (same layouts), any upload or import
  through the app. **The owner does the rest:** creates the two periods, imports org units and users, uploads.
- **Reports for a custom period, and the chatbot for Admins (2026-10-11, owner's request), committed 2026-10-11 and merged with `main` (`7dcb16e`: landing and sign-in redesign, emissions forecast and its chatbot tool `explain_forecast` — 9 tools, 12 for an Admin; web unit 169/169, lint, typecheck, format after the merge; build and database tests not re-run), not pushed;
  migration `0043` pushed to hosted 2026-10-11 (owner's go-ahead; 43 migrations, both columns nullable, the constraint replaced, no report runs there)** (`.grill/chat-admin-access-decisions.md`, D35, A34): `report_runs` gains
  `period_from` / `period_to`; Reports → Covering has _Custom period_ (From period, To period); the page
  reads `org`, `period`, `fy`, `from`, `to` from its address. The chatbot has three Admin-only tools
  (`list_people`, `list_records`, `open_report_page`) that run on the app's own connection, read-only;
  `chat_reader` is unchanged and a non-Admin's chatbot is unchanged. Checked: web unit 158/158, database
  252/252, lint, typecheck, format, production build, and 27/27 through the app's code on the local database.
  **Not run:** a browser view (form, the panel going to the page), a question through the real model, a
  custom report rendered to PDF, the end-to-end suite.
- **The test data is committed and on `ucn` `main`** (`47b23c7`, merge `cba4238`, 2026-10-11); only
  `test data/_backup/` is ignored. `origin` (MACRO72) does not have these commits.
- **The `agentation` widget is committed now** (it is in `apps/web/package.json` on `main`; the working tree was
  clean at the start of the 2026-10-11 session and `pnpm format:check` passes).
- **Owner's page feedback of 2026-10-11 on Organization and the chat pane — committed (`db4f66b`) on branch
  `feature-org-chat-feedback` and pushed to `ucn` `main` on 2026-10-11 at the owner's request (a fast-forward;
  no pull request, CI not run); `origin` (MACRO72) does not have it; migration `0044` was pushed to hosted on 2026-10-11
  (owner's go-ahead) and checked there: 44 migrations, the new table has RLS and no browser access, both views
  closed to the browser and readable by `chat_reader`, the tree has no repeated pair, the 13 org units, 29
  factors and the accounts untouched**
  (`.grill/shared-org-units-decisions.md`, D36, A35, `UI_NOTES.md`). An org unit can sit under more than one
  parent (full in each, once at the group — the owner's choice), there can be several groups (same Admins),
  an unused unit can be deleted after typing `delete`, deactivating a unit with units under it asks for
  `deactivate`, the bulk-import sheet has an Also under column, the chatbot's `list_org_units` takes `under`
  (the wrong "projects under X" answer), and the chat pane has a coloured header bar, a one-line question
  box and the suggestions at the foot. A second round the same day: the Shared tag glows and shows under every
  parent, **Export hierarchy** downloads the tree in the bulk-import columns, and Also under is separated by
  commas (format, lint, typecheck, unit tests re-run after it; the build, the database tests and the 25
  procedure checks were not; the exported file was not opened). Checked: format, lint, typecheck, web unit 174/174 (5 new), database
  271/271 (19 new), production build, and 25/25 through the real procedures on the local database (shared
  totals at each level, bulk import, second group, delete; everything created was removed again, a test
  user `shared.units.check@traceesg.test` stays). **Not run:** any of it in a browser, a question through
  the real model, the end-to-end suite, the template downloaded and opened in Excel.
- **Follow-up rounds of the same feedback, committed after `85446ef` and pushed to `ucn` `main` on 2026-10-11
  (owner's request; production build passes; none of it viewed in a browser):** a shared unit's parents are written together —
  Parent code takes every parent, comma separated, in the template, the import (`parentsOf`) and Export
  hierarchy; the Also under column is gone (still read); the Organization card is "Parents". Checked: format,
  lint, typecheck, web unit 175/175. Not run: the build, an import through the procedure, a browser view.
  Also: Export hierarchy lists a shared unit under each parent, every such row naming all its
  parents — units without a code included — and the import reads same-code same-name rows, or code-less rows
  with the same name and parent list, as one unit (`mergeSharedRows`; web unit 176/176,
  and 6/6 through the real procedure on the local database; the exported file itself was not opened).
  Also: the template has pick-list columns Parent code 2 and Parent code 3 for further parents
  (a spreadsheet pick-list cannot multi-select); static checks and unit tests only, the template was not
  opened in Excel.
  Also: hovering (or pressing) the Shared tag opens a list of the unit's parents, and choosing one
  selects the unit at its place under that parent (`SharedPlaces`, `goTo` in `org-manager.tsx`); only the
  drawing that was clicked is highlighted. Static checks and unit tests only — hover timing, the list's
  position and the scroll need a real browser.
  Also: migration `0045` renames the level "Subsidiary / Entity" to "Subsidiary" (label only);
  **pushed to hosted 2026-10-11** on the owner's page feedback and read back there (45 migrations); database
  tests 271/271 locally.
- **Committed after `64d3579` and pushed to `ucn` `main` on 2026-10-11 (owner's page feedback):** the template is back to one Parent code
  column taking any number of parents with commas (Parent code 2 / 3 removed, still read); codes and names
  are matched ignoring extra spaces and case; the Organization heading makes room for the docked add panel.
  Parents are chosen from a checkbox list on the page: in Add a unit and in the Parents card (Save parents;
  `organization.setParents`, `create` takes `alsoUnder`). Checked: format, lint, typecheck, web unit
  177/177; the two procedures 9/9 on the local database. After an org-unit sheet is uploaded, each preview row has a
  Parents checklist (`row-parents-picker.tsx`) so several parents can be ticked instead of typed. Production
  build passes after all of it. Not run: a browser view (the checklist opens in a popover inside the side
  panel — check it there), the template opened in Excel.
- **Committed and pushed to `ucn` `main` on 2026-10-11 (owner's page feedback on `/admin/data-explorer`):** a search box in the records
  filter bar (Data Explorer and Submission Monitoring; URL param `q`, searched on the server in
  `recordsFrom` — every word must appear in the document, metric, category, org unit, period, submitter,
  value or unit) and Clear filters moved into the filter bar. Checked: format, lint, typecheck, web unit
  177/177, production build, the query 12/12 on the local database. Not viewed in a browser.
- **The test data was regenerated on 2026-10-11 with mixed formats, committed (`9ba9081`) and on `ucn` `main`** (owner's request): in each
  role's folder a third of the bills are single PDFs, a third are images (JPG and PNG in turn) and the rest
  are pages of one multi-bill PDF; `make_test_data.py` and `test data/README.md` changed. Set 1: 30 PDFs, 21 images, 6 multi-bill PDFs; set 2: 40, 27, 6. Ruff passes; no file was put
  through OCR or uploaded.
- **Security audit of 2026-10-12, fixes uncommitted on branch `feature-security-audit-fixes`** (cut from `main`
  at `d7add8c`; no migration, nothing pushed, nothing on hosted). Report with every finding, fix, test and open
  item: [`SECURITY_AUDIT_2026-10-12.md`](SECURITY_AUDIT_2026-10-12.md). Fixed: deadlines reads are Admin-only;
  org scope on carbon credits, Control Tower figures, report reads and the evidence bundle (new
  `lib/auth/scope.ts`); the bundle read a table that does not exist (`audit_log`) and now needs
  `report.generate`; bulk-import passwords are random; the reset code's attempts are claimed atomically;
  `/reset-password` works only right after an emailed link (marker cookie); session cookies are HttpOnly; CSV
  exports neutralise formulas; the carbon "integrity check" is computed; Next 16.3.5 → 16.3.8. Checked: web
  unit 188/188, lint, typecheck, format, production build, the changed queries on the local database 17/17.
  **Not run:** the end-to-end suite, any browser pass — sign-in / refresh / sign-out, an invite link
  and one bundle download must be tried in a browser before merging. Two ui-lane files got one line each (CSV).
- **Database audit of 2026-10-12, same branch, uncommitted; migration `0047` is on the LOCAL database only, NOT
  on hosted** ([`DATABASE_AUDIT_2026-10-12.md`](DATABASE_AUDIT_2026-10-12.md): table map, data-access matrix,
  findings, rollback; D38). `0047` adds no table or column: ownership columns of records and documents cannot
  change, an evidence link stays inside one org unit, a carbon batch cannot be over-drawn, `org_settings` is
  Admin-only, `chat_reader` loses the carbon tables, unused privileges are revoked. The validation queue is
  scope-checked. New tests: `supabase/tests/database/audit_3_data_isolation.test.sql` (41) and
  `pnpm --filter web test:isolation` (the real procedures called as a Project X user with a sibling
  project's ids, 107/107). Checked: database 312/312, web unit 188/188, lint, typecheck, format. **Not run:**
  `0047` on a fresh database, the end-to-end suite, anything on hosted.
- **Chatbot audit of 2026-10-12, same branch, uncommitted, no migration**
  ([`CHATBOT_AUDIT_2026-10-12.md`](CHATBOT_AUDIT_2026-10-12.md): threat model, findings, evidence). The design held under
  every test. Changed: email addresses, employee ids and document file names are no longer sent to the AI
  service (the Admin still sees them in the table the app draws; the records table gained a Document column);
  the audit entry of a question no longer holds the words searched for; wording that claims a change gets a
  "can only read" note. New: `pnpm --filter web test:chatbot` — the real `chat.send` on the local database
  with a scripted hostile model in place of the provider, 49/49. Checked: web unit 191/191, cross-project
  107/107, database 312/312, lint, typecheck, format. **Not run:** the real NVIDIA model, the panel in a
  browser, anything on hosted.
- **Privacy and compliance audit of 2026-10-12, same branch, uncommitted**
  ([`COMPLIANCE_AUDIT_2026-10-12.md`](COMPLIANCE_AUDIT_2026-10-12.md): 20 areas, personal-data map, claims checked;
  `docs/PRIVACY_NOTICE_DRAFT.md` is a draft for a lawyer, not a policy). One code change: deadline dates are no
  longer called "statutory" (email, notice, Deadlines page — two one-line edits in the ui lane). Everything
  else waits on facts the code does not hold. Contrast was computed from colour values; **no browser,
  keyboard or screen-reader pass was made.**
- **UI audit of 2026-10-12, same branch, uncommitted** ([`UI_AUDIT_2026-10-12.md`](UI_AUDIT_2026-10-12.md); changes listed
  in `UI_NOTES.md`). The built app was driven in Edge on the local stack: 39 routes at 1440, 820 and 390px,
  signed out, as an Admin and as a Project Manager; no console error on any route. Ten defects fixed, none a
  restyle: pages scrolling sideways on phones (14 cases, one of 3px left), an unreadable first table-header
  cell on Deadlines and Carbon credits, double top headings on empty pages, emoji icons, unlabelled filters,
  32 announced image pieces on the landing page, the cursor mounted twice. **This pass also confirmed in a
  browser what the security audit had left open: sign-in, the HttpOnly Secure session cookie and sign-out
  work.** Not seen: the Special and Dark themes, open side panels and dialogs, pages with real data, a
  screen reader. Still open from the security audit: an invite link end to end, one bundle download.
- **Accessibility audit of 2026-10-12 (WCAG 2.2 AA target), same branch, uncommitted**
  ([`ACCESSIBILITY_AUDIT_2026-10-12.md`](ACCESSIBILITY_AUDIT_2026-10-12.md), changes in `UI_NOTES.md`). New test
  `pnpm --filter web test:a11y` (axe-core in Edge on 31 routes in all three themes, plus keyboard, skip
  link, dialogs, reflow at 320px, target size, reduced motion): first pass 99 passed / 36 failed, last full
  run 185 passed / 0 failed / 2 known open (Roles & Permissions and BRSR Disclosures at 320px). Fixed: skip
  link, contrast on the four newest Admin pages and on tinted surfaces, focus returning from side panels,
  a named notifications pop-up, small targets, reflow on eight pages. New dev dependency `axe-core`.
  **No screen reader was used and no person tested**; the report's section 6 is the manual script. Not in CI.
- **Dependency and production-configuration audit of 2026-10-12, same branch, uncommitted**
  ([`DEPENDENCY_AUDIT_2026-10-12.md`](DEPENDENCY_AUDIT_2026-10-12.md): inventory, findings, deployment checklist split into
  code and dashboards). Advisories in what ships went from 14 to 2, both without a fix and recorded with reasons
  in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas`). Changed: `xlsx` now installs from SheetJS's own site
  (0.20.3, hash pinned); `sharp`, `source-map-js`, `@modelcontextprotocol/sdk` refreshed in the lockfile;
  `X-Powered-By` removed; API answers are `private, no-store`; CI has a read-only token, a pinned third-party
  action and an advisory gate (**the changed workflow has not run on GitHub**); the worker `Dockerfile` upgrades
  pip last (verified under a throwaway tag — **`traceesg-ocr-worker:latest` and the hosted container were not
  rebuilt or replaced**). Retested: unit 194/194, build, cross-project 107/107, chatbot 49/49, browser checks
  131/131. Nothing was changed in any dashboard or on hosted. A second pass added `app/robots.ts`, removed
  `@types/jszip`, and stopped the worker's error reports from carrying stack-frame variables
  (`worker/logs.py`; Ruff and worker unit 44/44 run inside the existing image — needs an image rebuild to
  take effect).
- **Validation of all the audit fixes, 2026-10-12, same branch, uncommitted**
  ([`VALIDATION_REPORT_2026-10-12.md`](VALIDATION_REPORT_2026-10-12.md): every test with expected, actual, limits). Run on the
  local stack through the real app: end-to-end suite **342/342 over nine scripts** (new
  `tests/e2e/audit-regression.mjs`, 108 checks, is the ninth), cross-project 107/107, chatbot 49/49,
  accessibility 185 passed / 0 failed / 2 known open, database 312/312 on the working database **and on a
  fresh one** (all 47 migrations), unit 195/195, lint, typecheck, format, build, advisory gate. Four more
  defects found and fixed: **the evidence bundle had never worked against the real schema** (six queries
  with columns that do not exist — now generates 36 files with verified checksums); a return path with `..`
  accepted after sign-in; a stale end-to-end expectation (snapshot version 3, the code is at 4 — also wrong
  on `main`); one more unreadable table header that only shows with data. No regression from the fixes was
  found. Not run: the real AI model, email delivery, anything on hosted, the changed CI workflow, a rebuilt
  worker image, the OCR harness. The local database now holds the suites' accounts and records.
- **Final verification of the audit, 2026-10-12** ([`FINAL_VERIFICATION_2026-10-12.md`](FINAL_VERIFICATION_2026-10-12.md) — start
  here; it has the totals by severity, a status per requirement and the release checklist). Every fix was
  re-read in the source and every suite re-run on the final tree: unit 195/195, database 312/312,
  end-to-end 344/344 over nine scripts, cross-project 107/107, chatbot 49/49, accessibility 185 / 0 / 2 known
  open, lint, typecheck, format, build, advisory gate. One more item found and fixed: the development
  feedback widget's code was in the production bundle (`components/dev/feedback-widget.tsx` now loads it in
  development only). Open: 2 Medium (client address for rate limits, inline scripts in the CSP), 18 Low,
  and everything about hosting, legal documents and a human accessibility pass. **All of the 2026-10-12 audit work (every "uncommitted" entry above from that
  date) was committed as `d4e214c` on `feature-security-audit-fixes` and the branch pushed to both `ucn` and
  `origin` on 2026-10-12 at the owner's request. No pull request is open yet and CI has not run. Hosted is
  untouched; migration `0047` is local only; the worker image is not rebuilt.**
- **Renamed to EmeilSG with a new logo (2026-10-12, owner's request), committed on branch `ui-rename-emeilsg` and pushed to `ucn` and `origin` on 2026-10-12 (no pull request, CI not run)**
  (cut from `feature-security-audit-fixes`). Details in `UI_NOTES.md`. 77 files; no migration. Checked:
  typecheck, lint, format, unit 195/195, production build; the landing and sign-in pages viewed in Edge; no
  page source and no built file contains the old name. `BREVO_SENDER_NAME` was changed in the two local env
  files. **Not done (dashboards):** the hosted Supabase email subjects and templates, and the Brevo sender
  name there if set. Not run after the rename: the end-to-end, isolation, chatbot and accessibility suites.
  The documents (this file included) still say TraceESG where they describe history.
- **Invite user emails a temporary password through Brevo (2026-10-12, owner's page feedback, A36), uncommitted on
  branch `feature-invite-smtp`** (cut from `ui-rename-emeilsg`; `.grill/invite-smtp-decisions.md`). No migration.
  "Invited" now means never signed in. Checked: the procedures on local with a captured SMTP transport 22/22,
  typecheck, lint, format, unit 195/195, build. **Not run:** a real email, the screen in a browser, the
  end-to-end suite. Two deactivated `invite.check*@traceesg.test` accounts stay on the local database.
- **Show-password button on sign-in (2026-10-12, owner's page feedback), uncommitted on the same branch:**
  `components/ui/password-input.tsx`, used on the sign-in form only (`UI_NOTES.md`). Checked: typecheck, lint,
  format, build, and the button in Edge on the built page 10/10 (click, keyboard, value kept). The other
  password fields were not changed.
- **First sign-in must change the temporary password (2026-10-12, owner's request, A36), uncommitted, same
  branch:** mark in the sign-in account's app metadata (`lib/auth/initial-password.ts`), new session status
  `password_change_required`, the form on `/login`. No migration. Checked in Edge on the built app, local
  stack, 24/24; invite procedures 22/22 again; typecheck, lint, format, unit 195/195. **Not run:** the
  end-to-end suite (its `setPassword` helper now clears the mark), bulk import then sign-in, the reset-code
  path. Accounts created before this change are not marked.
- **Deleting a user who has no work on record now works (2026-10-12, owner's report), uncommitted, same
  branch:** `users.delete` used to fail on any foreign key and say "has data on record" — a notification, a
  reset code, a saved chat or one audit entry in the person's own name (a theme change) was enough. It now
  counts real work (submissions, uploads, verifications, approvals, reports, roles given, configuration) and
  names it when refusing; otherwise it removes the person's own traces and the account. Where the audit log
  names them the profile row stays, hidden (`deleted_at`, address replaced) and the sign-in account is
  soft-deleted, so the address can be invited again. No migration. Checked through the real procedure on
  local, 20/20; typecheck, lint, format, unit. **Not run:** in a browser; on hosted — the cause for the
  owner's account there was not looked up.
- **Expected submissions of the units below show on the parent (2026-10-12, owner's request), uncommitted on
  `feature-invite-smtp`:** `organization.expectations` returns `requiredBelow` (unit names, through
  `org_unit_tree`); the Organization card shows those activities ticked and locked with "From <unit>" and
  counts them. Nothing is stored on the parent — a stored row would make the Control Tower expect a record
  from the parent itself. No migration. Checked through the procedures on local 13/13, typecheck, lint,
  format, unit. **Not viewed in a browser.**
- **Role defaults reviewed (2026-10-12, owner's request), uncommitted on `feature-invite-smtp`; migration
  `0048` on the LOCAL database only:** Corporate ESG gains `validation.review` and `report.generate`; nothing
  else changes (`.grill/role-permissions-decisions.md`, D39). Database tests 321/321. Not run: end-to-end.
  For non-Admins those permissions have no page yet (`/admin` is Admin-only).
- **Edit role on Roles & Permissions (2026-10-12, owner's request), uncommitted on `feature-invite-smtp`:**
  `roles.update` (name and description; code fixed; audited) and a side panel. No migration. Checked through
  the procedure on local 15/15, typecheck, lint, format, unit. **Not viewed in a browser.**
- **The owner committed and merged the entries above themselves on 2026-10-12** (`e1586f3`, pull requests #27
  and #28; expected submissions on the parent, role defaults with migration `0048`, Edit role) and switched
  this checkout to `main` (`e7beca5`). Migration `0048` is still on the local database only.
- **Test data set 1 follows the hierarchy in the web app (2026-10-12, owner's request), uncommitted in the
  working tree, which is on `main` — branch before committing:** the hosted org units were read (read-only): MEIL, six subsidiaries, five code-less
  projects under Olectra Greentech, TGSRTC Telangana under EVEY and Olectra. Set 1's documents are now filed
  under Seetharampur plant, MSRTC e-bus order, BEST Mumbai e-buses and TGSRTC Telangana (57 files); its org
  sheet is a reference list, not for import; its employee sheet names units by name. Set 2 was regenerated
  too (it repeats set 1's units; the subsidiaries already in the app left its sheet). Checked: every name
  against the hosted list, files on disk, Ruff. **Not run:** OCR on the new files, any import or upload. The
  owner had set 1's employee sheet open in Excel, so the new one is `… - NEW.xlsx` beside it. Hosted has one
  period, "August 26-27" (draft); the manifest says August 2026.
- **The four `feature-invite-smtp` entries above were committed and the branch pushed to `ucn` and `origin` on
  2026-10-12 at the owner's request** (it sits on top of `ui-rename-emeilsg`). No pull request, CI not run.
- **Employee role uploads for the Project Manager (2026-10-12, owner's request), uncommitted on `main`'s
  working tree:** migration `0049` (`roles.uploads_for_role_id`, D40), `uploadTargets`, `roles.update`, a select
  in Edit role (`.grill/employee-uploads-decisions.md`). Checked: procedures on local 18/18, database tests
  321/321, unit, typecheck, lint, format. Not viewed in a browser. **The column is on hosted (applied by hand,
  not recorded in the migration history); the hosted Employee role does not have the setting yet.**
- **August run on hosted with test data 1 — done 2026-10-12** (owner: "use test emails ... and proceed").
  Set up by script, audited with no user and a note naming the agent: Employee (`emp`) uploads on behalf of
  Project Manager; HR got upload and verify back; Corporate ESG got `validation.review`; **21 test accounts**
  (`…@emeilsg.test`, employee ids `TEST-001`–`TEST-021`: Employee, Project Manager, EHS, HR, Procurement and
  Finance at MSRTC e-bus order, BEST Mumbai e-buses and Seetharampur plant; Employee and Project Manager at
  TGSRTC Telangana; Corporate ESG at MEIL). Their passwords are in the git-ignored
  `test data/_backup/august-run-accounts.local.json`. The owner's own accounts were not touched; the period
  was already open. Run through the dev server on port 3000 over HTTP as those accounts (sign-in form, the
  screens' procedures, the hosted worker): 57 files uploaded, 6 multi-bill PDFs split, **66 records, all 47
  activities**, each verified, all validated, **57 approved, 9 waiting for a conversion factor** (waste,
  PNG, steam, heat / cooling, the spend-based ones — none has a factor by design). Project Manager bills
  were uploaded by the Employee accounts and verified by the Project Manager accounts. The faint headcount
  figure was misread (439 for 139), validation failed it, HR corrected it. No OCR job failed. Not done: a
  report, anything in a browser. Run script and its state file: session scratchpad and `test data/_backup/`.
- **Hosted migration history is behind what is applied:** it records up to `0045`; `0046` (carbon) and the
  `0049` column are present, `0047` and `0048` are not. A plain `supabase db push` would try `0046` again.
- **The Employee setting (migration `0049`), the realigned test data and the notes of the August run were
  committed on branch `feature-employee-uploads` and pushed to `ucn` and `origin` on 2026-10-12** (owner's
  request; no pull request, CI not run). Left out, the owner's own untracked files:
  `PS_Documents/generated_reports/` and `test data/test data 1/employee-bulk-import-template.xlsx`.
- **Hosted migration catch-up prepared, NOT applied (2026-10-12, owner: "make everything up to date"):** the
  read-only check passed (no evidence link across org units, no over-drawn carbon batch, `0046` fully present,
  66 records, 72 documents, 29 users), but applying `0047` and `0048` was refused by the permission system.
  The owner runs `node "test data/_backup/hosted-catchup.cjs" apply` (or allows it). `PROGRESS.md` was brought
  up to date the same day. Git: `main` is the same on `ucn`, `origin` and locally (`e7beca5`);
  `feature-employee-uploads` is one commit ahead plus this docs commit, pushed, not merged.
- **Vercel deployment check (2026-10-12, owner will deploy the web app there), uncommitted on
  `feature-employee-uploads`:** `DEPLOYMENT.md` (settings, variables, what to try first). Fixed: the report
  browser's files were not in the build's file trace (`outputFileTracingIncludes` in `next.config.ts`; checked
  in the `.nft.json` of `/admin/reports` and the tRPC route); deadline-email links fell back to localhost
  (`lib/app-url.ts`). Added `apps/web/vercel.json` (region `bom1`). Build, typecheck, lint, format, unit pass.
  **Nothing was tried on Vercel.** Unknowns: pnpm 12 on Vercel's builder, evidence files over 4.5 MB through
  a function, fonts in the packaged browser.
- **Hosted has every migration, `0001`–`0049`, recorded in its history** (the owner ran the catch-up script on
  2026-10-12; read back afterwards: the four `0047` triggers, `org_settings` Admin-only, both Corporate ESG
  grants, 66 records, 72 documents, 29 users unchanged). Earlier lines in this section that say `0047`,
  `0048` or the history are behind are superseded by this one.
- **The deployment check, `DEPLOYMENT.md` and this note were committed on `feature-employee-uploads` and
  pushed to `ucn` and `origin` on 2026-10-12** (owner's request). Not committed, the owner's own files:
  `.mcp.json`, `.vscode/mcp.json`, `PS_Documents/generated_reports/`, the employee import template.
- **Worker image rebuilt 2026-10-12** (owner's request): `traceesg-ocr-worker:latest` is now `5ee1ae92263e`,
  `rules-13`, with the error-report change (`worker/logs.py`) and pip upgraded last. Checked in the image:
  worker unit 44/44, the OCR engine loads. **The container `traceesg-ocr-worker-hosted` was recreated from it the same day** (owner's request; settings
  from `apps/ocr-worker/.env`, restart `unless-stopped`; it reports "worker ready", no errors in its log). The
  first attempt removed the old container and then failed to start the new one, so the worker was down for
  about a minute. No document has been put through the new container yet.
- **`feature-employee-uploads` is merged** (pull request #29, 2026-10-12) and the owner committed the MCP
  settings and report files on `main` (`4d4dea1`); `main` is the same on `ucn`, `origin` and locally. This
  note and the worker entry above are on branch `docs-worker-image-note`, pushed to both, not merged.
- **Report PDFs and database connections on Vercel (2026-10-12, committed, on `origin` and `ucn` `main`,
  `fe93b23`):** the packaged browser is launched as a headless shell (`lib/reports/pdf.ts`), and on Vercel
  the pool is 3 connections that close after 5 idle seconds (`lib/pooler-url.ts`). Three reports were
  generated on the deployed site. `CHROMIUM_EXECUTABLE_PATH` must not be set on Vercel.
- **A six-stage piece of work was agreed on 2026-10-13** (`.grill/scoped-admin-onboarding-decisions.md` — read
  it first; it holds every decision): (1) Super Admins and scoped Administrators, (2) invitation links in
  place of emailed passwords, (3) session time limits, (4) an org-tree picker, Scope 1/2/3 filters and Excel
  exports, (5) demo requests, public docs and signed-in help, (6) a phone and tablet pass. Each stage is its
  own branch, merged before the next starts.
- **Stage 1 — Super Admins and scoped Administrators — is done on branch `feature-scoped-admins`,
  uncommitted; migration `0050` is on the LOCAL database only** (D41, A37, `UI_NOTES.md`). The `admin` role
  is the Super Admin (at most two, enforced by the database); a new role `org_admin` ("Administrator")
  administers its org unit and everything beneath. Checked: web unit 204/204, database 336/336, the
  cross-project procedure test 264 passed (2 cannot run outside the app), the full end-to-end suite on the
  local stack 344/344 plus the new `tests/e2e/scoped-admin.mjs` 77/77, lint, typecheck, format, production
  build, and eight screens viewed in Edge as a project Administrator with no console error. **Not run:** the
  chatbot and accessibility suites, phone and tablet widths, the other two themes, anything on hosted.
  **Not built in stage 1:** the Super Admin's own-record mark in the report drill-down (it is in the audit
  trail and the record's history); a notification to Administrators when a record in their scope is flagged
  (Super Admins still get it); scoped versions of OCR Monitoring, Deadlines, Forecast, Simulator and Carbon
  credits (Super Admin only for now).
- **Stages 2 and 3 — invitation links and session time limits — are done in the same working tree
  (`feature-scoped-admins`), uncommitted; migrations `0051` and `0052` are on the LOCAL database only**
  (D42, D43, A38, A39, `UI_NOTES.md`; the agent's own decisions are listed in the decision log under
  "Decisions made while building stages 2 and 3" for the owner to confirm). The owner asked for both at
  once with stage 1 still uncommitted, so the three stages are one change, not three branches.
  - *Stage 2:* Invite user and bulk import email a link (`/invite#token`), never a password; the token is
    stored only as a hash, works once, for 24 hours; Resend replaces the link, Revoke cancels it; the new
    public page `/invite` sets the password and uses the link up in one transaction and signs nobody in;
    forgot-password sends no code to an account that was never set up.
  - *Stage 3:* a sign-in ends after 3 hours without activity and 12 hours in all (`user_sessions`,
    `touch_session`, checked in `resolveSession`); only what the person does on the page counts as
    activity; a notice five minutes before the end; an ended session signs out that device only.
  - Checked on the local stack: web unit 210/210, database 367/367 (31 new), the whole end-to-end suite
    on the built app **519/519 over eleven scripts** (the new `invitations-sessions.mjs` is 98 of them:
    real emails read from the mail catcher, the real page in Edge, two submissions of one link at once,
    clocks moved in the database), cross-project procedures 264 passed (2 cannot run outside the app),
    chatbot 49/49, accessibility 188 passed / 0 failed / 2 known open (`/invite` added; it now also runs
    beside two Super Admins), lint, typecheck, format, production build. Users, the Manage panel, the
    invalid-link page and the sign-out notice were looked at in Edge at 1440 and 390px, no console error.
  - **Not run:** a real email through Brevo; anything on hosted; a real three-hour wait (the tests move
    the clock in the database); tablet width; the notice in the Dark and Special themes; the valid
    invitation form was driven by the test but not looked at as a picture.
  - **Not built:** `scripts/provision-user.ts` without `--password` still uses Supabase's own invite email.
- **2026-10-30: `0051` and `0052` are on hosted** (owner's "go"; step (1) below is done). Read back: both
  recorded, both tables, `touch_session` and the two settings present; 34 users, 70 records, 33 assignments
  unchanged. The hosted Supabase project had been paused (free tier) and was restored by the owner the same
  day. The script's paths now point at this checkout.
- **2026-10-30: steps (2) and (3) done.** `b462a2b` is on `ucn` and `origin` `main` and deployed on Vercel
  (the owner pushed to `origin`); then `hosted-admin-placement.cjs apply` (owner's "go"): `0050` recorded,
  roles "Super Admin" and "Administrator", `admin@meil.local` the only Super Admin, Bal / DD / AB / AD
  Administrators of Olectra Greentech / EVEY / MSRTC e-bus order / BEST Mumbai e-buses; 70 records, 33 users,
  32 assignments unchanged. Still to come: step (4), the second Super Admin invited from Admin → Users.
- **Owner's feedback of 2026-11-01 is committed (`3489329`) and on `ucn` `main`; `origin` `main` and the live site are
  still on `b462a2b`.** `.grill/org-tree-users-notifications-periods-decisions.md`, D44, A40. **`0053` is on hosted**
  (2026-11-01, owner's go): its job ran and closed August 26-27 by itself, audited, Test Admin notified; 70 records
  (61 approved), 33 users unchanged. **No period is open on hosted, so uploads are paused** until a Super Admin opens one.
  Next: the owner pushes to `origin` to deploy.
- **Users tab (2026-11-01, owner's requests), on `ucn` `main`, NOT on `origin` (the owner said not to push there for
  now), no migration:** sorted by role by default with a Sort by control (`lib/users/sort.ts`); an Employee ID filter
  and Add ID for people with none (`users.setEmployeeId`: once saved it cannot be replaced, nobody sets their own, an
  Administrator only inside their unit). Checked: `tests/e2e/feedback-2026-11.mjs` 88/88, web unit 218/218. Not re-run:
  the rest of the end-to-end suite. To confirm with the owner: self-assignment (`admin@meil.local` cannot get an ID
  until a second Super Admin exists); a way to correct an ID.
- **Hosted, in this order:** (1) `node "test data/_backup/hosted-invitations-sessions.cjs" apply` — `0051`
  and `0052`, additive, safe under the code that is live today, and it must come BEFORE the deploy
  (its `check` mode was run: nothing of either is there, 34 users, 68 records); (2) merge and deploy the
  code; (3) `node "test data/_backup/hosted-admin-placement.cjs" apply` — AFTER the deploy (its `check`
  mode was run earlier). In one transaction it takes the Super Admin role from Bal, DD, AB and AD, applies
  and records `0050`, and makes them Administrators of Olectra Greentech, EVEY, MSRTC e-bus order and BEST
  Mumbai e-buses; run before the deploy it would leave the old code with people who hold `org.manage` and
  no scope check. (4) `admin@meil.local` invites `niharbehera965@gmail.com` as the second Super Admin from
  Admin → Users. The migration history will hold `0051`, `0052` before `0050`; both scripts record by hand,
  so a plain `supabase db push` is not needed and should not be used for these three.
- **Feature roadmap (2026-11-07):** `PS_Documents/implementation_docs/feature_enhancement.md` (owner's file,
  untracked) is the master document; its Appendix A holds every requirement's status. Phase 0 audit:
  `FEATURE_ENHANCEMENT_AUDIT_2026-11-07.md`. **Phase 1 is done on branch `feature-session-takeover-security`**
  (fast-forwarded to `ucn/main` `95545c3` first), **uncommitted; migration `0055` is on the LOCAL database only.**
  `ucn/main` gained a ui-lane `0054` (absolute session limit 72 hours): its setting is on hosted, the migration is
  not recorded there. **Both `0054` and `0055` were applied to hosted on 2026-11-07 (owner's "go") with
  `test data/_backup/hosted-0054-0055.cjs`** after the dev server on 3000 failed with "touch_session_single does
  not exist"; read back: both recorded, functions present and closed to the browser roles, 34 users, 73 records
  and 25 session rows unchanged (backup `hosted-0054-0055.backup.json`). Phase 1 is committed (`6b6c0e3`).
  Requirement 37 (local database) is deferred by the owner until after the HoD demo.
- **Phase 2 (2026-11-07/08), uncommitted on `feature-session-takeover-security`; migration `0056` local and hosted**
  (decisions in `.grill/feature-enhancement-roadmap-decisions.md`, D46, A42). Several open periods, late uploads
  (due +15 / late +45 days), Late / Same-file / Same-bill validation flags, bill number on records, document-type and
  activity filters, stage tracker, Admin type correction and wrong-activity return, approval rows with thumbnails,
  readable download names. Checked: web unit 243/243 (plus new), database 425/425, `phase2-lifecycle.mjs` 45/45,
  typecheck, lint 0 errors, production build. Full end-to-end suite: 12 of 13 scripts pass in full
  (578 checks); feedback-2026-11 stops at the old Add ID refresh step, as before Phase 2. Browser check `ui-phase2.mjs` 13/13 in Edge. Appendix
  and PROGRESS updated. **`0056` applied to hosted on 2026-11-08 (owner's "go")** with
  `test data/_backup/hosted-0056.cjs` (backup `hosted-0056.backup.json`); read back: functions present and closed to
  the browser, 3 new columns, 48 bill numbers back-filled, auto-close job present, 34 users and 73 records unchanged.
  Hosted's open period "oct" has no late date, so it closes on its due date (11 Nov 2026) unless one is set.
  Findings: Grid Electricity captures no bill number (same-bill and Bill no. work only for the 40 activities with
  one); every activity maps to one document type, so type correction has nothing to choose until one has several.
- **Phase 3 (2026-11-08), uncommitted. On hosted since 2026-11-08 (owner's "go"):** migration `0057` (read back:
  the field exists, 34 users and 73 records unchanged) and the OCR worker on `rules-14`: `traceesg-ocr-worker:latest`
  now = the rules-14 image, container `traceesg-ocr-worker-hosted` recreated with the old container's own four
  settings, reports "worker ready"; hosted queue: 79 jobs, all completed. The previous container is kept stopped as
  `traceesg-ocr-worker-hosted-rules13` (image `5ee1ae92263e`) for rollback; delete it once rules-14 has read a real
  upload. The end-to-end suite takes `E2E_WORKER_IMAGE`.
  Handwriting (req. 15) waits for the owner's bus-ticket photos.
- **Phase 4 (2026-11-08), uncommitted; migration `0058` applied to hosted 2026-11-08 (owner's "go")** with
  `test data/_backup/hosted-0058.cjs`; read back: RLS on, closed to the browser roles, the one-open-step index
  present, 34 users and 73 records unchanged. The local stack has test Administrators `e2e.prjx.admin` (PRJ-X) and `e2e.suba.admin` (SUB-A).
- **Phase 5 (2026-11-08), uncommitted; migration `0059` applied to hosted 2026-11-08 (owner's "go")** (D49, A45; decisions in
  `.grill/feature-enhancement-roadmap-decisions.md`). Deadline reminders: `lib/reminders/plan.ts` (who gets what,
  pure), `lib/reminders/run.ts` (claims a `reminder_sends` row, then sends), `app/api/cron/reminders/route.ts`
  (Bearer `CRON_SECRET`; 503 when unset), `vercel.json` cron `30 3 * * *`, the Reminders section on Reporting
  Deadlines (open to Administrators). `0059` read back on hosted: recorded, `reminder_sends` with RLS and no
  browser access, the default schedule row, 34 users and 73 records unchanged. **Still to do:** `CRON_SECRET`
  (16+ characters) in the Vercel project and a deploy; until then the daily trigger refuses every call. The local e2e env file in the scratchpad now has a `CRON_SECRET`.
- **Phase 6 (2026-11-08), uncommitted; migration `0060` applied to hosted 2026-11-09 (owner's "go")** (D50, A46; decisions in
  `.grill/feature-enhancement-roadmap-decisions.md`). Factor versions carry their source (link, publisher, FY,
  read date, typed or fetched); `lib/factors/source.ts` fetches only from `org_settings.factor_source_hosts`
  (guarded lookup, no private addresses); every new version is a draft that another Super Admin approves
  (`factors.approve`; the only Super Admin may approve their own, marked); a yearly review on Conversion
  Factors; `carbon_credit_links` on Carbon Markets. `0060` read back on hosted: recorded, `carbon_credit_links`
  with RLS and no browser access, 6 preset links, the approval trigger present and closed to the browser roles,
  the official-site list set; 31 factor versions still active (shown as "Before the approval step"), 34 users
  and 73 records unchanged. Every new factor on hosted is self-approved until a second Super Admin exists. New test: `pnpm --filter web test:factors` (needs the local
  database's two Super Admins). Full end-to-end suite: 16 of 17 scripts in full (feedback-2026-11 stops at the
  old Add ID step); invitations-sessions 112/112 once run with `E2E_APP_URL=http://localhost:3100`.
- **Phase 7 (2026-11-09), uncommitted; migration `0061` applied to hosted 2026-11-09 (owner's "go")** (D51, A47; decisions in
  `.grill/feature-enhancement-roadmap-decisions.md`, "Phase 7 decisions"). New page `/admin/carbon-analytics`
  (Super Admins and Administrators): year-wise emissions by scope and activity, compared like for like
  (`lib/analytics/trends.ts`), rule-based suggestions (`recommend.ts`) with AI wording on request
  (`wording.ts`, refused when it adds figures), emission alerts against the same period of earlier years
  (`alerts.ts`, `run-alerts.ts`), run by the same daily cron call as the reminders and by "Check now".
  `0061` read back on hosted: recorded, both tables with RLS and no browser access, the guard trigger present and
  closed to the browser roles, thresholds 20% per scope, no alerts; 34 users, 73 records, 2 periods unchanged. New tests:
  `pnpm --filter web test:analytics`, `tests/e2e/phase7-analytics.mjs` (in the suite), `ui-phase7.mjs`. Full
  end-to-end suite: 17 of 18 scripts in full (feedback-2026-11 stops at the old Add ID step, 85 checks before
  it). AI wording not confirmed with a real reply: see §2.
- **Phase 8 (2026-11-09), uncommitted; migration `0062` applied to hosted 2026-11-09 (owner's "go")** (D52, A48, `UI_NOTES.md`;
  decisions in `.grill/feature-enhancement-roadmap-decisions.md`, "Phase 8 decisions"). Report templates
  (`lib/reports/templates.ts`, `template-html.ts`, `extras.ts`, `workbook.ts`; `report_runs.template`, the GHG
  inventory's `.xlsx` beside its PDF); top-bar search (`lib/search/*`, `components/search/global-search.tsx`,
  `search.global`); Scope Table / Chart kept as `view=chart`; the Ask button and landing fixes (the owner asked the
  feature lane to do these ui items). `0062` read back on hosted: recorded, the 13 existing runs read as `brsr`
  with no workbook, the reports bucket private and taking PDF and .xlsx, the browser roles still unable to change
  a run; 34 users, 73 records, 2 periods unchanged. New tests: `pnpm --filter web
  test:search`, `tests/e2e/phase8-templates-search.mjs` (in the suite), `ui-phase8.mjs` (axe included). Full
  suite: 18 of 19 scripts in full after one fix (feedback-2026-11 stops at the old Add ID step, 85 checks before
  it); accessibility suite 188 passed / 0 failed / 2 known open (now also on Carbon Analytics).
- **Phases 9 and 10 (2026-11-09), uncommitted; no migration.** Phones: bottom bar and Menu drawer
  (`components/shell/sidebar.tsx`), tap cursor fixed (`registry/magicui/pointer.tsx`), installable app
  (`app/manifest.ts`, `public/sw.js`, `docs/MOBILE_APP.md`). Help at `/app/help`. Runbooks:
  `docs/PRODUCTION_DATABASE.md`, `docs/LOCAL_DATABASE_SERVER.md`, `RELEASE.md`. New tests: `test:scale`,
  `tests/e2e/release-checks.mjs` (in the suite), `ui-phase9.mjs`, `ui-phase10.mjs`.
- **Hosted was reset on 2026-11-09 (owner's go)** with `test data/_backup/hosted-reset.cjs`: 7 people (2 Super
  Admins, 5 Administrators), 6 org units and the configuration kept; everything else, every stored file and
  the audit log removed; one `platform.reset` audit entry. Full backup (restored and compared) in
  `test data/_backup/hosted-reset-2026-11-09/`. Every kept person was signed out.
- **The local database server** (`emeilsg_local_server`, `D:/Non Newtonian Things/emeilsg-local-server`, ports
  544xx) holds the same data, verified against hosted; the app runs on it with `pnpm --filter web
  dev:local-server` (`apps/web/.env.localserver`).
- **2026-11-09, owner's request: the app points at the local server.** `apps/web/.env.local` and
  `.env.production.local` switched (database, Auth, storage, chatbot); hosted values in `*.hosted-backup`. Sign-in
  is the local server's own Auth (the 7 accounts and passwords). Docker: the local server (six containers) and one
  OCR worker `emeilsg-ocr-worker-local`; `traceesg-ocr-worker-hosted` stopped, not deleted (hosted / Vercel uploads
  wait for OCR). **The e2e suite and the test stack now need `E2E_ENV_FILE`** (the scratchpad's local test env):
  `.env.local` no longer names the test stack either. Stop the local server before starting the test stack
  (memory).
  Two temporary files stay inside its database container: `/tmp/public.dump` and `/tmp/defacl.list` (a safety
  check stopped their removal); delete them with `docker exec supabase_db_emeilsg_local_server rm
  /tmp/public.dump /tmp/defacl.list`.
- **Chatbot scope refusals (2026-11-09, owner's request), uncommitted, no migration:** a lookup of a unit outside
  the person's scope ends the question with fixed words, and an answer with no successful lookup is replaced by a
  fixed refusal (a short question back is allowed). `lib/chat/orchestrate.ts` (`OUT_OF_SCOPE`), `lib/chat/tools.ts`
  (`ToolError.kind`), `tests/chat.test.ts`; `.grill/chat-analyst-decisions.md` last section. Unit 288/288,
  typecheck, lint, format. Not run: `test:chatbot`, the real model (key refused, §2).
- **2026-11-10/11: chatbot model and monthly test data.** `lib/chat/nim.ts` also reads `OPENAI_API_KEY` /
  `OPENAI_MODEL` / `OPENAI_BASE_URL`; `.env.local` now uses `nvidia/nemotron-3.5-lightning-30b-a3b` (GLM 5.3 flash
  hangs, others 404/410). `test data/<Month Year>/` for April 2025 to October 2026 (66 bills a month;
  `make_monthly_data.py`, `feed-monthly-data.mjs`, `synthetic_extraction.py`; `test data/README.md`). **Local
  server:** April 2025 to September 2026 fed and closed (July to September through real OCR, earlier months
  direct-load), October 2026 open and empty. **Hosted:** prepared, April 2025 to June 2026 fed; **July to September
  2026 not finished** (the real-OCR run was killed for low memory; July has 16 uploaded + 3 read records) and **no
  hosted month is closed yet** — rerun `feed … --extract ocr` for those three months, then `close`, only when the
  owner asks. 17 test accounts per database (`<role>.<unit>@emeilsg.test`, passwords in `test data/_backup/`). All
  of it is in `e763572`, pushed to `ucn` `main` (not `origin`). The hosted worker container is stopped again.
- **Owner's page feedback of 2026-11-11, committed as `e148b9e` on branch `feature-page-feedback-2026-11-11` and pushed to `ucn` `main` (fast-forward, no pull request, CI not run; not on `origin`)** (from
  `e763572`; A50, `.grill/page-feedback-2026-11-11-decisions.md`, `UI_NOTES.md`; no migration). Submission
  Monitoring / Data Explorer filters (no Document type, Activity by scope, upload-date range, Reset filters, wider
  Period, submitter role line), the factor review's years (current FY back; neither database had future-year rows),
  Save schedule also sends today's reminders (Run now gone), Deadlines' who-can-submit rule and wording, Audit Trail
  (auto-apply, linked filters, Clear filters, suggestions and word-form search), split page undo/redo and arrow
  keys, every right-hand panel expandable to the whole window and resizable. `apps/web/tsconfig.json` restored to
  `95545c3` (Next had added `.next-e2e` includes, committed in `e763572`). Checked: typecheck, lint (0 errors), web
  unit 292/292 (4 new in `tests/audit-words.test.ts`), format (only the known `app/loading.tsx`, `app/page.tsx`),
  and Edge on a dev server against the local server as a temporary Administrator at MEIL, 31/31 after one test
  expectation was corrected (filters, role line on real September rows, badge fit, date range, panel
  expand / Esc / drag / keyboard / remembered width / reset, Deadlines wording, Audit Trail suggestions and linked
  filters, phone width). **Not run:** the production build, database tests, the e2e suite (`ui-phase2/4/5.mjs`
  were updated for the removed controls but not run), the split page and Conversion Factors and Save schedule in a
  browser (they need a Super Admin or a pending multi-bill PDF), an on-behalf upload's role line (no such record on
  the local data). The temporary account `ui.check.admin@emeilsg.test` is deactivated on the local server.
- **Upload description and expected-submission progress (2026-11-11, owner's request), uncommitted on branch
  `feature-upload-description-progress` (from `e148b9e`); migration `0063` is on the LOCAL server only, NOT on
  hosted** (D53, A51, `.grill/upload-description-progress-decisions.md`, `UI_NOTES.md`). Checked: typecheck, lint,
  unit 292/292, format (known two), the new database test 5/5 on the local server, the procedures 11/11 there
  (`documents.expectedProgress` against the tables, `setDescription` rules and audit; the description was put back),
  the Upload page in Edge 5/5 (description box, the list beside the form, phone width). **Not run:** an actual upload
  with a description, a ticked item seen in the browser (October has no uploads for the units with expectations),
  Verify's editor in a browser, the build, the e2e suite. **Hosted needs `0063` before this code runs against it.**
  Only MSRTC (2), BEST (1) and Olectra (1) have expected submissions on the local database.
- **Conversion factors per financial year (2026-11-11, owner's request), uncommitted on the same branch
  (`feature-upload-description-progress`); migration `0064` is on the LOCAL server only, NOT on hosted** (D54, A52,
  `.grill/factor-financial-years-decisions.md`). Versions are "effective for FY X to FY Y", inherited after Y; new
  versions start next FY unless the years have no value yet; PNG moved to 1 Apr 2026. Checked: database tests
  482/482 on the test database (with `0063`/`0064`), the 704 stored calculations pick the same versions, the
  procedures 8/8 on the local server (refusals and yearly review; nothing written), typecheck, lint, unit 292/292.
  **Not run:** the Conversion Factors page in a browser (needs a Super Admin login), `test:factors` and the e2e
  suite, the build. PNG's April–July 2026 records need "Run calculation".
- **Eye button on Verify (2026-11-11, owner's request), uncommitted on the same branch; migration `0065` on the
  LOCAL server only** (D55, A53, `.grill/extraction-boxes-toggle-decisions.md`). Checked: Edge 8/8 as MSRTC's
  Project Manager on two September documents (off by default, on colours every box, the key, the next document and
  a new browser session open with it on, off sticks; the account's choice put back to off), typecheck, lint, unit
  292/292. Not run: the build, the e2e suite, database tests after `0065`.
- **Also 2026-11-11, same branch, uncommitted, no migration:** Carbon Analytics suggestions have "Which project
  emits the most?" (A54; checked in Edge as the temporary Administrator, reactivated and deactivated again: the
  coal suggestion lists BEST Mumbai e-buses, 12,088.9 tCO2e, 24 records, which the tables confirm). Section A of
  BRSR Disclosures: 9 written answers added on the LOCAL server from meil.in (24 of 26 answered; hosted has 15);
  the FY 2023-24 annual return link on meil.in is broken (404), so answers still cite FY 2022-23.
- **All the 2026-11-11 work above on branch `feature-upload-description-progress` was committed as `38da203` and pushed
  to `ucn` `main` (fast-forward, no pull request, CI not run; not on `origin`). Migrations `0063`-`0065` are on the
  local server only. BRSR answers (134 written, sample ones labelled) are data on the local server, not in git.
- **Migrations `0063`-`0065` were applied to hosted on 2026-11-11 (owner's request)** with
  `test data/_backup/hosted-0063-0065.cjs`; read back: history at `0065`, both new columns, the year trigger, no
  browser write grants, PNG moved to 1 Apr 2026, every version on year boundaries; 24 users, 1,009 records, 825
  calculations unchanged; the 585 current calculations with a factor pick the same version. Earlier lines saying
  these are local only are superseded.
- **Request a demo (2026-11-11, owner's request), uncommitted on `feature-upload-description-progress`; migration `0066`
  on the LOCAL server only, NOT on hosted** (D56, A55, `.grill/demo-requests-decisions.md`). Checked: Edge 7/7 on the
  landing page signed out (no id before sending, field errors, the player after sending, phone width; YouTube loaded
  the video in the frame), database tests 482/482 with `0066`, typecheck, lint, unit 292/292. The two test requests
  were removed. Not run: the Demo Requests page in a browser (Super Admin login), the build, the e2e suite.
- **2026-11-11/12: hosted is the primary again; the local server is an hourly one-way copy** (owner's decision).
  `docs/LOCAL_DATABASE_SERVER.md` §5 has the details: hosted was first brought up to local (0066, BRSR answers,
  Jul-Sep 2026 directly, 18 months closed); `.env.local` / `.env.production.local` point at hosted (local versions in
  `*.localserver-backup`); hosted OCR worker running, local worker stopped; Windows task "EmeilSG hosted to local
  sync" runs `apps/web/scripts/sync-hosted-to-local.mjs` hourly (checked: 58 tables matched; a scheduled run exit 0).
  Local backup before the switch: `test data/_backup/local-backup-2026-11-11/`. The owner's 5 October test uploads
  existed only on local; the two files are in `test data/_backup/your-october-uploads/` to re-upload. **The owner
  restarts the dev server.** Never write to the local server now. Migration `0066` is on hosted.
- **Category mismatch and activity list on Verify (2026-11-12, owner's request), uncommitted on `feature-upload-description-progress`, no migration** (A56, `.grill/verify-activity-change-decisions.md`): before Confirm, Verify lists every activity the Upload page offers and flags a Category mismatch naming the likely activity (hosted has two CNG records that are electricity bills); changing it re-queues OCR for the new fields. Checked: typecheck, lint, unit 292/292, the mismatch query read-only on hosted. **Not run:** a change through the app, a browser view, the build, the e2e suite.
- **Subsidiary → business unit → project (2026-11-12, owner's request), uncommitted on `feature-upload-description-progress`, no migration** (A57, `.grill/org-structure-decisions.md`): a business unit sits under one subsidiary and is never shared; projects sit under business units (`lib/org/rules.ts`, every add / move / parents / bulk-import path); a business unit's panel ticks its projects (`organization.setChildren`); a project still straight under a subsidiary is marked and moves to the first business unit ticked. Checked: typecheck, lint, unit 293/293 (new structure test). **Not run:** the page in a browser, the procedures against a database, the e2e suite (`feedback-2026-11.mjs` updated), the build. **Hosted tree not rearranged:** Olectra has BU Transport (no projects) and BEST, MSRTC, Seetharampur straight under it; EVEY has TGSRTC straight under it.
- **Role-wise dashboard (2026-11-12, owner's request), branch `feature-role-wise-dashboard`, local commits only, NOT pushed** (`.grill/role-dashboard-decisions.md` holds the 13 decisions; audit and plan are in that chat/file). **Phase 0 built:** a permission-aware scope helper (`lib/auth/scope.ts`), the monitoring pages and Reports opened read-only to `monitoring.view` / `report.generate` holders (Corporate ESG), Control Tower header counts scoped to the subtree. Unit tests pass; **not run:** ESLint, build, the database isolation test (extended, needs Docker + local stack), end-to-end, any browser view. This machine had no Node or Docker, so tests ran under Bun against a partly linked `node_modules`. Next: Phase C (capture, migrations `0067`+, Auditor role, new Finance/HR permissions), then dashboard phases 1-5. `feature/esg-decision-intelligence` (teammate, 72 files) goes to `main` later and uses migration numbers `0053`-`0055` that `main` already has; its owner must renumber.
- **Role-wise dashboard, Phase 1 (capture) written 2026-11-12 on `feature-role-wise-dashboard`, local commits only, NOT pushed,
  UNVERIFIED against a database** (migrations `0067`-`0070`, OCR `rules-15`; checklist in `ROLE_DASHBOARD_VERIFY.md`; decisions in
  `.grill/role-dashboard-decisions.md`): four new permissions and the read-only Auditor role (`0067`), Core KPI flag from SEBI Annexure I,
  Finance/HR typing their own BRSR answers and Finance entering the yearly inputs incl. net worth (printed in the report), a **draft**
  question-to-permission mapping (`0068`), CSR beneficiaries / within-India spend / compliance certificates (`0069`), and the employee
  register (`0070`, `/app/employee-register`: totals only, file kept private). Passing here: typecheck, lint, Prettier, web unit tests
  (319), worker unit tests (59). **Not run:** the migrations, every pgTAP test, `pnpm build`, e2e, isolation, a browser. The dashboard
  itself: **Phase 2 (tile registry, visibility, ordering, `dashboard.tiles`, a band and grid on `/app` and `/admin`) is written, unit-tested (330) and unverified against a database**; **Phase 3 (SVG chart kit `components/charts/`, `--chart-1..6` tokens in all themes, rings on the Reporting completion tile, duplicate period/task cards removed on `/app`) is written, unit tested (342) and not seen in a browser**; **Phase 4a (the Group Overview from the owner's reference screenshot: emissions donut and trend, completion by level, hierarchy status, performance by unit; six tiles for `monitoring.view` holders) is written, unit-tested (347), builds, and its SQL is unrun and unseen in a browser**; **Phase 4b (role-keyed tiles: Your area's records, Missing in your area, Project Manager emissions, HR register, EHS certificates, Finance yearly inputs, Auditor evidence coverage, BRSR readiness, and the Super Admin's factors, people and access, activity) is written, unit-tested (354) and builds; its SQL is unrun and unseen in a browser.** Not built: an Administrator's people tile, the Finance disclosure tile, collapsible hierarchy rows. **Phase 5 (tiles follow the org picker through `dashboard.tiles({ orgUnitId })`; the pipeline cards, readiness card and two Issues rows removed from `/admin`) is written, unit-tested (356) and builds; unrun and unseen.** Left: a chatbot tile, the Deadlines engine as a source of overdue. **Phase 6 (tests) is written, not run:** `tests/e2e/role-dashboard.mjs` (API, every role, scope, narrowing, refusals, no tile failing to load; in the suite) and `tests/e2e/ui-role-dashboard.mjs` (browser, three themes, three widths, axe), plus two more unit tests (358). **Then, at the owner's request, the Upload page's Expected submissions card became a dashboard tile for every non-admin who is expected to submit (359 unit tests; unrun against a database).** MACRO72 runs them, steps in `ROLE_DASHBOARD_VERIFY.md`. This machine now has Node 26 and pnpm 12.4.2 (installed 2026-11-12); no Docker.
- **Commit only when the owner asks.** One phase at a time; stop and wait for the go-ahead.

## 2. Waiting on the owner (do not decide these alone)

| Question | Notes |
|---|---|
| **For MACRO72: verify and resolve** (full stack, `D:\Non Newtonian Things`) | Everything on `feature-role-wise-dashboard` that touches a database or a browser: apply `0067`-`0070` in order on a database at `0066`, run `pnpm db:test` (the count edits to `phase2_smoke`, `role_permission_defaults`, `chat_analyst` were made by hand and never run), `test:isolation` (extended), e2e, a11y, `pnpm build`, then the browser steps in `ROLE_DASHBOARD_VERIFY.md`. Push `0069` before replacing the hosted OCR worker with the `rules-15` image. `feature/esg-decision-intelligence` uses `0053`-`0055`, which `main` has: whoever merges second renumbers. |
| **For MACRO72 (1 of 4): certificate validity** | On a compliance certificate, "Validity (months)" is typed by the person: Verify needs exactly one required number field and a certificate rarely prints it. Decide whether to keep that, or change `activityFieldKeys` in `lib/verification/rules.ts` to allow an activity with no number (touches the verification core: test it). |
| **For MACRO72 (2 of 4): the register is not read yet** | `employee_registers` totals are stored and approved but the dashboard and the BRSR report do not read them (A-20 headcount, A-22 turnover, P5-E3(b) women's wage share, P8-E5 smaller-towns wages). Wire them in when the dashboard phase starts; the roll-up helper is `sumTotals` in `lib/register/register.ts`. Also check a register near the host's request-body limit (Vercel 4.5 MB). |
| **For MACRO72 (3 of 4): net worth in the report** | Net worth is now entered with the yearly inputs and printed beside turnover in the report's methodology table (`lib/reports/html.ts`; unit test passes). Verify by generating a report for a year with net worth entered, and for an older year without it (should read "Not provided"). Not yet in the Excel workbook or the A-24 CSR details answer. |
| **For MACRO72 (4 of 4): the Finance/HR mapping is a draft** | `0068` sets which written BRSR answers HR and Finance/CSR may type. The owner has not approved the list (see the table in `.grill/role-dashboard-decisions.md` and the migration's comments). Do not apply to hosted until the owner approves; unsure items: P3-E14, P5-E9, P8-L3, P1-E7. EHS and Procurement have no typed-answer permission yet (owner to decide). |
| Expected submissions for the demo (2026-11-11) | The Upload page's progress list is empty for most projects: only MSRTC, BEST and Olectra have expectations. Fill them in on Admin → Organization, or ask the agent to set them from the test data. |
| Daily reminders on Vercel (2026-11-11) | Save schedule now sends today's reminders at once, but nothing runs daily until `CRON_SECRET` (16+ random characters) is added to the Vercel project's environment variables and the app is redeployed; the panel then says "Active · runs daily at 9:00 IST". |
| Hosted July–September 2026 test data (2026-11-11) | The real-OCR load was killed for low memory and not restarted (system rule). Say when to resume (`feed --months "July 2026,August 2026,September 2026" --extract ocr`, other apps stopped, hosted worker started), then `close` all 18 hosted months. |
| NVIDIA key in `apps/web/.env.local` (2026-11-09) | NVIDIA now refuses the key itself ("Authorization failed", 403, every model); before that the three listed models answered 404 / 410 / timeout. The owner creates a new key at build.nvidia.com and puts it in `NVIDIA_NIM_API_KEY`; then probe models with the scratchpad's `nim-probe.mjs` pattern (tool call, no MEIL data) and set `NVIDIA_NIM_MODEL`. Until then the chatbot and Phase 7's AI wording do not work. |
| Phase 6–10 build-time choices | Listed under "Built that way" in `.grill/feature-enhancement-roadmap-decisions.md` for each phase: thresholds for rising / unusual month / largest source, alert window and minimum increase, factor units and fetch limits. |
| Phase 1 of the feature roadmap (2026-11-07) | Confirm the build-time decisions in `.grill/feature-enhancement-roadmap-decisions.md` (sessions that skip the form replace the others; the Super Admin email goes to the Super Admin whose account took over). |
| For the ui role (2026-11-07) | The root `app/loading.tsx` makes server redirects arrive inside a 200 page; `app/loading.tsx` and `app/page.tsx` fail `format:check`; after Add ID on Users the filtered list does not refresh (feedback-2026-11 stops there, also without Phase 1). |
| Hosted OCR worker | `traceesg-ocr-worker-hosted` was found exited (137, out of memory) on 2026-11-07; hosted uploads wait until it is started again. |
| Stages 1–3 of the 2026-10-13 work | Say "go" for the hosted step that must come first (`hosted-invitations-sessions.cjs apply`; the dev server on port 3000 is broken until then), when to commit `feature-scoped-admins`, when to merge it, and when to run the placement script (after the deploy). Then stage 4 starts. |
| Decisions the agent made in stages 2 and 3 | Listed in `.grill/scoped-admin-onboarding-decisions.md`. The ones with a cost: forgot-password no longer works for an account that was never set up (an administrator sends a link); only activity on the page keeps a session alive; an ended session signs out that device only. |
| Brevo click tracking | If it is on for transactional email, invitation links pass through Brevo's redirect. Switch it off for this sender in the Brevo dashboard. |
| A second factor for Super Admins | Deferred by the owner (2026-10-13). Open risk: the two most powerful accounts rest on a password, and `admin@meil.local` is a shared login with no mailbox. |
| Dependency and deployment decisions | Confirm `xlsx` from the vendor's site (or read sheets with `exceljs` and drop `.xls`); `apps/web/.env.production.local` holds the full hosted settings and is read by `next build` / `next start` on this machine — delete or keep deliberately; rebuild the worker image when convenient. Dashboard checklist: `DEPENDENCY_AUDIT_2026-10-12.md` section 6. |
| Accessibility decisions | The custom cursor hides the system pointer on every page (a barrier for people who enlarge or recolour it); chart text alternatives on Forecast and Simulator; field-level errors on Admin forms; who does the manual keyboard and screen-reader pass. `ACCESSIBILITY_AUDIT_2026-10-12.md` sections 4 and 6. |
| Design decisions from the UI audit | The site-wide custom cursor (the audit's rules say remove, the landing brief says keep); the hero card deck and the two captions that read as results; renaming and restyling Deadlines and Carbon credits to match the rest; the pill button on sign-in; an em-dash copy pass; the browser icon colour. `UI_AUDIT_2026-10-12.md`. |
| Privacy and compliance decisions | Operator's legal name, address and privacy contact; legal basis and notice for employees; retention periods (audit log with IP addresses, documents and OCR text, notifications, reports); how people ask for access or erasure; processor terms (Supabase, Brevo, AI provider); landing wording ("Portfolio-Wide Deployment for MEIL", "by MEIL. All rights reserved" against the GPL-2.0 licence file, the FAQ's absolute "No"); the source of the six landing photographs; the Rs 2,500 carbon price and its stated source; a recipient for "Request a demo". List: `COMPLIANCE_AUDIT_2026-10-12.md` section 8. |
| Chatbot: contact details no longer go to the AI service | Changed on 2026-10-12 against the 2026-10-11 "full access for Admins" decision: the model gets names, roles and org units; email, employee id and file names stay in the table. Confirm, or say to restore (`.grill/chat-admin-access-decisions.md`). |
| After the August run | Keep or deactivate the 21 test accounts on hosted; enter factors for the 9 records waiting (or leave them); generate the report. Passwords: `test data/_backup/august-run-accounts.local.json`. |
| Security audit follow-ups | Reset the passwords of accounts already created by bulk import (they were guessable). Decide: bulk import with no password at all (first sign-in by emailed code); what the carbon pages show when no price is configured (today an invented 2,500). Open items F-08, F-10 and the `xlsx` replacement are in `SECURITY_AUDIT_2026-10-12.md`. |
| Chatbot on hosted | Migration `0042` is on hosted (2026-10-11). Still to do: the owner sets a password for `chat_reader` (`alter role chat_reader login password '…'` in the SQL editor) and puts `CHAT_DATABASE_URL` and `NVIDIA_NIM_MODEL` in `apps/web/.env.local`. Through the pooler the user is `chat_reader.<project-ref>` — untested. |
| NVIDIA's terms for the free endpoints | Real MEIL figures would go to a trial service. The owner said "for now"; read the terms on submitted prompts and the rate limits before MEIL relies on it. A locally served model is a setting (`NVIDIA_NIM_BASE_URL`). |
| Chatbot branch on MACRO72's repo | The owner pushed `feature-chat-analyst` straight to `ucn` `main` (2026-10-11). `origin` has neither the branch nor a pull request; `gh` is not installed. A pull request must say that the feature role built UI (`UI_NOTES.md`). |
| Readings of the 2026-10-11 feedback to confirm | Suggested questions were moved to the **bottom** of the chat pane; "aligned with the navbar width" was read as the same **height**; sharing is allowed at every level below group. `.grill/shared-org-units-decisions.md`. |
| Chatbot: how far "full access" goes | An Admin can ask about people and who submitted or approved records. Not included: audit trail, document text, written disclosures; and a non-Admin sees no people even inside their own scope. Employee names and emails in an Admin's answer go to the AI service. |
| Admin answers to complete | BRSR Disclosures holds only what meil.in states. Reporting boundary, contact person, assurance, PPP rate and every answer not on the website are empty. R-22's factor value came from a search summary. |
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
  deviation entry (D/A numbers continue: next are **D57** and **A58**; the next migration is `0067`), and note it in PROGRESS.md.
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
- **`exceljs` writes the bulk-import templates** (dropdowns, styling); `xlsx` reads the filled sheets. Both are
  needed.
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
- **A branch called `feature` exists, so `feature/<topic>` cannot be created** (git cannot hold both); use
  `feature-<topic>`.
- **A shell heredoc eats backslashes**: a regular expression written through one lost every `\d` and `\*`
  (twice). Put code with backslashes in a file with the file tool, or edit in place.
- **Local auth without the full stack:** `npx supabase stop`, then `npx supabase start -x
  studio,imgproxy,mailpit,realtime,storage-api,edge-runtime,logflare,vector,postgres-meta,supavisor` starts
  the database, auth and the gateway only (about 1.6 GB stayed free beside the dev server). With that, a
  production build into `NEXT_DIST_DIR=.next-e2e` and `next start -p 3100` gave a real browser check.
- **`chat_reader` has no password after `npx supabase migration up`** (the seed sets it only on a reset):
  `alter role chat_reader login password 'chat_reader_local'` once on the local database.
- **NVIDIA's model list includes models the account cannot call** (they answer 404 "not found for account"),
  and one key does not switch models by itself. Probe a model with a tool call before adding it to
  `NVIDIA_NIM_MODEL`.
- **pgTAP cannot be called while acting as a role without access to the `extensions` schema:** run the
  statement inside a helper that switches role and returns the error code (`chat_analyst.test.sql`).
- **The schema smoke test lists every public table:** a migration that adds one must add it to
  `phase2_smoke.test.sql`.
- **Running a tRPC procedure without the app:** with the scratchpad loader hook (`@/` → `apps/web`,
  `server-only` → nothing, `next/x` → `next/x.js`) and placeholder `NEXT_PUBLIC_SUPABASE_*` values,
  `createCallerFactory(router)({ session: { status: "active", session } })` runs a real procedure against the
  local database from plain Node. That is how the bulk import was checked.
- **Two side panels on one page stack and jam.** A docked panel is non-modal and does not close on a click
  elsewhere, so opening a second one leaves the first open underneath and its button does nothing. A page with
  more than one `Sheet` must close the others when it opens one (`show()` in `users-manager.tsx`; also fixed in
  `periods-manager.tsx`, 2026-10-11). Users’ bulk import is a side panel now, not a fold-out.
- **OCR does not detect a lone digit on a line** ("Fatalities: 0" comes back empty). Sample documents print
  "0 Nos". A document type needs two of its keywords on the page or the person must pick it.
- **A user the audit log names cannot be removed as a row** (foreign key, append-only log): `users.delete`
  keeps the row hidden (`deleted_at` set, address replaced) — filter `deleted_at is null` wherever people are listed.
  `calculations` and `audit_logs` refuse deletes for every role.
- **Running the worker's OCR on files without the database:** `OcrEngine(Path("models"))`, `to_page_images`,
  `extract_fields` with `FieldSpec`s (about 10 s a page; output is buffered until the end when redirected).
- **`pnpm exec` installs missing dependencies first** (it added `jszip`, already in `package.json`, to
  `node_modules`); harmless, but it takes half a minute and prints an install log.
- **Month names from `toLocaleDateString` differ between Node versions** ("Sep" / "Sept"); `rangeLabel`
  writes them out.
- **Python for one-off edit scripts:** there is no `python` on the path; use
  `apps/ocr-worker/.venv/Scripts/python.exe`.
- **The hosted worker container was found exited with code 137** (out of memory) on 2026-10-11 and was
  started again after the local checks.
- **A unit can have several parents and there can be several groups (migration `0044`).** Never walk
  `org_units.parent_id` alone for scope or totals: use `org_unit_tree`, `org_unit_links`, or
  `loadOrgNodes` + `descendantIds(…, "all")`. Main-parent-only walks are right for deactivation, move and
  delete. Never assume one row with `parent_id is null`.
- **The checkout at `D:\BRSR-MEIL` has no `apps/ocr-worker/.venv`** (seen 2026-10-11): the test-data
  generator needs only `pypdfium2`, `pillow` and `numpy`, which a throw-away venv in the scratchpad gives.
- **`test data/` is tracked now**, so regenerating it shows up in `git status` as changed and new files. Delete
  both set folders before regenerating: files left from an earlier run (or restored by a pull) stay beside the
  new ones and the same bill then exists twice.
- **This checkout had no `ucn` remote** until 2026-10-11 (`git remote add ucn https://github.com/IAMUCN/ps08_BRSR_meil.git`).
- **Anything read through `lib/db.ts` bypasses RLS**: a procedure that takes an org unit, record or report id
  must check the caller's scope itself (`lib/auth/scope.ts`). The 2026-10-12 audit found five routers that did not.
- **Session cookies are HttpOnly** (`lib/supabase/cookie-options.ts`): never add a Supabase client in the
  browser without revisiting that. `/reset-password` refuses a session without the marker cookie that
  `/auth/confirm` sets.
- **The local database in this checkout had no migration `0046`** until 2026-10-12 (`npx supabase migration up --local`).
- **A record's or document's org unit and submitter cannot be changed** (migration `0047`), an evidence link must
  stay inside one org unit, and a carbon batch cannot be over-drawn — fixtures and scripts that did otherwise
  now fail with 42501 or 23514.
- **Calling procedures from plain Node:** `apps/web/tests/isolation/hooks.mjs` is the loader (`@/`, `server-only`,
  `next/*`); run with `--conditions=react-server`. Compare a thrown error by `error.name === "TRPCError"`, not
  `instanceof` (the app loads its own copy of the class).
- **`pnpm --filter web test:chatbot` leaves four accounts behind** on the local database
  (`chat-audit.*@traceesg.test`, deactivated): the audit log names them and cannot be cleaned. `test:chatbot`
  also sets the local `chat_reader` password and replaces `fetch`, so no request reaches the real provider.
- **An absolutely positioned child escapes an `overflow-x-auto` box that is not positioned** (an `sr-only` label in a
  table header widened whole pages on phones). The global rule in `globals.css` now makes those boxes
  `position: relative`; keep it.
- **Git Bash rewrites arguments that look like paths** (`/admin/users` became a Windows path): prefix the command
  with `MSYS_NO_PATHCONV=1`. `node --env-file` cannot be used with `next build` (it lands in `NODE_OPTIONS`); load
  the file in a small wrapper instead.
- **Chrome reports boxes for content inside a closed `<details>`** but no text, so a script that looks for
  unnamed controls raises false alarms there.
- **Raw palette text colours fail contrast and ignore the theme** (`dark:` never applies; themes are `data-theme`).
  Use the status and text tokens; on a tinted surface use `text-foreground` (rule in `UI_NOTES.md`).
- **Running the browser checks** (`test:a11y`, the UI screenshots): start the local stack without storage,
  build with a local env file and `NEXT_DIST_DIR=.next-e2e`, `next start -p 3100`; afterwards delete
  `apps/web/.next-e2e` (lint scans it and fails) and `git checkout apps/web/tsconfig.json`.
- **`pnpm audit --prod --audit-level=high` is a CI gate now.** A new advisory fails the web job; an accepted one
  goes under `auditConfig.ignoreGhsas` in `pnpm-workspace.yaml` with its reason.
- **`.next/dev` holds a development server's output, source maps included;** a production build's browser files
  are in `.next/static` and have none. Check the right folder before reporting exposed maps.
- **A production build made on this machine reads `apps/web/.env.production.local`** (hosted values). For a local
  test, export local values first: real environment variables win over the file.
- **The end-to-end suite needs the mail catcher:** starting the local stack with `-x mailpit` makes every script
  fail at set-up ("The invite email could not be sent"). Keep `storage-api` and the mail catcher running.
- **This machine has Python 3.12 on the PATH but no worker venv:** `E2E_PYTHON` can point at any Python with
  `pypdfium2`, `pillow` and `numpy` for the suite's sample documents.
- **A fresh-database check without touching the working one:** copy `supabase/` elsewhere, change `project_id`
  in the copy's `config.toml`, `supabase start --workdir <copy>`, `supabase test db --workdir <copy>`,
  `supabase stop --no-backup --workdir <copy>` (the working stack must be stopped: same ports).
- **`supabase start` prints the local keys.** They are the CLI's fixed demo values, the same on every machine —
  not secrets, but do not mistake them for the hosted ones.
- **Signing out ends every session of that person** (all devices). A test that signs an account out must use an
  account nothing else is signed in with.
- **A unit test of helpers does not show a feature works.** The evidence bundle had 7 passing unit tests and
  six queries against columns that do not exist; only a run against the database showed it.
- **`nodemailer` has separate builds for `import` and `require`:** replacing `createTransport` on the required
  copy does nothing to the app (a test then reached Brevo with fake credentials). Patch the `dist/esm` default.
- **A session can be signed in and still not "active":** `password_change_required` (temporary password not
  yet changed). Anything new that reads the session must treat every status but `active` as no access. A
  test that creates an account through `users.invite` or bulk import must clear the mark or change the password.
- **A file-tracing pattern with `[param]` in its route key matches nothing** (the brackets are read as a
  character class): use `/api/trpc/*`. Check `<dist>/server/app/<route>/*.nft.json` after a build.
- **Docker on Windows cannot read an `--env-file` given as a Git Bash path** (`/tmp/…` from `mktemp`): use a
  `C:/…` path, and keep the settings until the new container is up — the old one's are gone once it is removed.
- **`session.isAdmin` means Super Admin only.** An Administrator is `isOrgAdmin` with `adminOrgUnitIds`.
  `adminProcedure` and `requireAdminSession` stay Super Admin only; a page or procedure opened to
  Administrators uses `adminAreaProcedure` / `requireAdminAreaSession` and must check org scope itself
  (`lib/auth/scope.ts`; the tree's own rules are `reach()` in `routers/organization.ts`).
- **At most two people may hold the `admin` role** (migration `0050`). A fixture or script that adds one on
  a database that already has two fails with 23514 "At most 2 Super Admins"; a database test sets the
  existing holders aside first (see `phase2_smoke.test.sql`).
- **A whole end-to-end run without the worker venv:** a throw-away venv with `pypdfium2 pillow numpy` as
  `E2E_PYTHON`, the stack started with `-x studio,imgproxy,realtime,edge-runtime,logflare,vector,postgres-meta,supavisor`,
  a local env file as `E2E_ENV_FILE`, the app built and started on 3100 with those values exported. About
  6 GB free was enough beside the hosted worker.
- **Invitation tokens exist only in the email.** A test that needs one reads it from the local mail catcher:
  the stack must run with Mailpit (its SMTP port is 55325 since 2026-10-13, `supabase/config.toml`) and the
  app must be started with `EMAIL_SMTP_HOST=127.0.0.1` and `EMAIL_SMTP_PORT=55325` (loopback only by
  design). `tests/e2e/invitations-sessions.mjs` needs both and a browser.
- **A link's expiry cannot be changed, even by a test** (trigger, migration `0051`): to age one, run the
  update in a transaction after `set local session_replication_role = replica`.
- **Supabase Auth gives an account created without a password a random one** (a hash is stored); "no
  password" cannot be tested by looking for an empty column.
- **Every request asks `touch_session`** (migration `0052`): code in the working tree fails on a database
  without it, the owner's dev server on hosted included. A script that signs in and then waits must not
  expect activity from requests: only `reportActivity` (the page's heartbeat) moves the idle clock.
- **The page keeps the session times the server last told it.** A test that moves the clock in the
  database must make the tab look again (`document.dispatchEvent(new Event("visibilitychange"))`).
- **Do not change a test account's password while the end-to-end suite runs**: each script sets its own
  at set-up and signs in with it later.
- **An open period past its deadline is closed by a job every five minutes (migration `0053`).** A fixture that
  needs an open period gives it a far-off `submission_closes_on`, as `seed.sql` does. A local database from before
  needs that date set before `migration up`.
- **`clickCount` no longer selects text in this Puppeteer:** clear a field with Backspace. The security hook
  refuses a new file containing Puppeteer's `$eval`; use `page.evaluate`.
- **One signed-in session per account (migration `0055`).** A test that signs an account in a second time gets the
  takeover question instead of a session: use `login(who, { takeover: true })` (`tests/e2e/lib.mjs`), and expect the
  first session to be refused afterwards. A browser and a script sharing one account share cookies
  (`signedIn(who, share)` in `feedback-2026-11.mjs`).
- **The root `app/loading.tsx` (ui, 2026-11-07) streams every page:** a server `redirect()` arrives as a 200 page
  holding `NEXT_REDIRECT;replace;<path>` instead of a 307. Tests check for either.
- **`next start` keeps serving the build it started with:** after a rebuild, stop the old process (find it by its
  `start -p 3100` command line) or the tests run against stale code.
- **Do not point the app at the transaction pooler (port 6543).** Tested 2026-11-07 from this laptop: any query
  queued behind a busy connection never returns (pipelining and type fetching off made no difference); the session
  pooler (5432) is fine. The pages run queries in parallel, so the app hangs there. Recorded as a Phase 10 item in
  `feature_enhancement.md`. The session pool on hosted is 15 clients; recommended 24 (60 max connections).
- **Stopping the test app by command line kills the shell doing it:** a Bash command that filters processes on
  `start -p 3100` matches its own command line. Stop it by port (`Get-NetTCPConnection -LocalPort 3100`) and check
  the port is free before starting again — an old server left on 3100 serves stale code.
- **Tables pick up a global first-column rule** (pinned, dark header cell): a small settings layout is better as a
  grid of labelled fields than a table.
- **`Get-NetTCPConnection -State Listen` can miss the test app on 3100** (Windows reported its socket as
  "Closed"), so a stale `next start` kept answering and two runs tested old code. Stop it in PowerShell by command
  line: `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? CommandLine -like '*next*start -p 3100*'`,
  then check the new server's log says Ready.
- **pdf.js on the server must stay out of the bundle** (`serverExternalPackages` in `next.config.ts`) and its
  worker is imported by name (`lib/factors/source.ts`) so Vercel's file trace includes it; bundled, every PDF
  read failed with "The file could not be read".
- **A conversion factor version cannot be inserted active without an approver** (migration `0060`): fixtures
  set `approved_by`, `approved_at` and `self_approved = true` (see `phase9_calculation.test.sql`); the e2e suite
  uses `approveSyntheticFactor` in `tests/e2e/lib.mjs`.
- **Run the e2e suite with `E2E_APP_URL` on the same host as the env file's `NEXT_PUBLIC_APP_URL`**
  (`http://localhost:3100`). With `127.0.0.1` the emailed invitation links (localhost, IPv6) come from another
  client address than the test's own requests, and the link-guessing limit check fails.
- **`test:factors` used to leave soft-deleted `ISO_FACTOR_*` activities behind**, and three Scope 1 database
  tests count deleted activities too; the test now deletes its activity outright (2026-11-09).
- **A Python edit script turns `\b` into a backspace character** inside a normal (non-raw) string: a regex lost
  its word boundaries that way. Write regexes with the Edit tool or a Node `String.raw`.
- **The test app on 3100 reads `apps/web/.env.local` for anything the e2e env file lacks** (the NVIDIA key, for
  one), so the AI button appears there; `ui-phase7.mjs` makes one real request on synthetic figures when it does.
- **Phase 7 fixtures insert records and calculations directly** (`tests/e2e/analytics-fixture.mjs`) and remove
  them with `session_replication_role = replica` in their own transaction; its dates work between Aug 2026 and
  Jan 2027 (the scripts refuse to run outside that window).
- **Scenario E's two split bills are created in one transaction** and share `created_at`; the script now orders
  them by `document_bundle_parts.part_number` (it failed once on 2026-11-09 with the bills swapped).
- **The accessibility suite runs axe over the page behind an open menu:** a link inside a sentence must be
  underlined (link-in-text-block), and small header text must not be dimmed (the Special theme's header is
  crimson; 80% opacity failed 4.5:1).
- **The `secondary` button style fails contrast in the Corporate theme** (#222 on #ef102d, 3.6:1): do not use it
  for a pressed or selected state.
- **A landing-page screenshot taken after a fast scroll shows sections blank:** `BlurFade inView` reveals on
  scroll, once. Scroll slowly (300 px, 150 ms) before a full-page capture or an axe run.
- **pdf.js: destroy the loading task, not the document** (`task.destroy()`), in tests as in `lib/factors`.
- **Two Supabase stacks do not fit beside the app and the suites in memory:** stop the test stack while the local
  server runs. Background jobs were killed for low memory on 2026-11-09; a killed accessibility run left
  `super_admin_limit` at 3 locally (restored to 2) -- check it if `super_admin_and_administrators.test.sql` fails.
- **DevTools offline mode covers the page, not its service worker:** switch the worker's own network off through
  its CDP session to test the offline page (`ui-phase9.mjs`).
- **A restore of `public` into a Supabase stack:** load the sign-in accounts first (users.id references them) and
  the `supabase_admin` default grants as `supabase_admin` (`local-server.cjs load`).
- **Long commands:** anything over 10 minutes is moved to the background by the tool; the output file path is given.
- **A second `next dev` with `NEXT_DIST_DIR` outside `.next-e2e` breaks Tailwind** (it scanned a git-ignored
  `.next-hosted` folder and produced a class that 500s every page). Keep extra dist folders under `.next-e2e/`,
  delete it afterwards, and restore `apps/web/tsconfig.json` — Next rewrites it every time (it was committed
  rewritten once, in `e763572`).
- **Signing in by script when the account is signed in elsewhere:** the login form shows the takeover question;
  click the last "Sign out there and continue" button without retyping the password (clearing the field by
  script breaks the form's state).
- **Side panels remember their width per page in `localStorage`** (`sheet-width:…`, 2026-11-11). A browser test
  that measures a panel's default width must clear that key or use a fresh browser context.

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
