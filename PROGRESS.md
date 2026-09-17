# TraceESG (BRSR_MEIL) — Context and Progress

The single place to find out **what this project is, what has been built, how we work, and what comes
next**. Read this first, whether you are a person joining the project or an AI agent starting a new
session. Update it at the end of every phase (see [How to update this file](#how-to-update-this-file)).

_Last updated: 2026-09-17 — Phase 6 complete, awaiting commit._

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
| `supabase/migrations/` | Database schema, RLS, seed reference data, evidence bucket, OCR field requirements, OCR threshold (`0001`–`0014`) |
| `supabase/tests/database/` | pgTAP database tests |
| `supabase/SCHEMA_DEVIATIONS.md` | Every intentional difference from `05_BACKEND_SCHEMA.md` (D1–D13) |
| `apps/web/APP_FLOW_DEVIATIONS.md` | Every intentional difference from `03_APP_FLOW.md` / UI brief (A1–A7) |
| `render.yaml` | Render Blueprint for the OCR worker (background worker, Docker) |
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
| 6 | OCR pipeline integration | **Done, not yet committed** | — |
| 7 | OCR verification | **Next** | — |
| 8 | Validation engine | Not started | — |
| 9 | Calculation engine | Not started | — |
| 10 | Scope 1 | Not started | — |
| 11 | Scope 2 | Not started | — |
| 12 | Scope 3 foundation | Not started | — |
| 13 | Role-specific modules (HR, EHS, Procurement, Finance/CSR) | Not started | — |
| 14 | BRSR mapping | Not started | — |
| 15 | Consolidation | Not started | — |
| 16 | Admin Control Tower | Not started | — |
| 17 | Reporting | Not started | — |
| 18 | Audit and security hardening | Not started | — |
| 19 | UI polish and responsive behavior | Not started | — |
| 20 | Testing and edge cases | Not started | — |
| 21 | Deployment | Not started | — |

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

## 4. What comes next

**Phase 7 — OCR verification** (`06_IMPLEMENTATION_PLAN.md` §Phase 7):
- Replace the `/app/verify/[documentId]` placeholder with the real split screen (UI brief §12.2):
  reusable document viewer (signed URL) on the left, extracted fields on the right with click-to-edit and
  confidence per field.
- Guard rail: Confirm disabled until every flagged field (below threshold **or** `is_critical`) is edited
  or explicitly acknowledged — enforced on the server too.
- `verification.confirm` (ocr_fields verified values, `verifications` row, record `user_verified`, audit —
  one transaction) and `verification.reject` (reason required).
- OCR-failure manual-exception path (`verifications.is_manual_exception`), "document type not identified"
  picker, post-OCR duplicate warning by invoice number.

Things to remember for Phase 7:
- Notifications and My Submissions already link to `/app/verify/{documentId}`; failed extractions sit under
  Needs Verification.
- The "needs attention" rule lives in two places that must agree: `worker/extraction/fields.py`
  (`fields_needing_attention`) and the `fieldStats` SQL in `lib/trpc/routers/ocr.ts`.
- `is_critical` is still false for every field (Phases 10–11 decide).

## 5. Open items and blockers

- **Hosted Supabase (`ps08_brsr_meil`, Mumbai, development only):** migrations `0001`–`0014` were pushed on
  2026-09-17 with `supabase db push --db-url` (session pooler, `aws-0-ap-south-1.pooler.supabase.com`) and
  verified: 35 tables all with RLS, reference data, private `evidence` bucket, threshold 80, no seeds, no
  users. Still to do: auth settings from `supabase/config.toml` (no sign-ups, 12-character passwords —
  `supabase config push` after `supabase login`, or set in the dashboard), rotate the database password
  (it was shared in chat), provision the first hosted Admin.
- **Worker deployment:** apply `render.yaml` in Render and enter the secrets there (DATABASE_URL = session
  pooler string). The Blueprint file is unvalidated until Render reads it.
- **Email:** configure custom SMTP (Resend) before inviting anyone outside the Supabase team.
- **CI:** database tests (`pnpm db:test`), the OCR integration harness and the Docker image build run
  locally only.
- **Deferred by design:** org/period context switcher (Phase 16), theme switcher and Theme 2/3 contrast
  sweep (Phase 19), CSRF review of the tRPC endpoint — currently relies on SameSite=Lax cookies (Phase 18),
  Submission History page and record detail views, Settings page to edit the OCR threshold.
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
