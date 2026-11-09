# TraceESG (BRSR_MEIL) — Context and Progress

The single place to find out **what this project is, what has been built, how we work, and what comes
next**. Read this first, whether you are a person joining the project or an AI agent starting a new
session. Update it at the end of every phase (see [How to update this file](#how-to-update-this-file)).

_Last updated: 2026-10-13 — stages 1–3 of the scoped-administrator work (Super Admins and Administrators,
invitation links, session time limits; migrations `0050`–`0052`) are done locally, uncommitted and not on
hosted. Before that:_

_2026-10-12 — the app is renamed EmeilSG; the 2026-10-12 audits and their fixes are merged to `main`;
invites email a temporary password that must be changed at first sign-in; a role can upload on behalf of another
(migration `0049`, branch `feature-employee-uploads`, not merged); test data set 1 follows the hierarchy in the web
app and was run through hosted for August (66 records, 57 approved). Hosted has every migration, `0001`–`0049` (caught up 2026-10-12). A Vercel deployment check is in
`DEPLOYMENT.md`. Phase 21 (deployment) is still to come, hosting to be decided by
the owner. `CONTEXT.md` has the detail of what is committed where._

---

## 1. What we are building

**TraceESG** is an evidence-first ESG/BRSR reporting platform for MEIL. Users upload source documents
(invoices, bills, registers); the system extracts values with OCR, the user reviews and confirms them, and
the system validates, calculates (deterministically, with versioned factors), maps to Scope 1/2/3 and
BRSR indicators, consolidates across the organization hierarchy and produces reports — with lineage from
every reported number back to the original document.

Big rules that shape everything:

- **Evidence first.** Normal users upload documents; they do not fill large calculation forms.
- **AI/OCR assists, never decides.** Extracted values are always reviewed by a person; calculations are
  deterministic and reproducible from the stored factor version.
- **Nothing hard-coded.** Factors, categories, BRSR mappings and hierarchy are configuration, not code.
- **Security is server-side.** Every change goes through server procedures that check the session, scope,
  role and state, and write an audit log entry in the same transaction.

## 2. Where things are

| Path | What it is |
|---|---|
| `ps_documents/implementation_docs/` | **The specification** — read-only. Authority order: `Master_Approach.md` → `01_PRD` → `02_TRD` → `03_APP_FLOW` → `04_UI_UX_DESIGN_BRIEF` → `05_BACKEND_SCHEMA` → `06_IMPLEMENTATION_PLAN`, plus its `.grill/` decision records |
| `.grill/` (repo root) | Decisions made **during implementation**, one file per phase |
| `apps/web/` | Next.js 16 app (UI + tRPC server) |
| `apps/ocr-worker/` | Python 3.12 PaddleOCR worker — job polling, OCR, rule-based field extraction, test harness |
| `packages/shared-types/` | Shared TypeScript types |
| `supabase/migrations/` | Database schema, RLS, seed reference data, evidence bucket, OCR field requirements, OCR threshold, validation rules, calculation formulas, Scope 1 fuels, Scope 2 electricity, Scope 3 categories, role modules, BRSR mapping, consolidation views, submission expectations, reports, append-only audit log and rate limits, user theme, bulk import, password-reset OTP, default theme, multi-bill PDFs, July-2023 BRSR indicator codes, hierarchy rules, Scope 1 and 3 activities, calculation guard and audit context, hierarchy levels, the full BRSR format, the chatbot, custom-period reports, shared org units, carbon credits, data-isolation rules, role defaults, a role uploading for another (`0001`–`0049`, all on hosted) |
| `supabase/tests/database/` | pgTAP database tests (also run in CI) |
| `apps/web/tests/e2e/` | End-to-end suite: Scenarios A–F, authorization, edge cases (`pnpm --filter web test:e2e`) |
| `QA_CHECKLIST.md` | Phase 20 checklist: every edge case and testing category with its result |
| `supabase/SCHEMA_DEVIATIONS.md` | Every intentional difference from `05_BACKEND_SCHEMA.md` (D1–D43) |
| `apps/web/APP_FLOW_DEVIATIONS.md` | Every intentional difference from `03_APP_FLOW.md` / UI brief (A1–A39) |
| `SECURITY_REVIEW.md` | The Phase 18 security review: findings, fixes, accepted risks and deployment actions |
| `ASSURANCE.md` | How the system supports assurance on BRSR Core KPIs: controls, KPI-by-KPI status, an assurer's walkthrough |
| `render.yaml` | Render Blueprint for the OCR worker (background worker, Docker). **The owner does not use Render** — kept only as a reference for the worker's settings until the host is chosen |
| `CONTEXT.md` | The live state — uncommitted work, questions waiting on the owner, machine facts, owner preferences, traps already hit. Loaded with this file by `CLAUDE.md`; rewritten at the end of every session |
| `README.md` | Setup and day-to-day commands |

## 3. Progress

Phases come from `06_IMPLEMENTATION_PLAN.md`. Track A is the app; Track B (Phase 2B) is the OCR worker and
may run in parallel with Phases 3–5.

| Phase | Name | Status | Commit |
|---|---|---|---|
| — | Documentation consistency fixes | Done | `1be9a13` |
| 1 | Project setup | Done | `aedd96a` |
| 2 | Database | Done | `494a3a4` |
| 2B | OCR worker development (Track B) | Done | `013cbc0` |
| 3 | Authentication and authorization | Done | `47fcc17` |
| 4 | Organization and Admin foundation | Done | `1594389` |
| 5 | Document ingestion | Done | `1df74c8` |
| 6 | OCR pipeline integration | Done | `6ac8d00` |
| 7 | OCR verification | Done | `04fc05f` |
| 8 | Validation engine | Done | `ba4e678` |
| 9 | Calculation engine | Done | `d0f549c` |
| 10 | Scope 1 | Done | `61544c1` |
| 11 | Scope 2 | Done | `900c873` |
| 12 | Scope 3 foundation | Done | `6dd8aa6` |
| 13 | Role-specific modules (HR, EHS, Procurement, Finance/CSR) | Done | `72e63ed` |
| 14 | BRSR mapping | Done | `360378c` |
| 15 | Consolidation | Done | `721b18f` |
| 16 | Admin Control Tower | Done | `dd5af22` |
| 17 | Reporting | Done | `9d893b2` |
| 18 | Audit and security hardening | Done | `2f6118b` |
| 19 | UI polish and responsive behavior | Done | `44ad2e1` |
| 20 | Testing and edge cases | Done | `8736707` |
| — | Out-of-sequence work: bulk import, OTP password reset, password policy, theme toggle, DISCOM and water OCR rules, multi-bill PDFs | Done | `2392b6e` |
| — | Audit fixes P0-2 (SEBI-format report) and P0-3 (July-2023 indicator codes) | Done, on branch `feature` | `cbd9a30` |
| — | Audit fixes P1 (Scope 1 and 3 activities, travel by mode, hierarchy rules in the database) | Done, on branch `feature` | `23e1925` |
| — | Audit fixes P2 (calculation guard, audit context and order, security headers, evidence fingerprint, hierarchy levels, several evidence files) and P3 | Done, on branch `feature` | `23e1925` |
| — | Second audit follow-up: remaining activities, air emissions, fuller SEBI report tables, sourced factors on local (migration `0038`) | Done locally, committed, **not pushed, not on hosted** | — |
| — | Full BRSR format in the report: 146 questions, typed disclosures, all 17 SDGs (migration `0040`); owner's page feedback | Done, **uncommitted**; `0040` on hosted | — |
| — | ESG data analyst chatbot: read-only tools, NVIDIA NIM, saved conversations (migration `0042`) | Done, on branch `feature-chat-analyst` (not pushed); `0042` on hosted | `67700f8` |
| — | Org units under several parents, several groups, delete; chat pane feedback (migration `0044`) | Done, on `ucn` `main`; `0044` on hosted | `db4f66b` |
| — | Audits of 2026-10-12 (security, database, chatbot, privacy, UI, accessibility, dependencies) and their fixes (migration `0047`) | Done, on `main` | `d4e214c` |
| — | Renamed to EmeilSG, new logo | Done, on `main` | `7eb48cd` |
| — | Invite by emailed temporary password, forced change at first sign-in, user delete, show-password | Done, on `main` | `7fb16ff` |
| — | Expected submissions shown on the parent, role defaults (migration `0048`), Edit role | Done, on `main` | `e1586f3` |
| — | A role uploads on behalf of another (migration `0049`); test data set 1 on the app's hierarchy; August run on hosted | Done, on branch `feature-employee-uploads` | `e3805f7` |
| — | Report PDFs on Vercel (headless shell) and a small connection pool there | Done, on `main` | `fe93b23` |
| — | Stage 1 of 6: Super Admins and scoped Administrators (migration `0050`) | Done on branch `feature-scoped-admins`, **uncommitted, not on hosted** | — |
| — | Stages 2 and 3 of 6: invitation links (migration `0051`) and session time limits (migration `0052`) | Done in the same working tree, **uncommitted, not on hosted** | — |
| — | Feature roadmap (`feature_enhancement.md`) Phase 0 audit and Phase 1: one session per account (migration `0055`), permission names, show/hide password, security re-check | Done on branch `feature-session-takeover-security`, **uncommitted; `0055` local only** | — |
| — | Feature roadmap Phase 2: several open periods, late uploads, duplicate rules, bill number, monitoring filters, stage tracker, approval list (migration `0056`) | Done, **uncommitted**; `0056` on hosted (2026-11-08) | — |
| — | Feature roadmap Phase 3: billing-period fix (rules-14), document-kind check, one monitoring page, field grid with source boxes, electricity bill number (migration `0057`) | Done, **uncommitted**; `0057` and the rules-14 worker on hosted (2026-11-08) | — |
| — | Feature roadmap Phase 4: forwarding reports for verification (migration `0058`), scoped audit trail, search, My Activity | Done, **uncommitted**; `0058` on hosted (2026-11-08) | — |
| — | Feature roadmap Phase 5: deadline reminders on a schedule, Administrators' summaries, sent log, daily Vercel Cron (migration `0059`) | Done, **uncommitted**; `0059` on hosted (2026-11-08) | — |
| — | Feature roadmap Phase 6: factor sources and fetching from official sites, factor approval, yearly review, carbon-credit links (migration `0060`) | Done, **uncommitted**; `0060` on hosted (2026-11-09) | — |
| — | Feature roadmap Phase 7: Carbon Analytics — year-wise trends, suggested actions, emission threshold alerts (migration `0061`) | Done, **uncommitted**; `0061` on hosted (2026-11-09) | — |
| — | Feature roadmap Phase 8: four report templates (GHG also as Excel), top-bar search, Scope Table / Chart, Ask button, landing fixes (migration `0062`) | Done, **uncommitted**; `0062` on hosted (2026-11-09) | — |
| — | Feature roadmap Phase 9: phone navigation, tap cursor, installable app | Done, **uncommitted**; no migration | — |
| — | Feature roadmap Phase 10: Help, production database runbook, release checklist, hosted reset and the local database server | Done, **uncommitted**; hosted reset 2026-11-09 | — |
| 21 | Deployment (hosting to be decided by the owner; after the audit fixes) | Later | — |

### What each finished phase delivered

**Phase 1 — Project setup.** pnpm monorepo (pnpm 12.4.2 via Corepack), Next.js 16 + React 19 + Tailwind v4
+ shadcn/ui, three UI themes as CSS tokens, Python 3.12 OCR worker environment (PaddlePaddle 3.3.1,
PaddleOCR 3.7.0), ESLint/Prettier/Ruff, GitHub Actions CI (lint, typecheck, unit tests, format, Ruff).

**Phase 2 — Database.** All 35 schema tables, enums, triggers, RLS read policies, helper functions
(`is_admin()`, `my_org_unit_ids()`), seed reference data (7 roles, 14 permissions, Scope 1/2/3, the MEIL
root, diesel and grid-electricity metrics). Writes from the browser are revoked; the server does all
writes (deviations D1–D8).

**Phase 3 — Authentication and authorization.** Supabase Auth with cookies, admin-provisioned accounts
only (no sign-up, 12+ character passwords), login / forgot / reset password, invite emails via Mailpit
locally, `proxy.ts` session refresh, a Data Access Layer (`lib/auth/session.ts`) that decides access per
request, `/admin` for Admins and `/app` for everyone else, deactivated users lose access at all three
layers (D9), `provision-user` script for the first Admin.

**Phase 4 — Organization and Admin foundation.**
- Organization hierarchy: create, edit, move (no inverted levels, no cycles), deactivate/reactivate with
  an impact preview; deactivated nodes are frozen but readable; the root cannot be deactivated.
- Users: invite, resend invite, add/revoke role assignments, deactivate/reactivate. Admin role only at the
  root; the last active Admin cannot be removed (three guards).
- Roles & permissions matrix: custom roles, Admin role locked, used roles cannot be deleted.
- Reporting periods: create, optional guidance submission dates (D10), manual open/close, reopening needs
  a written reason and warns about affected reports.
- Profile pages (display name; password change requires the current password and signs out other sessions).
- New app shell (sidebar lists built pages only, top bar), status badges, confirm dialogs.
- Admin dashboard: real header counts; KPI tiles are labeled **development placeholders until Phase 16**.
- Checks: unit 12/12, DB 47/47, API end-to-end 82/82, browser (Edge) 21/21, build passes.

**Phase 5 — Document ingestion.** Decisions: `.grill/phase-5-document-ingestion-decisions.md`.
- `/app/upload` (sidebar "Upload" + dashboard CTA): automatic open period, project/site picker (assigned
  node or its active children), ESG activity picker (metrics grouped by category, filtered by role),
  drag-and-drop zone with progress bar and cancel, inline errors, retry on network failure.
- **Bytes first, then rows** (amended D3): the server issues a signed upload URL; after upload it re-reads
  the file, recomputes SHA-256, detects the real type, rejects truncated files and password-protected
  PDFs, re-checks scope and period, then creates `documents`, a `document_uploaded` `esg_records` row, the
  evidence link, a `pending` `ocr_jobs` row and the audit entry in one transaction.
- Private `evidence` bucket (migration `0012`): 50 MB, PDF/JPG/PNG, no client access at all.
- Duplicates: identical file anywhere in the organization → warning + `is_duplicate_flag`; another record
  for the same project + period + metric → warning only. Both must be acknowledged; never blocked.
- Empty states: no assignment, no open period (blocking), no categories for the role.
- Checks: unit 16/16, DB 55/55, API end-to-end 67/67, browser (Edge) 19/19, Phase 4 regression 82/82 and
  21/21, build passes, clean `db reset` applies all migrations.

**Phase 2B — OCR worker.** Decisions: `.grill/phase-2b-ocr-worker-decisions.md`.
- `python -m worker` polls `ocr_jobs` (`for update skip locked`), downloads the file from the private
  bucket, renders PDFs (pypdfium2), runs PaddleOCR (PP-OCRv5 mobile det + English mobile rec, CPU, models
  pre-downloaded from Hugging Face by `scripts/download_models.py`).
- Deterministic extraction: *which* fields come from `metric_field_requirements` (seeded early, migration
  `0013`, D12); *how* is `worker/extraction/profiles.py` (label synonyms, value patterns, same line / right /
  below). Missing fields are stored as null, never guessed. Confidence = recognition score (0–100).
- Classification among the metric's mapped document types by keyword score (sets `document_type_id` only
  when clear).
- One transaction per outcome with system audit entries: extraction + fields, job `completed`, document
  `ready`, record `document_uploaded → ocr_completed` (D11). Never verification/validation/calculation.
- Failures: unreadable/empty/missing file → `failed` with a user-readable reason; transient errors retry
  up to 3 attempts; stale `processing` jobs (15 min) reclaimed; claim token prevents double writes.
- JSON logs, Sentry when `SENTRY_DSN` is set. oneDNN disabled (PaddlePaddle 3.3.1 bug), detector input
  capped at 1600 px (~10 s per A4 page on a laptop CPU).
- Checks: unit 9/9 (also in CI), integration harness 8/8 on generated synthetic documents (exact values for
  a table-layout diesel PDF, an electricity bill PNG and a rotated/noisy scan JPG; corrupted, blank and
  missing files; retries; stale reclaim; concurrent claims; lost claim), DB 58/58, and a real web upload
  processed by `python -m worker --once` end to end.

**Phase 6 — OCR pipeline integration.** Decisions: `.grill/phase-6-ocr-integration-decisions.md`.
- The worker writes one notification for the uploader in the same transaction as the job result:
  `verification_needed`, `low_confidence` (a found field below the threshold or a required field missing,
  "N fields need your attention") or `ocr_failed` (with the reason). All deep-link to
  `/app/verify/{documentId}` (D11 amended).
- Threshold is configuration: migration `0014` seeds `ocr_confidence_threshold = 80` and makes
  `org_settings.updated_by` nullable for system seeds (D13).
- **Notification bell** in both top bars (red dot, 5 most recent, polls every 30 s and on focus);
  **`/app/notifications`** with type filter and mark all read (Admin: dropdown only).
- **My Submissions** (`/app/submissions`): App Flow's seven status tabs with real counts; OCR status as
  badges (Processing / Needs Verification / Extraction Failed + reason / "N fields need attention");
  refreshes every 15 s while a job runs. After upload the user lands on Processing. The dashboard
  "Documents to verify" card is now a real count.
- **`/app/verify/[documentId]`** is a scope-checked, clearly labeled development placeholder showing the
  real OCR status until Phase 7 builds the screen.
- **`/admin/ocr-monitoring`**: status and confidence-band filters, lowest confidence, detail drawer with
  read-only extracted fields, Retry for failed jobs (fresh attempts, audited `ocr.job_retried`), banner
  when the oldest pending job waited over 5 minutes.
- tRPC: `ocr.submissions`, `ocr.status`, `ocr.jobs`, `ocr.jobFields`, `ocr.retry`, `notifications.list`,
  `notifications.markRead`, `notifications.markAllRead`; `adminProcedure` helper.
- Deployment: `apps/ocr-worker/Dockerfile` (weights baked in at build, non-root) and root `render.yaml`
  (background worker, Singapore, standard plan, secrets `sync: false`). Image built and run locally
  (~460 MiB peak on a one-page invoice); not yet deployed to Render.
- Checks: worker unit 12/12, harness 9/9, DB 61/61, web unit 19/19, lint/typecheck/format, build, no
  server secrets in the client bundle, API end-to-end 65/65 with the Docker worker image on real uploads,
  browser (Edge) 26/26.

**Phase 7 — OCR verification.** Decisions: `.grill/phase-7-ocr-verification-decisions.md`.
- **`/app/verify/[documentId]`** is the real split screen (UI brief §12.2): the document on the left
  (pdf.js canvas or image, zoom and page controls), the extracted fields on the right with per-field
  confidence, click-to-edit (Enter edits and saves, Escape cancels) and "Looks correct" acknowledgement.
- **Guard rail:** Confirm stays visible but disabled until every flagged field (below the threshold, or
  `is_critical`) is edited or acknowledged, every required field has a value, numbers parse and are not
  negative, and a document type is selected. The same rules run on the server, so the API refuses what the
  UI blocks. A disabled Confirm always says why.
- **Confirm** writes, in one transaction: per-field `verified_value` + `confirmed`/`edited` status, a
  `verifications` row, the record's `activity_value_raw`/`activity_value_verified`/`activity_unit`,
  `user_verified` + `data_quality_state = verified`, and audit entries for the confirmation and each edit.
  Activity value and unit come from the metric's required `number` and `unit` field requirements.
- **Reject** (modal + reason ≥ 10 characters) marks the record rejected with the reason in the audit trail
  and on My Submissions; the evidence file is kept.
- **OCR failure paths:** "Re-upload a clearer copy" pre-fills Upload and closes the failed record as
  replaced; or a **manual exception** — values typed by hand with a justification (≥ 20 characters),
  stored as a manual `ocr_extractions` row, flagged on My Submissions and Admin OCR Monitoring.
- **Document type not identified** (Master Approach §12): a picker appears and blocks Confirm until chosen.
- **Invoice-number duplicates** warn and must be acknowledged before Confirm (Phase 8 flags them).
- **Evidence route** `/api/documents/[documentId]/file`: session + scope checked per request, private,
  no-store, sandboxed.
- Checks: unit 25/25, DB 61/61, API end-to-end 76/76, browser (Edge) 31/31, Phase 6 regression 65/65 and
  26/26, lint/typecheck/format, production build.

**Phase 8 — Validation engine.** Decisions: `.grill/phase-8-validation-engine-decisions.md`.
- **Six categories** (PRD §29) run inside Confirm's transaction (schema §20.3): built-in format (required
  fields, numbers), organizational (project active and inside the submitter's scope) and evidence
  (attached and read by OCR — manual exceptions are always flagged); configured checks from
  `validation_rules` (migration `0015`): allowed units, quantity > 0, billing period overlapping the
  reporting period, duplicate invoice number (flag + `is_duplicate_flag`), duplicate grid bill per period,
  and the anomaly check (×2 / ½ of the project's median over 3+ prior periods, else "not enough history").
- One `validation_results` row per check (`validation_rule_id` null for built-ins); record status from the
  aggregate: any fail → `failed`, any flag → `flagged`, else `validated`; audited as a system event.
- **Returns and re-verification** (App Flow §4.7/§4.8): hard fails notify the submitter (`returned`) and
  reopen Verify Extraction with prior values, the reason, the per-category result and a message on each
  failing field; re-confirming records a new verification and re-validates from the top.
- **Admin Validation Queue** (`/admin/validation-queue`): status and category filters, 720px drawer with the
  validation result and the document, Accept or Return to submitter for flagged records (reason required,
  audited); Admins are notified of flags (`validation_review`).
- Validation Result component (UI brief §12.4) on the verify summary, the returned screen and the queue;
  My Submissions shows return reasons and "Awaiting Admin review"; the dashboard "Returned for correction"
  card is real.
- **Approval pulled forward** (A10, after the owner found nothing ever reached Approved): validated records
  go to Pending Approval; approvers in scope (`/app/approvals`) or Admins (`/admin/approval-queue`) Approve
  or Return with a reason; no self-approval; submitter notified either way.
- Synthetic sample invoices now get unique invoice numbers (`apps/ocr-worker/scripts/make_sample_invoice.py`)
  — the shared number had flagged every test record as a duplicate. `pnpm --filter web validate-pending`
  validated the 29 local records confirmed before Phase 8.
- Checks: unit 34/34, DB 66/66, API end-to-end 58/58 + approvals 36/36, browser (Edge) 16/16 + approval
  scenario 8/8, lint/typecheck/format, production build.

**Phase 9 — Calculation engine.** Decisions: `.grill/phase-9-calculation-engine-decisions.md`.
- **The engine** (`lib/calculation/`): verified value → unit normalisation (TRD §27 table in code) → the
  factor version effective for the record's reporting period → `direct_multiply` → result + scope, stored
  as one append-only `calculations` row (`is_current` flipped, previous traces kept) with the factor value
  snapshot and `engine_version`. Deterministic: same record and factor version, same number, always.
- **It runs when a record enters the approval queue** (Confirm's transaction, and an Admin's Accept of a
  flagged record), so no approver sees a record without its trace.
- **No factor values are seeded** (migration `0016` seeds only the formulas). Factors are regulatory data
  an Admin enters at **`/admin/conversion-factors`** with a source reference: table + inline version
  history, new version supersedes and closes the previous one, a version used by a calculation can never
  change (DB trigger is the backstop). Past periods keep resolving to the superseded version that covered
  them.
- **A missing factor blocks the number, not the queue** (A11): "Not calculated yet" with the reason on the
  record and in the approval drawer, Approve disabled (Return still available), Admins notified once per
  reason, and "Run calculation" for an Admin once the factor exists. Approved records are closed to
  recalculation.
- The **calculation trace** (UI brief §12.5) is on the verify summary for the submitter, in the approval
  drawer and for Admins. `pnpm --filter web calculate-pending` calculates records confirmed before Phase 9.
- Checks: unit 39/39, DB 73/73, API end-to-end 44/44 + Phase 8 regression 58/58 + approvals 36/36,
  browser (Edge) 10/10, lint/typecheck/format, production build.

**Phase 10 — Scope 1.** Decisions: `.grill/phase-10-scope-1-decisions.md`.
- **The fuels are configuration** (migration `0017`): Petrol, CNG and LPG join Diesel, each with the same
  four fields, an active `direct_multiply` formula, an allowed-units rule and a shared "Fuel Invoice"
  document type. The OCR worker needed no change — its extraction profiles are keyed by field, not metric.
  CNG and LPG are weighed, so kg/tonne joined the unit-normalisation table.
- **`/admin/scope-1`** (App Flow §2.2, one template for Scope 2/3 later): totals for the chosen period and
  org node, approved as the headline with "awaiting approval" and "not calculated" beside it, a table of
  child org units with an inline-SVG bar view, a trend across recent periods, and drilling that walks
  whatever hierarchy levels exist. A contributing record opens its calculation trace and the original
  invoice in a drawer — the whole lineage chain, proven now rather than in Phase 17.
- **`scope.getTotal`** is parameterised by scope code (Scope 2 and 3 reuse it untouched); `scope.myTotal`
  gives non-admins their own project's Scope 1 total on their dashboard, scope-checked server-side.
- Totals are grouped by result unit and never mixed; a kilogram unit shows the tonne figure beside it.
- **The critical end-to-end scenario passes live**: PM uploads a diesel invoice → OCR → verify → validate →
  calculate → approve → Admin drills MEIL → Subsidiary A → Project X → the record → the original invoice.
- Checks: unit 43/43, DB 79/79, API end-to-end 30/30 + Phase 9 regression 44/44 + Phase 8 58/58 +
  approvals 36/36, browser (Edge) 11/11, lint/typecheck/format, production build.

**Phase 11 — Scope 2.** Decisions: `.grill/phase-11-scope-2-decisions.md`.
- **Renewable Electricity joins Grid Electricity** as its own Scope 2 activity (migration `0018`): its own
  fields, formula, units rule and a Renewable Energy Certificate document type, so grid and renewable stay
  distinguishable (PRD §21) without the engine choosing a factor from a value a person typed. Electricity
  now also accepts MWh, which the engine normalises.
- **A conversion factor may be zero** — market-based renewable reporting — with the source reference still
  required and negatives still refused. A renewable record therefore calculates to an honest 0 kgCO2e
  instead of sitting uncalculated.
- **`/admin/scope-2`** is the Phase 10 component with a different scope code; no new procedure, no new
  engine branch — the reuse the plan asks this phase to prove.
- The scope dashboards now also break totals down **by activity** (diesel/petrol/CNG/LPG,
  grid/renewable), and the user dashboard lists **every scope** their project has data for.
- **The electricity-bill scenario passes live**: upload → OCR → verify (the user picks the document type
  when the classifier can't) → validate (a second bill in a month is flagged, an Admin accepts it) →
  calculate → approve → drill the Scope 2 total down to the original bill.
- Checks: unit 43/43, DB 84/84, API end-to-end 33/33 + Phase 10 regression 30/30 + Phase 9 44/44 +
  Phase 8 58/58, browser (Edge) 13/13, worker unit 12/12 and Ruff, lint/typecheck/format, production build.

**Phase 12 — Scope 3 foundation.** Decisions: `.grill/phase-12-scope-3-decisions.md`.
- **Categories are configuration** (migration `0019`): the ten candidate categories from Master Approach
  §17 are child rows under `SCOPE_3`, seeded inactive, and the two with real evidence — Waste generated in
  operations and Business travel — are active with a metric, formula, units rule and document type each.
  `scope.getTotal` rolls a scope up through its children, so Scope 3 needed no new procedure.
- **Each category belongs to the role that owns its evidence**: waste to EHS, travel to Finance/CSR, so a
  Project Manager is never offered them. Business travel is spend-based (invoice amount × kgCO2e per
  rupee); waste is weight-based with the treatment route recorded.
- **`/admin/scope-3`** leads with the category table — active ones with totals, the rest "Not enabled" —
  and says "2 of 10 active", as the UI brief requires. The user dashboard now lists every configured scope
  instead of a fixed pair.
- The OCR extractor learned the new label spellings (certificate number, disposal date, treatment route,
  mode) and weight and currency units; `EXTRACTOR_VERSION` is `rules-2` and the worker image was rebuilt.
- Checks: web unit 43/43, worker unit 12/12, OCR integration harness 9/9, DB 90/90, API end-to-end 33/33 +
  Phase 11 regression 33/33 + Phase 10 30/30 + Phase 9 44/44 + Phase 8 58/58, browser (Edge) 13/13,
  lint/typecheck/format/Ruff, production build.

**Phase 13 — Role-specific modules.** Decisions: `.grill/phase-13-role-modules-decisions.md`.
- **Four modules as configuration** (migration `0021`), each a category owned by its role: Workforce (HR —
  employees by gender, employees trained), Water (EHS — consumption), Procurement (MSME share of spend) and
  CSR & Compliance (Finance/CSR — CSR expenditure, fines and penalties). A Project Manager is offered none
  of them; uploading outside your role's categories is refused server-side.
- **The engine's first non-multiply formulas**: `subtract` (water = withdrawal − discharge, in the metric's
  unit, m³ accepted) and a new `percentage` type (part ÷ whole × 100, deviation D14, migration `0020`).
  All inputs are verified fields of the same document; each is stored in `calculation_inputs`, so Phase 15
  can re-derive a consolidated percentage from summed counts instead of summing percentages.
  `ENGINE_VERSION` is `calc-1.1.0`.
- **Journey 3 passes exactly**: HR uploads a headcount statement whose "Men" count OCR reads at ~69 %;
  Confirm stays disabled ("Review Men — edit it or mark it correct") until HR marks it correct; validation
  passes; the engine derives 23.33 % women; the Admin sees both counts and the formula in the approval
  drawer and approves.
- Validation gained a configurable `not_greater_than` check (women/men/trained ≤ total and MSME ≤ total
  spend fail; discharge > withdrawal is a review flag). CSR expenditure and fines are recorded amounts with
  no calculation and go straight to approval.
- The trace lists a multi-input formula's inputs and the formula in words; no new screens (module
  dashboards wait for the Control Tower, A15).
- OCR: label profiles for the new fields, m³ units, six new document types; `EXTRACTOR_VERSION` `rules-3`,
  worker image rebuilt. `make_sample_invoice.py` writes all six module documents.
- Checks: web unit 49/49, worker unit 14/14, real OCR on all six new documents (every field correct), OCR
  integration harness **not re-run** (stopped by the machine for low memory), DB 97/97, API end-to-end 52/52
  + Phase 12 regression 33/33 + Phase 11 33/33 + Phase 10 30/30 + Phase 9 44/44 + Phase 8 58/58, browser
  (Edge) 10/10, lint/typecheck/format/Ruff, production build.

**Phase 14 — BRSR mapping.** Decisions: `.grill/phase-14-brsr-mapping-decisions.md`.
- **Indicators from the authoritative source**: SEBI's BRSR format (Annexure I, in `provided_docs`).
  Migration `0022` seeds Sections A/B/C and the nine indicators today's metrics feed (A-18 workforce, A-22
  CSR, P1-E2 fines, P3-E8 training, P6-E3 water, P6-E6 Scope 1/2, P6-E8 waste, P6-L4 Scope 3, P8-E4 MSME),
  codes from its numbering and question text quoted from it. All 14 metrics map (15 mappings, no orphans).
  CSR expenditure maps to A-22 with a note that BRSR asks for applicability, not the spend.
