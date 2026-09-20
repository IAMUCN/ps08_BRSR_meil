# App Flow Deviations

Intentional differences from `ps_documents/implementation_docs/03_APP_FLOW.md`, recorded alongside the
code (the source documents are not edited). Database-level deviations live in
[`supabase/SCHEMA_DEVIATIONS.md`](../../supabase/SCHEMA_DEVIATIONS.md). Reasoning trail:
`.grill/phase-3-auth-decisions.md`.

---

## A1 — Corporate ESG approves at `/app/approvals`

**App Flow says:** §1 — `/admin/*` is Admin only; all non-admin roles live under `/app/*`. §2.2 Approval
Queue — route `/admin/approval-queue`, access "Admin, Corporate ESG/Sustainability".

**Implemented:** `/admin/*` is strictly Admin-only (enforced by `requireAdminSession()`). The same
Approval Queue page component and the same server procedure are mounted twice: `/admin/approval-queue`
for Admin and `/app/approvals` for Corporate ESG/Sustainability. The "Approvals" item in the `/app`
sidebar is shown only to holders of `approval.decide`; approval-needed notifications for Corporate ESG
deep-link to `/app/approvals`. (The page itself is built in Phase 16.)

**Why:** §1 and §2.2 contradict each other for Corporate ESG, the primary approver. This follows
§2.2 Submission Monitoring's own precedent ("Corporate ESG/Sustainability gets an analogous but
scope-limited view under `/app`") and keeps the namespace guard free of per-route exceptions.

## A2 — Email-link handler and set-password page

**App Flow says:** §2.1 public routes are `/login` and `/forgot-password`; the reset flow continues via a
"Supabase-issued reset link back into the app … to a password-reset form".

**Implemented:** two routes implied by that sentence:

- `GET /auth/confirm` — exchanges the one-time token from invite/recovery emails for a session, then
  always redirects to `/reset-password` (no user-controlled redirect target).
- `/reset-password` — "Set your password" form (12+ characters), used both for password recovery and for
  accepting an Admin invite; on success signs out and returns to `/login` with a confirmation notice.

Also `GET /auth/signout?reason=…` — forced sign-out used when the Data Access Layer turns away a
signed-in user who is deactivated or has no profile (Server Components cannot clear cookies).

## A3 — Session checks: proxy vs. Data Access Layer

**App Flow says:** §1 — namespaces "enforced by middleware + RLS on every request".

**Implemented:** Next.js 16 renamed middleware to `proxy.ts`, and its bundled authentication guide limits
the proxy to optimistic cookie checks (no database queries). So:

- `proxy.ts` refreshes the Supabase session and redirects requests without a valid session to
  `/login?next=…` (adding `reason=expired` when a stale auth cookie was present).
- `lib/auth/session.ts` (Data Access Layer) is the authoritative per-request check in protected layouts
  and the tRPC context: verified user, `users.is_active`, active assignments, roles and permissions.
- RLS remains the data-layer guarantee.

## A4 — Users with no profile row

Not covered by App Flow. An Auth user without a `public.users` profile (only possible if provisioning
failed outside the provisioning script) is signed out and shown "Your account is not set up yet —
contact your Admin", rather than being treated as signed in.

## A5 — Phase 4 shell and Admin foundation

Decisions: `.grill/phase-4-admin-foundation-decisions.md`.

- **Navigation shows built pages only.** The sidebar lists only pages that exist in the current phase;
  later-phase entries from App Flow are added as their phases land (no dead links).
- **Deferred top-bar controls.** The organization/period context switcher and the notification bell are
  not rendered yet; they arrive with the phases that give them data.
- **Dashboard placeholders.** Admin KPI tiles show "—" labeled "Development placeholder — data arrives in
  Phase 16". Header counts (subsidiaries, projects, active users, open period) are real.
  "Organizations" in the header strip counts subsidiary/entity nodes under the group.
