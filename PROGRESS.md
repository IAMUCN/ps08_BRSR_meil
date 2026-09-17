# TraceESG (BRSR_MEIL) — Context and Progress

The single place to find out **what this project is, what has been built, how we work, and what comes
next**. Read this first, whether you are a person joining the project or an AI agent starting a new
session. Update it at the end of every phase (see [How to update this file](#how-to-update-this-file)).

_Last updated: 2026-09-17 — Phase 5 complete, awaiting commit._

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
| `apps/ocr-worker/` | Python 3.12 PaddleOCR worker — dependencies only so far |
| `packages/shared-types/` | Shared TypeScript types |
| `supabase/migrations/` | Database schema, RLS, seed reference data, evidence bucket (`0001`–`0012`) |
| `supabase/tests/database/` | pgTAP database tests |
| `supabase/SCHEMA_DEVIATIONS.md` | Every intentional difference from `05_BACKEND_SCHEMA.md` (D1–D10) |
| `apps/web/APP_FLOW_DEVIATIONS.md` | Every intentional difference from `03_APP_FLOW.md` / UI brief (A1–A6) |
| `README.md` | Setup and day-to-day commands |

## 3. Progress

Phases come from `06_IMPLEMENTATION_PLAN.md`. Track A is the app; Track B (Phase 2B) is the OCR worker and
may run in parallel with Phases 3–5.

| Phase | Name | Status | Commit |
|---|---|---|---|
| — | Documentation consistency fixes | Done | `1be9a13` |
| 1 | Project setup | Done | `aedd96a` |
| 2 | Database | Done | `494a3a4` |
| 2B | OCR worker development (Track B) | **Next** — not started (venv + `requirements.txt` only) | — |
| 3 | Authentication and authorization | Done | `47fcc17` |
| 4 | Organization and Admin foundation | Done | `1594389` |
| 5 | Document ingestion | **Done, not yet committed** | — |
| 6 | OCR pipeline integration | Waiting on 2B | — |
| 7 | OCR verification | Not started | — |
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

## 4. What comes next

**Phase 2B — OCR worker** (`06_IMPLEMENTATION_PLAN.md` §Phase 2B) is next, because Phase 6 needs both
Track A (done through Phase 5) and Track B. It builds `apps/ocr-worker`: poll `ocr_jobs` for `pending`
rows (`for update skip locked`), download the file from the private `evidence` bucket with the service
role, run PaddleOCR, write `ocr_extractions` + `ocr_fields` with per-field confidence, mark the job
`completed` or `failed` with an error message, plus a standalone test harness.

Things to remember for Phase 2B:
- **Synthetic sample documents only** (a synthetic diesel invoice and electricity bill) until Phase 18.
- Model weights are baked into the worker image, never fetched at runtime (TRD §35).
- The worker never marks anything verified — extraction only.
- Real `pending` jobs already exist locally from Phase 5 uploads (`documents.storage_path` gives the object).

**Phase 6 — OCR pipeline integration** follows: real uploads flow into the worker, and OCR status shows
as badges on My Submissions.

## 5. Open items and blockers

- **Hosted Supabase (Mumbai, development only):** migrations `0001`–`0012` and auth settings are not pushed.
  Needs the project owner to run `supabase login` and `supabase link`, then a reviewed `supabase db push`.
- **Email:** configure custom SMTP (Resend) before inviting anyone outside the Supabase team.
- **CI:** database tests (`pnpm db:test`) run locally only.
- **Deferred by design:** org/period context switcher and notification bell (with their data phases),
  theme switcher and Theme 2/3 contrast sweep (Phase 19), CSRF review of the tRPC endpoint — currently
  relies on SameSite=Lax cookies (Phase 18).
- **Abandoned uploads:** a file uploaded but never completed (browser closed mid-flow) stays in Storage with
  no database row. Nothing references it; add a cleanup job if it becomes noticeable.

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

## How to update this file

At the end of every phase (before asking to commit):
1. Change the _Last updated_ line.
2. Update the phase's row in the progress table (status, and the commit hash once committed).
3. Add a short "What it delivered" entry.
4. Rewrite **What comes next** for the following phase.
5. Update **Open items and blockers** — remove what's resolved, add what's new.

Keep it short and plain; details belong in the `.grill/` logs, deviation files and commit history.