- **`/admin/brsr-mapping`** (sidebar "BRSR Mapping"): a Mappings tab grouped by section with the BRSR
  tokens — add, edit notes, mark applicable/not applicable (deviation D15), remove with confirmation; every
  change audited, `brsr_mapping.manage` enforced server-side; blocking notices for "no mappings" and
  unmapped metrics.
- **Readiness tab** — the tree from UI brief §21: Section → Indicator (Complete / Partial / Missing
  evidence) → metric (approved and awaiting counts) → the period's records → a drawer with the calculation
  trace and the original document. Complete means every applicable mapped metric has an approved record.
  The Readiness % score is deferred to the Control Tower (A16).
- **Definition of done met live**: A-18 → Employees by gender → an approved headcount statement → its
  calculation (180 and 42 → 23.33 %) → the original PDF.
- Found and fixed: the Phase 13 edit to `APP_FLOW_DEVIATIONS.md` was committed unformatted; and a killed
  OCR harness run had left the local OCR threshold at 50 (restored to 80 — local data only).
- Checks: web unit 51/51, DB 103/103, API end-to-end 33/33 + Phase 13 regression 52/52 + Phase 12 33/33,
  browser (Edge) 8/8, lint/typecheck/format, production build. OCR integration harness not re-run (no
  worker change this phase).