- **UI brief §6.10 contrast resolutions.** Theme 1 sidebar active/hover text uses `#222222` for contrast;
  Theme 3 header/sidebar text uses `#ffffff` instead of the brief's `#76757A`. Theme 2/3 values stay
  provisional until the Phase 19 contrast sweep; the theme switcher is also Phase 19.
- **Button mapping.** Secondary actions use the brief's secondary-button tokens (`outline` variant) and
  destructive/consequence actions use the important-button tokens (`destructive` variant); consequence
  modals carry the colored modal-header bar (§11.5).
- **Profile pages.** `/admin/profile` and `/app/profile` (display name, password change requiring the
  current password, which signs out other sessions).

## A6 — Phase 5 Upload Document

Decisions: `.grill/phase-5-document-ingestion-decisions.md`.

- **"Select ESG activity/category"** is one picker of metrics grouped by category (`esg_records.metric_id`
  is required). A **Project / site** picker appears only when the user can upload to more than one node
  (their assigned node or its active descendants).
- **Scope enforcement.** App Flow says "enforced by RLS"; uploads are server-issued (SCHEMA_DEVIATIONS D3),
  so the upload procedures enforce scope and category on the server and RLS still governs reads.
- **Duplicate warnings** are an inline panel with "Upload anyway" (not a modal — a warning to acknowledge,
  not a hard-to-reverse action, UI brief §15.4). Only an identical file sets `is_duplicate_flag`; an
  existing record for the same project + period + metric is a warning only.
- **After success** the user returns to the Dashboard; My Submissions arrives in Phase 6 (from Phase 6
  the user lands on My Submissions → Processing).
- **Limits and checks.** 50 MB maximum shown on the drop zone; type detected from file content;
  truncated files and password-protected PDFs are rejected at upload.

## A7 — Phase 6 OCR status, notifications and monitoring

Decisions: `.grill/phase-6-ocr-integration-decisions.md`.

- **Verify Extraction placeholder** (replaced by the real screen in Phase 7, see A8). Unknown or
  out-of-scope ids redirect to `/app` with "You don't have access to that page" (§4.4).
- **My Submissions** lists the user's own records for the open period plus older ones still in progress.
  OCR failures sit under **Needs Verification** with an "Extraction Failed" badge and the reason (§4.5);
  there is no separate Failed tab. The default tab is Needs Verification; after an upload the user lands
  on Processing. Row links open Verify Extraction only for Needs Verification rows (record detail views
  come later).
- **Live updates by polling**, not Realtime: the bell every 30 s and on window focus; My Submissions, OCR
  Monitoring and the verify placeholder every 15 s while a job is still running.
- **OCR Monitoring health banner** uses the oldest waiting job (more than 5 minutes) instead of a worker
  heartbeat, which the schema doesn't have. Retry is offered only for failed jobs whose record still
  waits for extraction, and gives the job fresh attempts.
- **Admin notifications.** The Admin top bar has the bell dropdown without "View all" (§2.3: no separate
  Admin notifications page).
- **Dashboard.** "Documents to verify" is now a real count linking to Needs Verification; "Returned for
  correction" stays a labeled placeholder until validation and approval exist.

## A8 — Phase 7 Verify Extraction

Decisions: `.grill/phase-7-ocr-verification-decisions.md`.

- **Reporting period is read-only** on Verify Extraction, shown beside the extracted billing period so a
  mismatch is visible. §0.4 calls the period "editable"; with one open period there is nothing valid to
  change it to, and moving a record into a closed period would bypass period close. Phase 8's period check
  flags a mismatch instead.
- **After Confirm** (Phase 7 only): the record showed "Validation Pending" until Phase 8 added validation
  to the Confirm transaction — see A9.
- **Invoice-number duplicates** are warned about here (acknowledged before Confirm, re-checked on the
  server) per §2.3; the flag and validation result stay in Phase 8 as the plan places them.
- **Manual exception values** are stored as `ocr_fields` under an `ocr_extractions` row marked
  `raw_output.source = "manual_exception"` (no OCR value, no confidence), so validation and lineage read
  manual and extracted values the same way. `verifications.is_manual_exception` is true and
  `ocr_extraction_id` null, as schema §9.3 specifies.
