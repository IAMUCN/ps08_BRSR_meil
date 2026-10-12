# TraceESG (BRSR_MEIL) — Working context

The **live state** of the project: what is in flight, what is waiting on the owner, the machine and
infrastructure facts, how the owner works, and the traps already hit. Loaded automatically by `CLAUDE.md`, so
nobody has to re-explain it at the start of a session.

- [`PROGRESS.md`](PROGRESS.md) is the **history**: what each phase delivered, test results, open items.
- This file is the **now**: short, rewritten at the end of every session. If a fact here is also in
  `PROGRESS.md`, this file only points to it.
- Details of any decision live in `.grill/`; deviations from the specification in `supabase/SCHEMA_DEVIATIONS.md`
  and `apps/web/APP_FLOW_DEVIATIONS.md`.

_Last updated: 2026-10-12._

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
- **The four `feature-invite-smtp` entries above were committed and the branch pushed to `ucn` and `origin` on
  2026-10-12 at the owner's request** (it sits on top of `ui-rename-emeilsg`). No pull request, CI not run.
- **Commit only when the owner asks.** One phase at a time; stop and wait for the go-ahead.

## 2. Waiting on the owner (do not decide these alone)

| Question | Notes |
|---|---|
| Dependency and deployment decisions | Confirm `xlsx` from the vendor's site (or read sheets with `exceljs` and drop `.xls`); `apps/web/.env.production.local` holds the full hosted settings and is read by `next build` / `next start` on this machine — delete or keep deliberately; rebuild the worker image when convenient. Dashboard checklist: `DEPENDENCY_AUDIT_2026-10-12.md` section 6. |
| Accessibility decisions | The custom cursor hides the system pointer on every page (a barrier for people who enlarge or recolour it); chart text alternatives on Forecast and Simulator; field-level errors on Admin forms; session time-out without warning; who does the manual keyboard and screen-reader pass. `ACCESSIBILITY_AUDIT_2026-10-12.md` sections 4 and 6. |
| Design decisions from the UI audit | The site-wide custom cursor (the audit's rules say remove, the landing brief says keep); the hero card deck and the two captions that read as results; renaming and restyling Deadlines and Carbon credits to match the rest; the pill button on sign-in; an em-dash copy pass; the browser icon colour. `UI_AUDIT_2026-10-12.md`. |
| Privacy and compliance decisions | Operator's legal name, address and privacy contact; legal basis and notice for employees; retention periods (audit log with IP addresses, documents and OCR text, notifications, reports); how people ask for access or erasure; processor terms (Supabase, Brevo, AI provider); landing wording ("Portfolio-Wide Deployment for MEIL", "by MEIL. All rights reserved" against the GPL-2.0 licence file, the FAQ's absolute "No"); the source of the six landing photographs; the Rs 2,500 carbon price and its stated source; a recipient for "Request a demo". List: `COMPLIANCE_AUDIT_2026-10-12.md` section 8. |
| Chatbot: contact details no longer go to the AI service | Changed on 2026-10-12 against the 2026-10-11 "full access for Admins" decision: the model gets names, roles and org units; email, employee id and file names stay in the table. Confirm, or say to restore (`.grill/chat-admin-access-decisions.md`). |
| Push migration `0048` to hosted, and confirm the role table | Adds two permissions to Corporate ESG (`.grill/role-permissions-decisions.md`). Also decide: pages outside the Admin area for Corporate ESG (review queue, reports, monitoring), and whether Project Manager keeps `carbon_credit.view`. |
| Push migration `0047` to hosted | No table or column changes and the worker is unaffected, so the container need not be replaced. First run the read-only check in `DATABASE_AUDIT_2026-10-12.md` §5 on hosted (expect 0). |
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
  deviation entry (D/A numbers continue: next are **D40** and **A37**), and note it in PROGRESS.md.
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