**Phase 15 — Consolidation.** Decisions: `.grill/phase-15-consolidation-decisions.md`.
- **Two views, one definition of a roll-up** (migration `0023`): `org_unit_tree` pairs every org unit with
  itself and every descendant, however many levels exist; `consolidation_records` lists what counts —
  verified, non-rejected records, once per ancestor, with their current result (or verified amount for
  metrics that need no calculation) and a "not calculated" flag. Nothing is stored; both are
  `security_invoker` and closed to the browser.
- **The scope dashboards now read these views** instead of their own tree walks — the Phase 10–12
  regressions prove the figures didn't move.
- **`consolidation.query`** rolls every metric up for an org node and its children, for one period or an
  **Indian financial year (April–March)**, filterable by scope (Scope 3 includes its categories) and metric.
  Emissions and water sum per unit; **percentages are re-derived from summed counts** (Σ part ÷ Σ whole),
  never summed or averaged; recorded amounts sum with Rs/INR normalised; uncalculated records are counted,
  never read as zero. Approved is the headline, awaiting approval beside it.
- **Org scope**: an Admin consolidates any node; anyone else defaults to their own assignment and is
  refused above or beside it.
- No new screens (Phases 16–17 consume it).
- Checks: web unit 55/55, DB 120/120 (a fixture tree — two projects, a department under a site, a record on
  a project — checked at every level for diesel, % women and CSR), API end-to-end 35/35 (every level
  recomputed with an independent query), regressions Phase 14 33/33, Phase 12 33/33, Phase 11 33/33, Phase 10
  30/30, browser (Edge) Phase 10 11/11 and Phase 12 13/13, lint/typecheck/format, production build.