- **Re-upload a clearer copy** pre-fills Upload (`/app/upload?replaces=<documentId>`) and, when the new
  upload completes, closes the failed record as rejected with "Replaced by <file>" and links the new
  document through `documents.related_document_id`, all in the same transaction.
- **Disabled Confirm explains itself with visible helper text** rather than a hover tooltip (the brief's
  §12.2 tooltip): disabled buttons receive neither hover nor focus, so a tooltip would be unreachable.
- **Evidence bytes** are served by `/api/documents/[documentId]/file`, which re-checks the session and org
  scope on every request (private, no-store, sandboxed). No signed URL that works without a session is
  ever handed to the browser.
- **Rows in every My Submissions tab** link to `/app/verify/[documentId]`, which shows a read-only summary
  once a record is verified or rejected; a dedicated record-detail view comes later.

## A9 — Phase 8 validation

Decisions: `.grill/phase-8-validation-engine-decisions.md`.

- **Validation runs inside Confirm's transaction** (schema §20.3), so the result is known when Confirm
  returns. Instead of App Flow's "Verified — validation in progress." toast, the user is told the actual
  outcome ("Verified and validated.", "Verified — flagged for review by an Admin.", or "Verified, but
  validation found problems — the record is back with you to correct.") and lands on the matching My
  Submissions tab (Validated or Returned).
- **`validation.run` is not a client-callable endpoint.** The plan names it as a tRPC procedure "invoked
  automatically post-Confirm"; it is implemented as the engine function called inside the Confirm
  transaction, because a browser-callable "run validation" would let a client trigger lifecycle changes
  (SCHEMA_DEVIATIONS D1).
- **Hard-failed records** are shown in the Admin Validation Queue as view-only: they are already back with
  the submitter, and only the submitter's correction clears them. Accept/Return apply to flagged records,
  each with a written reason (≥ 10 characters).
- **Returned records** (hard fail or Admin return) reopen Verify Extraction with the prior confirmed
  values, the reason, the per-category validation result and a validation message on each failing field
  (§4.8). Re-confirming writes a new `verifications` row ("Re-verified after return") and re-runs
  validation from the top.
- **Notifications:** `returned` to the submitter (hard fail or Admin return), `validation_review` to every
  active Admin (flag). The Admin bell deep-links to the Validation Queue.
- **The plan's "one module per rule category"** is one module (`lib/validation/checks.ts`) with one section
  per category, plus the engine (`lib/validation/engine.ts`); the checks are small pure functions and are
  unit-tested together.
- **Dashboard "Returned for correction"** is now a real count linking to the Returned tab.

## A10 — Approval pulled forward into Phase 8

Decisions: `.grill/phase-8-validation-engine-decisions.md` (2026-09-19).

- **The single approval step (App Flow §4.9) is built in Phase 8**, not Phase 16, so verified records can
  reach Approved. A validated record goes straight to Pending Approval; the Confirm toast says "Verified
  and validated — sent for approval." and lands on that tab. Flagged records land on Validated until an
  Admin accepts them, then go to Pending Approval.
- **Approvers:** non-Admin holders of `approval.decide` whose scope covers the project use `/app/approvals`
  (sidebar "Approvals"); Admins use `/admin/approval-queue`. Both show the same table and 720px drawer
  (submitter, verifier, verified values, validation result, the document) with Approve / Return (reason
  ≥ 10 characters). Whoever submitted or verified a record cannot decide on it.
- **Calculation trace in the approval drawer is a labeled development placeholder** until Phase 9;
  Phase 9 decides whether approval must wait for a calculation.
- Multi-level approval chains and the Control Tower's approval cards stay in Phase 16.

## A11 — Phase 9 calculation

Decisions: `.grill/phase-9-calculation-engine-decisions.md`.

- **Calculation runs when a record enters the approval queue** (inside Confirm's transaction, and on an
  Admin's Accept of a flagged record), so the approval drawer shows the real trace instead of the Phase 8
  placeholder.
- **A missing factor blocks the number, not the queue.** The record still appears under Pending Approval
  with "Not calculated yet" and the reason; Approve is disabled and says why, Return stays available, and
  Admins are notified once per reason (`calculation_blocked`, deep-linking to Conversion Factors). An
  Admin with `factor.manage` gets a "Run calculation" button in the drawer.
- **The calculation trace is shown to the submitter** on their own record (App Flow only promises it to
  reviewers and the drill-down), because the number is derived from their evidence.
- **Recalculation is explicit and pre-approval only.** Approved records are closed; nothing recalculates
  automatically when a factor changes.
- **Conversion Factors is an Admin-area page only** (`/admin/conversion-factors`), gated on
  `factor.manage`. If that permission is ever granted to another role, an `/app` mirror follows, as
  Approvals did.

## A12 — Phase 10 Scope 1

Decisions: `.grill/phase-10-scope-1-decisions.md`.

- **No placeholder conversion factors**, although the Phase 10 plan permits clearly-marked ones. Phase 9's
  rule stands: an Admin enters each factor with the source they verified it against, and the dashboard
  shows an honest empty state until then.
- **The headline total counts approved records only**, with "awaiting approval" and "N verified records
  have no calculation yet" beside it, so an unreviewed number never reads as reportable and the gaps stay
  visible. The App Flow says "totals by org level" without saying which records count.
- **Totals are grouped by result unit and never mixed**; a kilogram unit also shows the tonne figure
  (arithmetic, not a factor).
- **The chart view is inline SVG** built from the brief's chart tokens — no charting dependency — and the
  table is the default, per the brief's warning against chart-first dashboards.
- **Drilling ends at the evidence**: org level → … → contributing records → a drawer with the calculation
  trace and the original document. The App Flow leaves the record level to Phase 17's drill-down; doing it
  here proves the whole lineage chain now.
- **Non-admins see their own project's Scope 1 total** on their dashboard (`scope.myTotal`, limited to
  their assignments). `/admin/scope-1` itself stays Admin-only as specified.

## A13 — Phase 11 Scope 2

Decisions: `.grill/phase-11-scope-2-decisions.md`.

- **Renewable electricity is its own activity**, not a factor chosen from the verified grid/renewable
  classification. PRD §21 asks the system to distinguish them; doing it by metric keeps factor selection
  out of user-typed values and needs no engine change. Grid's `source_classification` field stays
  optional and informational.
- **A conversion factor may be exactly zero** (market-based renewable treatment). The source reference is
  still required and negative values are still refused.
- **The scope dashboards also break totals down by activity**, which the App Flow doesn't specify — it is
  the next question any reviewer asks, and Scope 3's categories will need it.
- **The user dashboard lists every scope their project has data for**, in one card, instead of the
  Scope 1-only card Phase 10 added.
- `/admin/scope-2` is the Phase 10 component with a different scope code; no new procedure was added.

## A14 — Phase 12 Scope 3

Decisions: `.grill/phase-12-scope-3-decisions.md`.

- **Scope 3's categories are rows under the `SCOPE_3` scope**, ten candidates seeded inactive and two
  (waste, business travel) activated, so the dashboard's "X of Y categories active" is a true statement
  and enabling another is configuration. `scope.getTotal` now rolls a scope up through its children, which
  is why Scope 3 needed no new procedure.
- **The Scope 3 page leads with the category table** — active categories with their totals, the rest
  labelled "Not enabled" — above the activity, org-unit and record sections the other scopes show.
- **Each Scope 3 category belongs to the role that owns its evidence** (waste → EHS, business travel →
  Finance/CSR) through `esg_categories.owning_role_id`, so a Project Manager is not offered them.
- **The user dashboard lists every configured scope** rather than a fixed pair, so a new scope or category
  appears without a code change.
- **Business travel is spend-based** (invoice amount × kgCO2e per rupee), because ticket invoices print an
  amount and almost never a distance. The OCR extractor learned the extra label spellings (certificate
  number, disposal date, treatment route, mode) and the weight and currency units; `EXTRACTOR_VERSION` is
  now `rules-2`.