**Phase 16 — Admin Control Tower.** Decisions: `.grill/phase-16-control-tower-decisions.md`.
- **The dashboard is real**: header strip, the completion pipeline (Submission, Evidence, Validation,
  Approval), Scope 1/2/3 Completion (Scope 3 with "X of Y categories active"), and **BRSR Readiness %** — a
  weighted composite of those four and the share of BRSR indicators complete, weights in
  `org_settings.brsr_readiness_weights`, with an "i" popover listing every part and saying it is an internal
  indicator, not an official score. A card with nothing to measure shows "—" and why, never 0 % or 100 %.
- **Expected submissions are configuration** (migration `0024`, deviation D16): which metrics each node must
  submit per period of the metric's frequency, edited on the Organization page's node panel, audited. The
  seed adds expectations for Project X and a Project W that has submitted nothing.
- **Issue panel** — missing submissions, missing evidence, low-confidence OCR awaiting verification,
  validation failures, anomalies awaiting review, pending approvals, incomplete BRSR indicators. Counts and
  landing lists share one SQL predicate (`lib/records/search.ts`), so each row lands on exactly what it
  counted (A17).
- **Org/period context** picker in the Control Tower header, carried in the URL into Submission Monitoring
  and the Data Explorer.
- **Submission Monitoring** (`/admin/submissions`): org node, period, scope, role, status and issue
  filters; a "missing submissions" view of unmet expectations; CSV export; the shared record drawer
  (values, validation, calculation, document, audit trail) with a link to the queue that acts on it.
- **ESG Data Explorer** (`/admin/data-explorer`): the same table with values, by period or financial year,
  scope, metric and status.
- **Self-approval** refused at both layers: the browser role can't write approvals or approval status
  (DB test), and a PM holding `approval.decide` is refused on their own record with nothing written (API).
- Checks: web unit 58/58, DB 126/126, API end-to-end 63/63 (every KPI recomputed from raw tables, every
  issue count equal to its landing list, weights and expectations moving the numbers), regressions approvals
  36/36, Phase 13 52/52, 14 33/33, 15 35/35, browser (Edge) 14/14 + approval 8/8 + Phase 13 10/10,
  lint/typecheck/format, production build.

**Phase 17 — Reporting.** Decisions: `.grill/phase-17-reporting-decisions.md`.
- **`/admin/reports`**: generate a BRSR report for any org node and one period or an April–March financial
  year (deviation D17); the request records a run and returns at once, the job runs after the response
  (Next.js `after()`), the page refreshes while it works, and the requester is notified "Report ready" or
  with the failure reason. Every run — successful or failed — is kept and listed.
- **PDF** rendered from self-contained HTML by headless Chromium (`puppeteer-core` + `@sparticuz/chromium`,
  TRD §17; locally Edge via `CHROMIUM_EXECUTABLE_PATH`), JavaScript and network disabled, stored in a private
  `reports` bucket (migration `0025`) and served only through an Admin-checked route.
- **Snapshot** (`report_runs.snapshot_data`): every reported value from the Phase 15 consolidation rules
  (approved only; percentages from summed counts; kg shown with tonnes), a Scope 1/2/3 summary, the number
  left out for awaiting approval, and per indicator the contributing records **with the calculation row each
  used** (schema §13.1).
- **Report Detail `/admin/reports/[id]`**: the signature drill-down — Report value → BRSR indicator → ESG
  metric → calculation → verified activity data → original document, in a side panel, three clicks from
  the value, showing the exact trace the report used (and saying so if the record was recalculated since;
  "source record unavailable" if it no longer exists).
- **Failures are specific**: "Report generation failed: 1 required BRSR indicator has no metric mapping
  (P1-E2)…" (required = Section A/B + Essential), rendering and storage failures named, runs stuck 10 minutes
  failed with a reason.
- **Found while checking the first real PDF**: P6-E8 printed the waste's **emissions** where BRSR asks for
  the waste **quantity**. Mappings now say which value they report (deviation D18, migration `0026`):
  P6-E8 reports 7,500 kg (7.5 t), P6-L4 the emissions.
- New dependencies: `puppeteer-core`, `@sparticuz/chromium`.
- Checks: web unit 62/62, DB 134/134, API end-to-end 39/39 (snapshot equals the live consolidation, PDF
  downloads and is private, failure reasons, stale runs, access), browser (Edge) 9/9 — the signature demo:
  generate, open, click the Scope 1 diesel figure, reach the original diesel invoice — regressions Phase 14
  33/33 + 8/8, Phase 15 35/35, Phase 16 63/63 + 14/14, lint/typecheck/format, production build.

**Phase 18 — Audit and security hardening.** Decisions: `.grill/phase-18-audit-security-decisions.md`;
review: `SECURITY_REVIEW.md`.
- **`/admin/audit-trail`** (sidebar "Audit Trail"): filter by user, action, record type, record id and date
  range; each event expands in place to its before/after values; CSV export; keyset paging ("Older events").
  **A record's complete history** (`?record=`, linked from the shared record drawer as "View audit history"):
  its own events, its document's (upload, OCR), its fields' extraction and edits, and every report whose
  snapshot included it. tRPC `audit.options`, `audit.query`, `audit.record` (`audit.view`).
- **The audit log is append-only for every role**, the server's included (migration `0027`: triggers refuse
  UPDATE, DELETE and TRUNCATE), and entries from one transaction keep their real order
  (`clock_timestamp()`). Audit coverage checked against schema §12.1; the one gap — a record entering the
  approval queue — now writes `approval.submitted`.
- **Security review** with every finding fixed or recorded: sign-in throttling was effectively global
  (Supabase sees the app server's one address) → 5 failed attempts per account and 50 per client address per
  15 minutes; 60 uploads per user per 10 minutes; limits in `org_settings.rate_limits`, counters in
  `rate_limit_events` under hashed bucket names (deviation D19). **CSRF**: tRPC mutations are refused unless
  the `Origin` is the app's own host. Signed upload URLs keep Supabase's fixed two hours (accepted: single use,
  path-bound, bytes re-verified); there are no download signed URLs. RLS audit (37 tables, all RLS, no browser
  write grants), no server secret in the client bundle, `pnpm audit` and `pip-audit` clean.
- **Found while testing:** the audit paging cursor lost microseconds twice — through a JavaScript `Date` and
  through postgres.js, which serialises a `timestamptz` parameter the same way — and skipped events that
  share a timestamp. The cursor is now built and compared as text.
- Checks: web unit 65/65, DB 145/145, API end-to-end 54/54 (paging continuity, filters, a reported record's
  history, Admin-only access, append-only as the server's role, cross-site Origin refused, lockout and reset,
  upload quota, signed URL single use and expiry, no public evidence URL), browser (Edge) 12/12,
  regressions Phase 16 63/63 + 14/14, Phase 17 39/39 + 9/9, approvals 36/36, lint/typecheck/format,
  production build.

**Phase 19 — UI polish and responsive behavior.** Decisions: `.grill/phase-19-ui-polish-decisions.md`.
- **Theme switcher** on Profile (Warm / Corporate / Dark, a radio group, arrow keys work): applies at once,
  saved on the account (`users.theme`, migration `0028`, deviation D20, audited) and kept in localStorage,
  which a tiny script applies before first paint — no flash of the default; the signed-in shell re-applies
  the account's value, so it follows the user to another device.
- **WCAG AA in all three themes**: a token sweep measured every pair the UI renders, and 19 tokens that
  failed for their role moved to the nearest passing shade of the same hue (table with before/after ratios in
  A19): status colours as text, Theme 3's muted text, focus ring, links and scope colours, input borders
  everywhere. A new `--primary-text` token carries primary-coloured text (Theme 3's burgundy is invisible as
  text). axe-core then passed on every page in every theme.
- **Responsive (UI brief §16)**: below 1280px the sidebar is an icon rail with a toggle that opens it over the
  page; tables scroll sideways with the first column pinned; Verify Extraction already stacked; phones get
  the core flows with no sideways scrolling.
- **States (§15)**: route-level loading skeletons and error boundaries in both shells (the error names what
  happened, gives a reference and Try again), a Not found page (unknown or malformed ids in URLs land there
  instead of the server-error message), next-action links on empty states, and an action on an expired
  session now goes to sign-in and back to the same page — the proxy used to redirect the action itself, so
  it silently did nothing.
- **Consistency (§18)**: the top bar uses the §6.2 header tokens, Scope 1/2/3 use the §6.11 icons (flame, zap,
  link-2), and every page has at most one primary button (Profile's Save became an outline button).
- Checks: web unit 69/69, DB 150/150, token contrast sweep 0 failures, axe-core (WCAG 2.1 AA) 84/84 pages ×
  themes and one-primary-button 28/28, browser (Edge) 30/30 — theme switching, another device, skeleton, a
  real server failure recovered with Try again, not found, unauthorized, expired session, tablet rail and
  pinned column, Verify stacking, phone widths — regressions Phase 18 54/54 + 12/12, Phase 17 39/39 + 9/9,
  Phase 16 63/63 + 14/14, approvals 36/36 + 8/8, Phase 13 browser 10/10, lint/typecheck/format, production
  build. Older browser scripts now wait for streamed content (pages render a skeleton first).

**Phase 20 — Testing and edge cases.** Decisions: `.grill/phase-20-testing-decisions.md`; results:
`QA_CHECKLIST.md`.
- **A committed end-to-end suite** (`apps/web/tests/e2e/`, `pnpm --filter web test:e2e`): the plan's critical
  Scenarios A–D (diesel, electricity, HR with a genuinely low-confidence field, the consolidated report down to
  each original document), authorization boundaries through the app and straight at the database API with a
  real user token, and every automatable edge case from plan §6 — 149 checks. It provisions its own accounts
  (fresh random passwords each run) and labelled synthetic factors, refuses a non-local database, and passed on
  a freshly reset database and again on the same data (the local dev database was copied first and restored
  exactly afterwards).
- **Determinism**: every current calculation — direct multiply, percentage, subtract — is recomputed from what
  it stored and must match exactly.
- **Database**: a scoped-read test for every table hanging off a record or document (OCR, verification,
  validation, approvals, calculations, report runs): the owner's PM sees each row, a sibling project's PM none.
  **CI now runs the database tests** on a fresh local Supabase.
- **Found and fixed**: OCR could read the next line's **date as an invoice number** at 96 % confidence when the
  reference had no digits — the guard rail wouldn't have caught it; now an identifier is never a date and the
  field is left for the person (`EXTRACTOR_VERSION` `rules-4`, worker image rebuilt, now tagged
  `traceesg-ocr-worker` as the README says). The OCR harness's clean-up tried to delete audit entries, which the
  Phase 18 append-only log now refuses; it leaves them.
- **Manual QA** (Edge): an upload that loses the network shows its message and Try again completes it;
  navigating while offline shows the browser's own offline page (accepted, QA finding 2).
- Checks: web unit 69/69, worker unit 15/15 and Ruff, OCR harness 9/9 (twice), DB 154/154, end-to-end 149/149
  (fresh database and re-run), Phase 19 browser 30/30, Phase 18 end-to-end 54/54, offline upload 5/5,
  lint/typecheck/format, production build.

**Out-of-sequence work (2026-09-25 onward) — requested by the owner directly, not in any plan phase.** Not yet
committed; this entry records what the decision logs and the working tree show. Test results were not recorded
for it, so run the usual checks before committing. Decisions: `.grill/bulk-import-decisions.md`,
`.grill/password-policy-decisions.md`, `.grill/theme-toggle-decisions.md`.
- **Bulk import** (migration `0029`, D21, A20): two new permissions, `user.bulk_import` (HR by default) and
  `org.bulk_import` (unassigned; an Admin grants it in Roles & Permissions). `/app/users/bulk-import` and
  `/app/org-units/bulk-import` (also embedded in `/admin/users` and the Organization node panel): download an
  `.xlsx` template, parse it in the browser, submit rows; each row is its own transaction and reports its own
  outcome, downloadable as CSV. Org import creates direct children of one chosen parent only. `users.employee_id`
  (nullable, unique) is stored. Bulk-created accounts get a generated default password (name + employee ID,
  padded to policy) and an email through Brevo SMTP; with no Brevo settings, accounts are still created and the
  results say the email was not sent.
- **OTP password reset** (migration `0030`, D22): `/forgot-password` now emails a 6-digit code (hashed, 10-minute
  expiry, 5 wrong guesses, rate-limited per account and address) instead of Supabase's reset link, which only
  reaches the Supabase team on the hosted project. `/reset-password` (invite / first password) is unchanged. It does
  not sign out other sessions (recorded simplification).
- **Password policy** (A22): 12+ characters with upper, lower, number and special character, one module
  (`lib/auth/password-policy.ts`) shared by the live strength meter and every server setter, including
  `provision-user`. `supabase/config.toml` now requires the same locally; hosted Auth must be set to match.
- **Theme toggle** (migration `0031`, D23, A21): a three-swatch toggle in the top bar of both shells replaces
  Profile's Appearance section; the default is now Corporate (`theme-2`), Warm is relabelled "Special". Existing
  accounts keep their theme.
- **OCR:** `EXTRACTOR_VERSION` `rules-5` reads Indian DISCOM thermal bills ("UNITS ADVANCED" as consumption,
  "Bill Dt" as the date). `rules-6` (2026-10-03, found on a real TPCODL bill) takes the billing period from the
  meter readings (`PREV` date to `PRES` date) when no label gives one, and a date can no longer start in the
  middle of a longer number; unit tests for both. `rules-7` (2026-10-04): such bills print no unit ("UNITS ADVANCED:
  141"), so when consumption was read under a "units …" label the unit is filled as kWh at a fixed confidence of 60 —
  below the review threshold, so the person must always acknowledge it (owner-approved; source method
  `implied_by_label`). `rules-8` (2026-10-05): the optional Source classification of a grid electricity bill is the
  utility named on it (TPCODL), from a list of known distribution companies in `profiles.py`; a match through OCR's
  D/O confusion is capped at 70 so it is flagged. `rules-9` (2026-10-05): a water bill's "consumption" is read as
  Water withdrawn (discharge, not on a bill, stays for the person to type; a separate stored consumption field was
  deferred — not yet tried on a real water bill). Details: `.grill/ocr-real-bills-decisions.md`. Replaying a real
  upload's stored OCR lines gives 141 / 11-07-2026 to 13-08-2026 / kWh / TPCODL. The rebuilt
  `traceesg-ocr-worker:latest` contains `rules-9` and the running worker container was recreated from it; a
  container started from an older image does not pick up rule changes, so recreate it after any extraction change.
- **A PDF with several bills** (2026-10-05; migration `0032`, D24, A23; `.grill/multi-bill-pdf-decisions.md`): the
  uploader picks "A PDF with several bills" on Upload; the OCR worker reads every page (up to 20) and *proposes* how
  they split into bills, what each is and the activity; the uploader checks it on the new
  `/app/upload/split/[documentId]` (pages, activity, leave out, add or remove a bill; the same rules run in the browser
  and on the server) and confirms; each kept bill is then cut out as its own PDF (`pdf-lib`) and recorded like a
  single upload, so verify, validate, calculate and approve are unchanged. Each bill is checked against the
  uploader's role (a Project Manager is not offered water). The owner chose: app proposes, person confirms; different
  activities, same project and month; per-bill role check. Limits: consecutive bills of one type look like one (split
  by hand), one reporting period per PDF, PDFs only. New `scripts/make_sample_bundle.py`, `EXTRACTOR_VERSION`
  `rules-10` (also gives `FUEL_INVOICE` classification keywords).
- **Water and source OCR rules** (`rules-8`, `rules-9`): a grid electricity bill's Source is the utility named on it
  (TPCODL); a water bill's "consumption" is read as Water withdrawn (see `.grill/ocr-real-bills-decisions.md`).
- **Checks for the multi-bill work:** worker unit 40/40 and Ruff, web unit 78/78, database tests 164/164, lint,
  typecheck, format; the full end-to-end suite 189/189 on a local stack with the real worker image (Scenario E, the new
  one, is 37 of them: upload, proposed split, role refusal, confirm, each bill read separately); a real-browser run in
  Edge 17/17; the OCR integration harness 9/9; production build passes. While checking, the suite's test
  passwords failed the new password policy and four database tests held stale expectations from `0029`–`0031`; both
  fixed. `apps/web/tests/e2e/lib.mjs` accepts `E2E_ENV_FILE` so the suite can target a local database when
  `.env.local` names a hosted project; `next.config.ts` accepts `NEXT_DIST_DIR`.
- **Dependencies added:** `pdf-lib`, `xlsx`, `nodemailer` (+ types), `exceljs` — `exceljs` is not imported anywhere and can
  probably be removed. `pnpm dev` now pins port 3000.
- **Loose ends:** the Brevo SMTP key lives in `BREVO_API_KEY` (the name is historical — it is an SMTP key, not a
  REST key); `BREVO_SMTP_LOGIN` is optional, and `.env.example` does not list it. `RESEND_API_KEY` was removed from
  `.env.example`.

**Audit fixes P0-2 and P0-3 (2026-10-07).** Decisions: `.grill/audit-p0-decisions.md`; list: `AUDIT_FIXES.md`.
- **Indicator codes follow SEBI's July-2023 BRSR format** (migration `0033`, D25): `A-20`, `A-24`, `P6-E7`, `P6-E9`,
  `P6-L2` renumbered in place, checked against a report filed in the new format; four codes did not move.
- **The report prints SEBI's tables** for greenhouse gases, waste and Scope 3: current and previous financial year,
  metric tonnes of CO2 equivalent, intensity per rupee of turnover, PPP-adjusted and per physical output, the
  assurance note, then a methodology section with the boundary and every conversion factor used and its source.
  Every other indicator also gained the previous-year column. Snapshot version 2 (D26).
- **Turnover, PPP rate, physical output and assurance** are entered once per financial year on Admin → Reports
  (A24), Admin only, audited; anything empty prints "Not provided", never a default.
- **Known gaps, stated in the report itself:** waste by category and recovered quantities are not captured; no
  break-up by gas.
- Checks: web unit 82/82, database 165/165, end-to-end scenarios A–D 82/82 (local stack, real worker image), the
  generated PDF read page by page, lint, typecheck, format, production build. Not run: scenarios E, authorization
  and edge-cases; the OCR harness (no worker change); a browser click-through of the new form.

**Audit fixes P1 (2026-10-07).** Decisions: `.grill/audit-p1-decisions.md`.
- **Hierarchy rules hold for every writer** (migration `0034`, D27): a database trigger refuses a child at the same
  or an earlier level than its parent, a second group, and a level change past a node's children; cycles follow.
- **18 new activities as configuration** (migration `0035`), no engine or schema change. Scope 1: coal by grade
  (anthracite, bituminous, sub-bituminous, lignite), LNG, PNG, refrigerant top-ups R-22 / R-32 / R-410A / R-134a
  and SF6 (owned by EHS). Scope 3: business travel by air, rail and bus/road in passenger-km (the person types
  the distance), cement and steel by weight, freight and employee commuting by spend. Five of ten Scope 3
  categories are active. Every Scope 1 fuel records, optionally, whether it was used in a generator, vehicle or
  equipment.
- Engine units: km and SCM. OCR: the same units, keywords for four new document types; `EXTRACTOR_VERSION`
  `rules-11`, image rebuilt.
- **Not done:** process emissions; the stationary/mobile split in dashboards; other purchased goods. **No factor
  exists for any new activity.**
- Checks: web unit 83/83, worker unit 41/41 and Ruff, database 177/177 (12 new), end-to-end 206/206 on the local
  stack with the real worker image (new Scenario F: a flight and a train of the same distance give different
  results; coal in tonnes against a per-kg factor; role boundaries), lint, typecheck, format, production build.
  Not run: the OCR integration harness, a browser click-through.

**Audit fixes P2 (2026-10-07).** Decisions: `.grill/audit-p2-decisions.md`.
- **Calculations are append-only in the database** (migration `0036`, D28): no delete, no truncate, no update except
  retiring a superseded calculation. The five approved local grid bills without a calculation row were traced to
  early, uncommitted test scripts that deleted factors together with the calculations that used them.
- **Audit entries record where an action came from** — address, browser, sign-in session — shown in the Audit
  Trail and its CSV; and the trail now reads validated → calculated → queued.
- **Security headers** on every response (no framing, nosniff, referrer and permissions policies, HSTS, a basic
  Content-Security-Policy; scripts are not yet restricted). The evidence route keeps its own stricter policy.
- **Evidence is re-checked on read**: a stored file that no longer matches its upload fingerprint is refused.
- Factor geography is kept as a disclosure in the report.
- **Hierarchy levels are configuration** (migration `0037`, D29, A25): an `org_levels` table replaces the enum; an
  Admin adds a level after an existing one, renames one, or removes an unused one, on Admin → Organization. A
  level's code and position never change; `group` stays the root. No existing org unit changed.
- **Several evidence files per record** (A25): supporting files can be added on the verify screen or the record
  drawer by whoever could have uploaded the record, until it is approved or rejected. They are evidence only —
  OCR does not read them and no value changes.
- Checks: database 194/194, web unit 83/83, full end-to-end suite 226/226 on the local stack, lint, typecheck,
  format, production build. Not run: a browser click-through of the new sections.

**Audit fixes P3 (2026-10-07).** Decisions: `.grill/audit-p3-decisions.md`. `AUTH_SECRET` (and the unused
`SENTRY_AUTH_TOKEN`) removed from `.env.example`. The web server reports errors to Sentry when `SENTRY_DSN` is set
(`apps/web/instrumentation.ts`, new dependency `@sentry/nextjs`): server errors and logged errors only, with the
SDK's collection of cookies, headers, bodies, query strings, user details and local variables switched off —
checked by forcing an error against a stand-in endpoint. Browser errors and source maps are not set up. Checks:
lint, typecheck, format, web unit 83/83, production build; the end-to-end suite was not re-run.

**Second audit follow-up (2026-10-08).** Decisions: `.grill/audit-2-decisions.md`. The second audit (read-only,
72/100) left factors, a few activities and parts of SEBI's tables open; the owner asked for all of it except
deployment.
- **Migration `0038`** (D30): process CO2 (Scope 1); purchased steam and heat / cooling (Scope 2); road freight
  by light, medium and heavy truck, in and out, by distance, and employee commuting by bus in passenger-km (6 of
  10 Scope 3 categories active); air emissions NOx, SOx and particulate matter as recorded amounts under a new
  indicator `P6-E6`; an optional waste category on the certificate; the gases a factor covers; how a Scope 1
  activity emits; a guard that a record cannot be verified without a document.
- **The report** (snapshot version 3) breaks each scope up by gas, tells Scope 1 apart by stationary, mobile,
  process and fugitive, fills SEBI's waste table (categories A to H, recovered and disposed by operation), shows
  each child org unit's roll-up, and says which days of the year it covers when not all of them. Text that matches
  no group is printed as "not stated", never guessed.
- **28 factors with a source** entered on the local database through the Admin procedures: grid (CEA); fuels,
  coal and LNG (IPCC 2006 defaults); refrigerants and SF6 (AR5 GWPs); air, rail, bus and road freight (India GHG
  Program, 2015 — India-specific, not a government publication); steel (Ministry of Steel); cement (NITI Aayog as
  quoted by CSE). None for PNG, steam, spend-based activities or waste.
- Also: factor rename and gases on the factor screen, Nm3, a deadline reminder, scripts restricted to the app's
  own origin, OCR `rules-12` (image rebuilt, hosted container not replaced), a hydration warning fixed on
  Notifications, and CI's database job fixed for a fresh database.
- **SDG tags** (2026-10-09, migration `0039`, D31): each indicator carries the UN goals it relates to; the report
  prints them and a goals table, labelled as an indicative mapping. Web unit 92/92, database 208/208, scenario D 34/34.
- **Owner's page feedback** (2026-10-09, A27, `.grill/page-feedback-2026-10-09-decisions.md`): My Submissions
  lists multi-bill PDFs waiting for their split, rows are clickable, Upload no longer redirects, a livelier
  upload animation, a forgot-password link on Profile. Scenario E and the browser bundle test not re-run.
- **Kept as it is, by the owner's decision:** upload-only, no typed-entry form.
- Checks: web unit 91/91, worker unit 43/43 and Ruff, database 206/206, end-to-end 231 checks across all eight
  scripts (not in one run — see CONTEXT.md), a real-browser pass 48/48, a 300-project scale check, lint,
  typecheck, format, production build. Not run: the OCR integration harness; the `rules-12` image end to end.

**Full BRSR format (2026-10-09).** Decisions: `.grill/full-brsr-report-decisions.md`. The owner compared the
report with the L&T reference and asked for the whole format.
- **Finding:** SEBI's format and the L&T report contain no SDGs; they are organised by nine principles.
- **Migration `0040`** (D32): all 146 questions of Sections A, B and C as configuration, worded as in the L&T
  report; each is measured (the ten existing) or written; typed answers in `brsr_disclosures`, one per
  question per financial year.
- **Admin → BRSR Disclosures** (A28): the Admin types the written answers. Typed entry is for statements
  only; measured figures still come from approved records.
- **The report** (snapshot version 4) prints every question in SEBI's order, "Not reported" where empty,
  and a table of all 17 SDGs.
- **Limits:** answers are free text, not SEBI's tables; energy in joules, water discharge and water in
  stressed areas are typed, not measured.
- Checks: web unit 93/93, database 218/218, lint, typecheck, format, a report built from the local database
  and read. Not run: end-to-end, a browser click-through, production build.

**Safety incidents and water discharge (2026-10-09).** Decisions:
`.grill/safety-and-water-discharge-decisions.md`. Migration `0041` (D33): safety incident statements for
employees and for workers (EHS) give the lost time injury frequency rate and fill SEBI's P3-E11 table; a water
record may say where its discharge went and whether it was treated, which fills SEBI's P6-E4 table. 12 of the
146 questions are now answered from records. OCR `rules-13`. Migration `0041` is on hosted and the hosted
worker runs `rules-13` (2026-10-09). Checks: web unit 96/96, worker unit 44/44,
database 225/225, lint, typecheck, format. Not run: an upload through the app, end-to-end, the build.

**Grand Finale deliverables (2026-10-09).** Decisions: `.grill/grand-finale-deliverables-decisions.md`. Against
the five stated deliverables: `ASSURANCE.md` documents how the system supports assurance on BRSR Core KPIs;
the Control Tower shows KPI trends across financial years; Admins can send reminders for missing submissions;
Reports has Past reports and a full-year Evidence list (A29). Checks: web unit 98/98, lint, typecheck, format.
Not run: end-to-end, a browser view. The three-plant demonstration data is the owner's to build.

**ESG data analyst chatbot (2026-10-11).** Decisions: `.grill/chat-analyst-decisions.md`; overview:
`CHATBOT.md`. The owner asked for a chatbot that answers questions about the ESG data a person may see.
- **A language model words the answer; the application supplies every figure.** The model (NVIDIA NIM, or
  any OpenAI-style endpoint) may ask for eight approved read-only tools — totals, comparison, trend, ranking,
  completeness, calculation explanation, and two lists. Each resolves org units only inside the person's
  scope, read from the database for that question, and computes with the consolidation rules.
- **Migration `0042`** (D34): a database role `chat_reader` that can select a named list of tables and
  nothing else, two server-only tables for saved conversations (private, 90 days, deletable), and the
  permission `chat.use`, held by every existing role and changed per role on Roles & Permissions.
- **Screen** (A32): an _Ask_ button in the top bar and a floating button, opening a side panel with the
  wording, figures, tables and charts drawn by the app. Built by the feature session at the owner's request;
  `UI_NOTES.md` tells the ui role what was touched.
- **Models:** `NVIDIA_NIM_MODEL` is a list tried in order; six models on the owner's account pass a
  tool-calling probe. One audit entry per question, without its text. 20 questions per person per 10 minutes.
- Checks: web unit 124/124 (26 new), database 249/249 (24 new), lint, typecheck, format, production build;
  the tool's totals against `consolidateNodes` and raw SQL, 39/39; a real-browser pass in Edge on the built
  app with the real model and the local database, 28/28; the browser bundle searched for the key. **Not
  run:** the end-to-end suite; the rate limit and the 90-day removal; the Special and Dark themes and the
  docked panel; anything on the hosted project.

**Bulk-import templates; a whole branch of org units from one sheet (2026-10-11).** Decisions:
`.grill/bulk-import-decisions.md` (last section), A33. The org-unit sheet gained a Parent code column, so one
sheet creates several levels; the server creates parents first and refuses a row whose parent or code is
ambiguous. Both templates now keep the sheet to fill in free of example rows and list levels and existing
org units as the hierarchy stands at download. Checks: web unit 127/127, lint, typecheck, format; templates
generated and read back and a 12-row sheet imported through the real procedure on local, 31/31. Not run: the
production build, the screens in a browser. Committed on `feature-chat-analyst`, not pushed.

**Hosted cleared, MEIL's Admin inputs, test data (2026-10-11).** Decisions: `.grill/demo-data-decisions.md`.
The owner asked for a clean site, MEIL's details in the Admin's written inputs and two folders of sample data.
The hosted test data was removed in one transaction (a copy of each row kept locally; accounts, audit log and
configuration stay). Entered through the Admin procedures: 23 BRSR Disclosure answers taken from meil.in and
its published annual return and CSR summary, the published turnover under FY 2022-23, and 29 conversion
factors with sources. `test data/` (git-ignored) holds two sets — org-unit and employee sheets, a document for
each of the 47 activities, a multi-bill PDF, a manifest — made by `apps/ocr-worker/scripts/make_test_data.py`.
The bulk-import templates no longer show ids: an org unit with no code is listed and matched by its name.
Checks: web unit 128/128, lint, typecheck, format, Ruff; the worker's real OCR on all 63 single documents of
set 1; the sheets against the hierarchy rules. Not run: an import or upload through the app, the build.
Uncommitted.

**Reports for a custom period; the chatbot for Admins (2026-10-11).** Decisions:
`.grill/chat-admin-access-decisions.md`, D35, A34. Reports can cover a range of reporting periods (migration
`0043`: two date columns on `report_runs`). For an Admin the chatbot can also list people (name, email,
employee id, roles, org units) and individual records with who submitted and approved them, and it opens
the Reports page with the asked-for period selected; for everyone else these three lookups do not exist and
nothing changes. `chat_reader` is unchanged. Checks: web unit 158/158, database 252/252, lint, typecheck,
format, production build; the Admin queries, the refusals for a Project Manager, the link and a custom-range
snapshot through the app's own code on the local database, 27/27. Not run: a browser view of the form and of
the panel going to the page, a question through the real model, a custom report generated to a PDF, the
end-to-end suite. Committed and merged with `main` (web unit 169/169 after the merge); `0043` pushed to hosted 2026-10-11.

**Org units under several parents, several groups, delete; chat pane (2026-10-11).** Decisions:
`.grill/shared-org-units-decisions.md`, D36, A35. From the owner's page feedback. A unit below group level
can be placed under further parents (migration `0044`): it counts in full in each and once in the group
above them, and both parents' people see it; its main parent still manages it. More than one group can
exist, each its own tree, with the same Admins. An unused unit can be deleted after typing `delete`; a used
one is deactivated, and deactivating one with units under it asks for the word. The bulk-import sheet has an
Also under column. The chatbot lists what is under a unit from the hierarchy instead of leaving it to the
model. The chat pane has a coloured header bar, a one-line question box and its suggestions at the foot.
Checks: web unit 174/174, database 271/271, lint, typecheck, format, production build, 25/25 through the
real procedures on the local database. Not run: a browser view, the real model, the end-to-end suite.
Migration `0044` was pushed to hosted on 2026-10-11 and checked there.
The test data was also regenerated with a mix of single PDFs, images and multi-bill PDFs (`9ba9081`).

**Work of 2026-10-12.** Reports and decisions are named in each line; `CONTEXT.md` §1 has the test results.
- **Seven audits and their fixes** (`FINAL_VERIFICATION_2026-10-12.md` is the place to start; one report per
  audit beside it): org scope enforced in five routers that read through the app's own connection, the evidence
  bundle rewritten against the real schema, random bulk-import passwords, HttpOnly session cookies, database
  rules for ownership and the carbon ledger (migration `0047`, D38), contact details kept from the AI service,
  a skip link and contrast fixes, advisories in what ships down from 14 to 2. Open: 2 Medium, 18 Low, hosting,
  legal documents, a human accessibility pass.
- **The app is called EmeilSG**, with a new logo in the browser icon and the landing and sign-in headers
  (`UI_NOTES.md`). The hosted Supabase email templates and the documents still say TraceESG.
- **Invite user emails a temporary password** through the app's SMTP sender, as bulk import does, and **the
  first sign-in must change it** (`.grill/invite-smtp-decisions.md`, A36). Deleting a user refuses only for
  real work on record and says what stands in the way. The sign-in password field has a show/hide button.
- **Expected submissions of the units below show on the parent** (read from the hierarchy, not stored).
  **Role defaults reviewed** (`.grill/role-permissions-decisions.md`, migration `0048`, D39): Corporate ESG
  gains review of flagged values and report generation. **Edit role** on Roles & Permissions.
- **A role can upload on behalf of another** (`.grill/employee-uploads-decisions.md`, migration `0049`, D40):
  the owner's Employee role files a project's bills for its Project Manager.
- **Test data set 1 follows the hierarchy in the web app** and was run through hosted for August 2026 as 21
  labelled test accounts: 57 files, 66 records over all 47 activities, 57 approved, 9 waiting for a factor.

**Super Admins and scoped Administrators (2026-10-13, stage 1 of 6).** Decisions:
`.grill/scoped-admin-onboarding-decisions.md`; D41, A37. Until now every Admin could do everything and
nothing limited how many there were. The `admin` role is now the Super Admin — group-wide configuration and
every org unit, at most two people, enforced by the database. A new role, Administrator, is assigned at any
org unit and administers that unit and everything beneath it: people, the hierarchy, the queues, Scope
1/2/3, the Data Explorer, reports and uploads. Roles are handed out downwards only; an account is changed
only by someone who administers every role it holds. Administrators upload any activity; nobody but a
Super Admin approves their own record, and that is marked in the audit trail. Checks: web unit 204/204,
database 336/336, cross-project procedures 264 passed, end-to-end 344/344 and a new script 77/77, lint,
typecheck, format, build, eight screens in Edge. Not run: chatbot and accessibility suites, phone widths,
anything on hosted.

**Invitation links and session time limits (2026-10-13, stages 2 and 3 of 6).** Decisions:
`.grill/scoped-admin-onboarding-decisions.md`; D42, D43, A38, A39.
- **No password is emailed any more.** Invite user and bulk import create the account and email a link.
  The link carries a random token after the `#`, so it reaches no server log; only its hash is stored; it
  works once and for 24 hours. Opening it changes nothing. The person chooses a password on the new
  `/invite` page, which sets it and uses the link up in one transaction, then sends them to sign in. Resend
  invitation replaces the link, Revoke link cancels it, and both follow the scope rules of stage 1. One
  message covers every link that is no good. Forgot-password sends no code to an account never set up.
- **Sessions end by themselves**: after 3 hours without activity and 12 hours after sign-in, both
  settings, enforced by the app on every request from a clock it keeps per sign-in. Only what the person
  does on the page counts; the notification bell and refreshing lists do not. A notice appears five minutes
  before the end, and an open page leaves for sign-in when the session has ended and returns to the same
  page afterwards. Only that device is signed out.
- Also: the local mail catcher now receives the app's own email (loopback only), so a test can read a real
  link; the accessibility suite runs beside two Super Admins; one small target on the Audit Trail was
  made 24px high.
- Checks: web unit 210/210, database 367/367, end-to-end 519/519 over eleven scripts on the built app
  (the new script is 98 of them), cross-project procedures 264 passed, chatbot 49/49, accessibility 188
  passed / 0 failed / 2 known open, lint, typecheck, format, production build, the new screens in Edge at
  1440 and 390px. Not run: a real email through Brevo, anything on hosted, a real three-hour wait.

**Owner's feedback (2026-11-01).** Decisions: `.grill/org-tree-users-notifications-periods-decisions.md`; D44, A40.
Periods close by themselves at their submissions close date (migration `0053`, a job every five minutes); a closed
period takes no new documents but what was uploaded finishes review. Invited people's name and email can be corrected.
Role codes give clear messages, and every form now shows a validator's words instead of its raw JSON. Notifications
pop up within 5 seconds while the tab is visible, once per account. Submission Monitoring, the Data Explorer and
Expected Submissions choose units from one tree. Test results: `CONTEXT.md`.

**Feature roadmap, Phase 0 and Phase 1 (2026-11-07).** `PS_Documents/implementation_docs/feature_enhancement.md`
(40 requirements, status in its Appendix A), audit `FEATURE_ENHANCEMENT_AUDIT_2026-11-07.md`, decisions
`.grill/feature-enhancement-roadmap-decisions.md`; D45, A41. One signed-in session per account: a second device is
asked first and, on confirmation, ends the other sign-in (revoked in Supabase Auth too, audited with both devices);
the other device is told why and when; a Super Admin's takeover is emailed to them (migration `0055`, requirements
18 and 32). The 20 approved permission names on Roles & Permissions (13); show/hide on forgot-password,
reset-password and Profile (11); a re-check of the code written since the October audits (20): one Low fixed, three
Low recorded. Checks: web unit 238/238, database 408/408, end-to-end 10 of 11 scripts in full (sessions 112/112,
authorization 42/42, audit-regression 110/110, scoped-admin 77/77, scenarios A–F, edge cases), feedback-2026-11
85/85 before an Add ID step that also fails without these changes, cross-project 264 passed, production build,
lint, typecheck. Not on hosted.

**Feature roadmap, Phase 2 (2026-11-08).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 2
decisions"); D46, A42. Several reporting periods may be open at once and the uploader picks one; each has a due
date and a "late uploads until" date (defaults +15 / +45 days); a late upload is marked and flagged for review, and
a unit's Administrator may accept it. Duplicates: an identical file and the same bill (bill number + billing period +
activity, any unit or period) are Validation Queue flags naming the earlier record; a corrected re-upload is a new
version. The confirmed bill number is kept on the record and searched. Submission Monitoring and the Data Explorer
filter by Activity and Document type; the record panel has a stage tracker, Admin document-type correction and
"return as wrong activity"; the approval list has bill previews and row Approve / Return; downloads get readable
names. Checks: web unit 243, database 425/425, end-to-end 12 of 13 scripts in full (623 checks, the new
`phase2-lifecycle.mjs` 45/45; feedback-2026-11 stops at the old Add ID refresh step), browser `ui-phase2.mjs` 13/13
in Edge, typecheck, lint, production build. Not on hosted. Findings: Grid Electricity captures no bill number; every
activity has one document type.

**Feature roadmap, Phase 3 (2026-11-08).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 3
decisions"); D47, A43. The missing billing period on photographed TPCODL bills was traced on hosted (the present
reading's date runs into the reading, "PRES:7591.1201-04-2026") and fixed in OCR `rules-14` at a capped confidence;
a missing period now says why. OCR checks every document type and flags a clear mismatch with the chosen activity.
OCR Monitoring is part of Submission Monitoring (OCR column, filter, stalled-worker warning, Retry in the record
panel). Verify Extraction boxes each value on the document and keeps both in step; unresolved low-confidence values
are red; the values download as Excel. Grid Electricity records its bill number (migration `0057`). Handwriting
(conductor-written bus tickets) waits for sample photos. Checks: worker unit 53/53 and Ruff, web unit 244, database
425/425, end-to-end 13 of 14 scripts in full with the rules-14 image (601 checks, `phase3-ocr.mjs` 22/22; feedback-2026-11 stops at the old Add ID step), browser `ui-phase3.mjs` 8/8, typecheck, lint, build.

**Feature roadmap, Phase 4 (2026-11-08).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 4
decisions"); D48, A44. A ready report is forwarded for verification to the Administrators of the next unit up (or
the Super Admins at the top), who verify it, optionally sending it on, or return it with a reason; every step is
audited and notified and the report shows its trail; nobody verifies a report they generated or forwarded. The audit
log is open to everyone, scoped by what an entry is about: own entries for all (My Activity), plus an
Administrator's units; search bar, role filter and roles shown. Checks: web unit 250, database 432/432,
end-to-end 14 of 15 scripts in full (637 checks, `phase4-forwarding-audit.mjs` 36/36; feedback-2026-11 stops at the old Add ID step), browser `ui-phase4.mjs` 10/10, typecheck, lint, build.

**Feature roadmap, Phase 5 (2026-11-08).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 5
decisions"); D49, A45. Reminders go out once a day at 9:00 India time (Vercel Cron on `/api/cron/reminders`,
protected by `CRON_SECRET`; a Super Admin can Run now): 7 to 0 days before a period's due date in the app, by email
on 7, 5, 3 and the due day, each a Super Admin setting. Each person gets one message listing their missing
submissions; each Administrator a summary of their units; the Super Admins a group summary on email days. Every
reminder is a row (migration `0059`) claimed before sending, so nothing goes out twice; a failed email is tried once
more. Reporting Deadlines shows the schedule and the sent log, and opens to Administrators for their units. The
bell's own "due soon" notices and the sweep's before-due stages are gone (overdue escalations stay). Checks: web unit
256, database 439/439, `phase5-reminders.mjs` 33/33, browser `ui-phase5.mjs` 17/17 in Edge, typecheck, production
build; full suite in CONTEXT.md. `0059` on hosted 2026-11-08; the daily run needs `CRON_SECRET` on Vercel and a deploy.

**Feature roadmap, Phase 6 (2026-11-08).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 6
decisions"); D50, A46. No SEBI or other official API publishes emission factors (recorded). Each factor version now
keeps its source link, publisher, financial year and the date it was read; a link on an official site (CEA, BEE,
IPCC and others) can be fetched and a value picked from the page, never saved by itself. New and corrected versions
are drafts until another Super Admin approves them (the only Super Admin may approve their own, marked). A yearly
review lists what each financial year still needs. Carbon Markets lists outside sites for exploring or buying
credits, checked, under a notice that EmeilSG sells none. Checks: web unit 263, database 453/453, procedures
`test:factors` 46/46, `phase6-factors.mjs` 28/28, browser `ui-phase6.mjs` 18/18 in Edge, a real CEA PDF and the
BEE page read through the built app, typecheck, lint, production build; full suite in CONTEXT.md. `0060` on hosted
2026-11-09.

**Feature roadmap, Phase 7 (2026-11-09).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 7
decisions"); D51, A47. A new page, Carbon Analytics, shows emissions by financial year for a unit and everything
beneath it, per scope and per activity, from approved records, compared like for like and saying what is missing.
Fixed rules suggest actions (travel policy, energy audit, leak checks and others) with the figures behind them;
the AI service may reword one on request, and a wording with figures it was not given is refused. A daily check
compares each closed period with the same period of earlier years and alerts the unit's Administrators and the
Super Admins in the app and by email, once (migration `0061`). Checks: web unit 273, database 465/465,
procedures `test:analytics` 44/44, `phase7-analytics.mjs` 23/23 through the daily trigger and the mail catcher,
browser `ui-phase7.mjs` 23/23 in Edge; full suite in CONTEXT.md. `0061` on hosted 2026-11-09. AI wording not confirmed with a
real reply (the configured models are retired or refused).

**Feature roadmap, Phase 8 (2026-11-09).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md` ("Phase 8
decisions"); D52, A48, `UI_NOTES.md`. Reports offers four templates over the same approved figures: the full SEBI
BRSR, BRSR Core, a GHG inventory (also as an Excel workbook) and an executive summary (migration `0062`). A search
in the top bar (Ctrl+K) finds records, people, org units, reports and pages, only what each person may open. The
Scope pages' Table / Chart switch now changes every summary section and is kept in the address. The Ask button
and the landing page were reworked by the feature lane at the owner's request. Checks: web unit 287, database
471/471, `test:search` 23/23, `phase8-templates-search.mjs` 35/35 (every template generated and read back, the
workbook opened), browser `ui-phase8.mjs` 30/30 in Edge with axe; full suite in CONTEXT.md. `0062` on hosted 2026-11-09.

**Feature roadmap, Phases 9 and 10 (2026-11-09).** Decisions: `.grill/feature-enhancement-roadmap-decisions.md`
("Phase 9 decisions", "Phase 10 decisions"); A49, `UI_NOTES.md`. Phones get a bottom bar and a Menu drawer,
"Take a photo" on Upload and documents that fit on Verify; the custom cursor no longer follows taps; EmeilSG
installs from the browser (docs/MOBILE_APP.md). A Help page explains the product as configured. The
transaction-pooler hang no longer reproduces (docs/PRODUCTION_DATABASE.md). On the owner's go, hosted was reset to
the Super Admins, the Administrators and the configuration (backup restored and compared first) and copied to a
local Supabase stack on this machine, verified table by table (docs/LOCAL_DATABASE_SERVER.md). `RELEASE.md` holds
the release checklist, rollback, operations and the regression run: unit 287, database 471/471, end-to-end 19 of
20 scripts, isolation 264, accessibility 190/0/0, scale and large-file checks.

Stages still to come: an org-tree picker with Scope filters and Excel exports, demo requests with public
docs, the phone and tablet pass.

## 4. What comes next

**Deploying the web app to Vercel** (the owner's next step): `DEPLOYMENT.md` has the settings, the
variables and what to try on the first deployment. Merge `feature-employee-uploads` first — it holds the fix
that packages the report browser. Still to do around it: rebuild the worker image and replace the hosted
container, update the hosted email templates to the new name, decide whether the 21 test accounts stay.

**Organization feedback, to finish:** look at
the Organization page and the chat pane in a browser; bring `origin` (MACRO72) up to date with `ucn` `main`.

**Chatbot, to finish:** push `feature-chat-analyst` and open its pull request; on hosted (migration `0042` is there since 2026-10-11) the owner sets a password for `chat_reader`, then try its connection through the pooler; set the four variables for the owner's dev server. Review NVIDIA's terms before real MEIL figures go through the free endpoints.

**Demo on hosted, the owner's steps:** create the August and September 2026 periods, import the org units and the
users from `test data/` (typing the email addresses), upload the documents, approve, generate the report.

**Before Phase 21:** run the end-to-end suite and click
through BRSR Disclosures. Make the hosted project ready for the demo (the owner chose hosted). In order: push the
local commits; replace the hosted worker (migrations `0038` and `0039` were pushed on 2026-10-09) with the
`rules-12` image; the owner invites a second Admin; the reviewed factors are entered through the app (retire the
0.02 grid factor first) and an org tree is created; one diesel and one electricity record are taken through to a
report and the PDF is read. Still open: factors for PNG, steam, spend-based activities and waste; energy in
joules and water discharge (not captured); the industry's promised list of reports; merging pull request #2.
Set `SENTRY_DSN` on the web host at deployment.

**Phase 21 — Deployment** (`06_IMPLEMENTATION_PLAN.md` §Phase 21): the production Supabase project (or the dev
project promoted — decide explicitly), `apps/web` (Vercel was planned) and the OCR worker (**host to be decided
by the owner; not Render**, and not a sleeping tier), production migrations as a reviewed step, Sentry and log
streams, backups confirmed, a rollback procedure tested once, `DEPLOYMENT.md`, and the critical end-to-end test
re-run against the live URLs. The owner will say where each part is hosted before this starts.

All migrations `0001`–`0037` are on the hosted project and the hosted worker container runs the matching image
(`rules-11`); when migrations and the worker change again, push first, then replace the container — a worker
newer than the database fails every job.

Things to remember for Phase 21:
- The end-to-end suite refuses any non-local database by design; running Scenarios A–D against production
  needs a deliberate, reviewed switch (and test accounts and synthetic data that must not stay there).
- Everything in "Open items" below: the database password to rotate,
  Supabase Auth limits (SECURITY_REVIEW.md F8) and password rules, SMTP, Chromium on Vercel, the worker host.
- The OCR worker is a background process with no web port: it polls Postgres, needs about 2 GB RAM and must stay
  running. Its image (`apps/ocr-worker/Dockerfile`, ~2.3 GB) bakes the model weights in; `DATABASE_URL` must be
  the Supabase session-pooler string (the direct connection is IPv6-only).
- No conversion factors exist outside local data; MEIL must enter verified ones before emissions calculate.

## 5. Open items and blockers

- **Hosted Supabase (`ps08_brsr_meil`, Mumbai, development only):** migrations `0001`–`0037` are
  pushed (`0033`–`0037` on 2026-10-07; `0015`–`0028` on 2026-09-22 and `0032` on 2026-10-05 with `supabase db push --db-url`, session pooler;
  `0029`–`0031`, bulk import / OTP table / default theme, were already there). Verified as of `0028`, and for `0029`–`0032`
  on 2026-10-05 (new columns and table present, RLS on, no browser grants, permissions and `theme-2` default in place):
  37 tables (35 + `rate_limit_events` + `submission_expectations`, D16/D19) all with RLS, `authenticated`
  has zero table-level write privilege anywhere, `anon` zero read privilege anywhere, both `evidence` and
  `reports` buckets private, the append-only audit triggers exist, `org_settings` holds exactly
  `brsr_readiness_weights`/`ocr_confidence_threshold`/`rate_limits`, no seed/test data beyond the MEIL root
  and reference config, all 28 versions recorded in `supabase_migrations.schema_migrations`. Still to do:
  auth settings from `supabase/config.toml` (no sign-ups, 12-character passwords **with upper, lower, number and
  symbol**, see A22) — needs
  `supabase login` (a Management API access token; the DB password alone doesn't grant this) or setting
  them by hand in the dashboard; rotate the database password (shared in chat twice now); provision the
  first hosted Admin (needs the project's anon and service-role keys, not yet shared); raise Supabase
  Auth's per-IP sign-in limit (`SECURITY_REVIEW.md` F8).
- **Report PDFs in production:** set `SUPABASE_STORAGE_BUCKET_REPORTS=reports` on Vercel; `@sparticuz/chromium`
  is untested there yet (cold start and bundle size are the known risks, TRD §17).
- **Worker deployment:** host not chosen (the owner does not use Render; `render.yaml` is unused). Whatever the
  host, DATABASE_URL must be the session-pooler string. Local containers `traceesg-ocr-worker`, `elastic_booth`
  and `traceesg-ocr-worker-hosted` are stopped test leftovers; the image to deploy is `traceesg-ocr-worker:latest`.
- **Email:** Brevo SMTP is wired for bulk-import passwords and OTP reset (`BREVO_API_KEY` = the SMTP key,
  `BREVO_SENDER_EMAIL` must be a verified sender, `BREVO_SENDER_NAME`, optional `BREVO_SMTP_LOGIN`); set them on
  the web host. Since 2026-10-12 (A36) Invite user also emails a temporary password through Brevo, so the app no
  longer depends on Supabase Auth's own email (which only reaches the Supabase team); only
  `provision-user` without a password still uses it.
- **CI:** the new database job runs on GitHub only once pushed (untested there). The end-to-end suite, the OCR
  integration harness and the Docker image build run locally.
- **Real documents:** OCR accuracy on real MEIL documents is untested — only synthetic samples so far.
- **Conversion factors are empty everywhere except locally.** No factor values exist in any migration by
  design; MEIL must enter the verified factors (with their sources) before any emission calculates. The
  Phase 13 metrics need no factor. Every factor in the local database is labelled as a synthetic
  development value, not an authoritative factor.
- **Deferred by design:** a global (every-page) org/period context switcher, Submission History page and
  record detail views, Settings page to edit the OCR threshold.
- **Security out of scope:** third-party penetration testing, CAPTCHA on sign-in (`SECURITY_REVIEW.md`).
- **Abandoned uploads:** a file uploaded but never completed (browser closed mid-flow) stays in Storage with
  no database row. Nothing references it; add a cleanup job if it becomes noticeable.
- **Local memory:** the dev server, Docker/Supabase and the OCR worker together exhaust ~12 GB machines; the
  dev server's CSS worker crashed once during Phase 6 testing. Run the worker container only when needed.

## 6. How we work

1. **One phase at a time.** Finish, verify, report, then stop and wait for the project owner's go-ahead
   before committing or starting the next phase.
2. **Ask before deciding.** If the documents don't settle a decision, ask the owner first, then record the
   answer in `.grill/phase-N-<topic>.md`.
3. **Specification is read-only.** Never edit anything in `ps_documents/` unless explicitly told to. Record
   intentional differences in `supabase/SCHEMA_DEVIATIONS.md` or `apps/web/APP_FLOW_DEVIATIONS.md`.
4. **No application code in `ps_documents/`.** Code lives under `apps/`, `packages/`, `supabase/`.
5. **Follow the planned UI.** Use the UI brief's tokens, components and flows; don't invent screens.
6. **No fake data or fake success.** Anything not yet real is visibly labeled a development placeholder.
7. **Security rules:** identity comes from the server session, never from client input; authorization is
   checked on the server; every change writes an audit log entry in the same transaction; no secrets in
   the repository; uploaded evidence is never public.
8. **Verify for real.** Each phase runs: format check, lint, typecheck, unit tests, production build,
   database tests, an end-to-end API script and a real browser check.
9. **Report format** at the end of a phase: Phase completed / Files created / Files modified /
   Dependencies added / Configuration added / Tests run / Results / Documentation requirements satisfied /
   Assumptions / Blockers / Next phase.

## 7. Local development quick facts

- Commands are in `README.md`. `pnpm` comes from Corepack (`corepack enable`).
- Local Supabase uses `553xx` ports: API `55321`, Postgres `55322`, Studio `55323`, Mailpit `55324`.
- `apps/web/.env.local` holds local keys (git-ignored — never print or commit it).
- Local test hierarchy (from `supabase/seed.sql`): MEIL → Subsidiary A (`SUB-A`) → Project X (`PRJ-X`) →
  Project X Site 1 (`PRJ-X-S1`); open period "September 2026".
- Local users are created with `pnpm --filter web provision-user` and need re-creating after `pnpm db:reset`.
- Start Supabase with `storage-api` running (uploads need it); `SUPABASE_STORAGE_BUCKET_EVIDENCE=evidence`.
- OCR worker: `apps/ocr-worker/.venv` (Python 3.12), `.env` copied from `apps/web/.env.local`, models in
  `apps/ocr-worker/models/`; `python -m worker --once` processes the local queue. Docker alternative:
  `docker build -t traceesg-ocr-worker apps/ocr-worker` (see README → Deployment).

## How to update this file

At the end of every phase (before asking to commit):
1. Change the _Last updated_ line.
2. Update the phase's row in the progress table (status, and the commit hash once committed).
3. Add a short "What it delivered" entry.
4. Rewrite **What comes next** for the following phase.
5. Update **Open items and blockers** — remove what's resolved, add what's new.

Keep it short and plain; details belong in the `.grill/` logs, deviation files and commit history.
