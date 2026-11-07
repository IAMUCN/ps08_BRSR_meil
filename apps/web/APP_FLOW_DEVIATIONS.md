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

## A15 — Phase 13 role-specific modules

Decisions: `.grill/phase-13-role-modules-decisions.md`.

- **Journey 3's category is "Workforce" and its activity "Employees by gender"** rather than "Employee
  Headcount": the metric a headcount statement feeds is the gender share BRSR asks for, and the category
  name covers training records too.
- **The calculation trace lists every input of a multi-input formula** (e.g. Total employees 180 count,
  Women 42 count, Women ÷ Total employees × 100 → 23.33 %) instead of "Verified value → Normalised → Factor",
  which has no meaning for a percentage. Same component, same places (verify summary, approval drawer,
  scope drill-down).
- **No module dashboards yet.** HR, EHS, Procurement and Finance/CSR results appear on the verify summary
  and in the approval queue; Master Approach §44 step 19's per-project module view belongs to the Control
  Tower (Phase 16).
- **CSR expenditure and fines are recorded, not calculated**: they reach the approval queue with no trace
  and Approve is available, because no calculation is required for them.

## A16 — Phase 14 BRSR mapping

Decisions: `.grill/phase-14-brsr-mapping-decisions.md`.

- **The readiness tree is a "Readiness" tab on `/admin/brsr-mapping`**, beside the "Mappings" tab, for a
  chosen period and the whole organisation. The App Flow has no separate readiness route; the Control
  Tower's Readiness % card (Phase 16) will link here.
- **Status rule:** Complete when every applicable mapped metric has an approved record in the period,
  Partial when some do, Missing evidence when none do. Records awaiting approval are listed but don't count.
- **Applicability is a flag on the mapping** (schema deviation D15), switched in the edit sheet; a mapping
  marked not applicable stays listed and is ignored by readiness.
- **The indicator catalogue is seeded configuration**, not edited on this page — the page maintains
  metric-to-indicator mappings, which is what the App Flow's primary actions describe.
- The tree's record level opens a drawer with the calculation trace and the original document, the same
  drawer the scope dashboards use.

## A17 — Phase 16 Admin Control Tower

Decisions: `.grill/phase-16-control-tower-decisions.md`.

- **Every issue row and most KPI cards land on Submission Monitoring**, filtered to exactly the records the
  number counted (same SQL predicate for the count and the list), with a link on to the owning queue (OCR
  Monitoring, Validation Queue, Approval Queue) for action. The queues themselves have no org/period
  filters, so linking straight to them would show a different set than the number said. Scope cards open
  the scope dashboards and BRSR Readiness the readiness tab, both carrying the context.
- **The org/period context switcher sits in the Control Tower header**, not the global top bar, and is
  carried in the URL into Submission Monitoring and the Data Explorer. Other admin pages keep their own
  pickers.
- **Expected submissions are edited on the Organization page's node panel** ("Expected submissions"),
  which the App Flow doesn't list — the denominator of the completion KPIs had to live somewhere, and it is
  a property of the node.
- **Submission Monitoring's "role" filter is the role that owns the metric's category**, not the
  submitter's role assignment, and "export filtered list" is a CSV built from the rows on screen (newest
  500).
- **A new status filter, "Not yet passed validation"**, is the exact gap behind Validation Completion %.
- The shared record detail (Submission Monitoring, Data Explorer) shows extracted values, validation,
  calculation, the document and the record's audit trail; acting on the record stays in its queue.
- The BRSR Readiness card's "i" opens a popover listing each component, its value and weight, and says it
  is an internal indicator, not an official score.

## A18 — Phase 17 Reporting

Decisions: `.grill/phase-17-reporting-decisions.md`.

- **One report type, BRSR**, covering an org node and either one period or an April–March financial year
  (the App Flow's "format" parameter is not offered); approved records only, with the number left out for
  awaiting approval stated on the report.
- **"Report ready" navigates only on request**: generation is non-blocking, the Reports page refreshes while a
  run is in progress and the Admin is notified with a link to Report Detail, rather than being moved there.
- **The drill-down opens in a side panel** with the path as a breadcrumb (value → indicator → metric →
  calculation → verified activity data → original document) and shows the exact calculation the report used,
  saying so when the record has been recalculated since.
- **A mapping says which value it reports** (Mappings tab, schema deviation D18): the calculated result or the
  verified quantity — P6-E8 reports the waste quantity, P6-L4 its emissions.
- Comparing against a prior period's report (App Flow secondary action) is not built.

## A19 — Phase 19 UI polish and responsive behavior

Decisions: `.grill/phase-19-ui-polish-decisions.md`.

- **Colour tokens that failed WCAG AA for their role were adjusted** (UI brief §17 over §6's supplied values,
  owner's decision). Each moved to the nearest passing shade of the same hue; the supplied colours keep their
  brand uses (sidebar, header, primary buttons, badges). Ratios are the worst case across the backgrounds the
  token is used on:

  | Theme | Token (role)                                  | Supplied         | Now                              | Needs |
  | ----- | --------------------------------------------- | ---------------- | -------------------------------- | ----- |
  | 1     | status-success (text)                         | `#1E8E5A` 3.33:1 | `#19764B` 4.52:1                 | 4.5:1 |
  | 1     | status-warning (text)                         | `#B8860B` 2.62:1 | `#846008` 4.62:1                 | 4.5:1 |
  | 1     | status-error (text)                           | `#D92D20` 3.89:1 | `#C5291D` 4.55:1                 | 4.5:1 |
  | 1     | link text, BRSR heading, KPI title            | `#CA2851` 4.29:1 | `#C4274F` 4.50:1                 | 4.5:1 |
  | 1     | input border                                  | `#FFE3B3` 1.18:1 | `#9E8D6F` 3.07:1                 | 3:1   |
  | 1     | scope-2                                       | `#FF6766` 2.84:1 | `#F76463` 3.02:1                 | 3:1   |
  | 1     | scope-3                                       | `#FFB173` 1.78:1 | `#C28757` 3.04:1                 | 3:1   |
  | 2     | status colours                                | as Theme 1       | as Theme 1 (e.g. warning 5.26:1) | 4.5:1 |
  | 2     | sidebar active, important button (white text) | `#EF102D` 4.39:1 | `#EA102C` 4.56:1                 | 4.5:1 |
  | 2     | input border                                  | `#DDDDDD` 1.25:1 | `#8D8D8D` 3.04:1                 | 3:1   |
  | 3     | muted text, KPI title                         | `#76757A` 2.26:1 | `#ADACAF` 4.56:1                 | 4.5:1 |
  | 3     | link text (new `--primary-text`)              | `#550916` 1.01:1 | `#C2A6AB` 4.58:1                 | 4.5:1 |
  | 3     | status-success                                | `#1E8E5A` 2.49:1 | `#76BA9A` 4.54:1                 | 4.5:1 |
  | 3     | status-warning                                | `#B8860B` 3.17:1 | `#CCA84F` 4.56:1                 | 4.5:1 |
  | 3     | status-error                                  | `#D92D20` 2.13:1 | `#EC948D` 4.51:1                 | 4.5:1 |
  | 3     | focus ring                                    | `#550916` 1.01:1 | `#A88288` 3.05:1                 | 3:1   |
  | 3     | input border                                  | `#5E5453` 1.98:1 | `#797170` 3.05:1                 | 3:1   |
  | 3     | scope-2                                       | `#550916` 1.01:1 | `#96666F` 3.06:1                 | 3:1   |
  | 3     | scope-3                                       | `#5E5453` 1.98:1 | `#797170` 3.05:1                 | 3:1   |

  Consequences: §6.9's status colours are no longer one shared set (the two light themes share one, Theme 3
  has its own), and a new `--primary-text` token carries primary-coloured text and icons, because Theme 3's
  burgundy works as a button fill but not as text.

- **The theme is saved on the account** (`users.theme`, schema deviation D20) with a localStorage copy that a
  tiny script applies before first paint; the signed-in shell then re-applies the account's value. The
  switcher is labelled Warm / Corporate / Dark rather than Theme 1 / 2 / 3.
- **The top bar now uses the §6.2 header tokens** (raspberry in Theme 1) instead of the card surface.
- **Below 1280px the sidebar is an icon rail** with a toggle that opens it over the page (Escape or a click
  outside closes it). The brief's "expandable on hover/click" is click only; phones get the same rail.
- **Profile's "Save" (display name) is an outline button**, so "Change password" is the one primary action
  (§18 rule 1).
- **Scope 1/2/3 use the §6.11 icons** (flame, zap, link-2) in the sidebar and on their dashboards.
- **An unknown or malformed id in a URL** (a report, a record's audit history) shows "Page not found", not
  the server-error message.
- **An action on an expired session** (App Flow §3, §4.3) goes to sign-in with "Your session expired" and
  back to the same page afterwards; the proxy no longer redirects Server Action requests itself.

## A20 — Bulk import (employees, org units)

Decisions: `.grill/bulk-import-decisions.md`. Not in any implementation-plan phase — requested directly by
the owner mid-session.

- **Two new pages under `/app`**, permission-gated rather than role-gated: `/app/users/bulk-import`
  (`user.bulk_import`) and `/app/org-units/bulk-import` (`org.bulk_import`), appearing in the sidebar only
  for whoever an Admin has granted the permission to (same pattern as A1's Approvals item). Both also embed
  inline on their Admin equivalents (`/admin/users`, `/admin/organization`'s node panel) — an Admin always
  has both permissions, no separate Admin-only screen was built.
- **A downloadable `.xlsx` template** for each: Employee ID / Name / Email / Role / Organization Scope, and
  Code / Name / Type for org units, each with a second "Valid codes" reference sheet (no dropdown
  validation — SheetJS's free `xlsx` package can't write that).
- **Results, not a redirect**: each row's outcome (created/failed, and for employees whether its password
  email actually sent) shows in a table on the same page, downloadable as CSV.

## A21 — Theme switcher moved to the top bar; default changed

Decisions: `.grill/theme-toggle-decisions.md`.

- **The theme switcher moved from Profile to the top bar** (a compact 3-swatch toggle, `components/shell/
theme-toggle.tsx`), present in both the `/app` and `/admin` shells. Profile's "Appearance" section is
  removed.
- **The default theme changed from Warm (`theme-1`) to Corporate (`theme-2`)** — schema deviation D23.
  Labels changed accordingly: Corporate is now marked "Default", Warm is relabelled "Special", Dark is
  unchanged. A19's "labelled Warm / Corporate / Dark" note still holds for the names; only which one is
  the default, and where the picker lives, changed.

## A22 — Password composition rules + live strength meter

Decisions: `.grill/password-policy-decisions.md`. Supersedes Phase 3's "12 characters, no composition
rules" (NIST SP 800-63B) — the owner explicitly asked for composition rules and a live meter.

- **Every password-entry screen** (`/reset-password`, `/forgot-password`'s OTP step, Profile's
  change-password form) now shows a live strength bar plus a checklist of the 5 rules
  (`lib/auth/password-policy.ts`: 12+ characters, uppercase, lowercase, number, special character), each
  turning green with a check as it's met. The server re-checks the same rules on every setter — the meter
  can never be more lenient than what actually saves.
- **The bulk-import default-password generator was hardened to match**: a one-letter name or an
  all-letters employee ID could otherwise produce a password missing a required character class.

## A23 — A PDF with several bills

Decisions: `.grill/multi-bill-pdf-decisions.md`. Not in any implementation-plan phase — requested directly by the
owner.

- **Upload Document** opens with a choice: _One bill_ (unchanged) or _A PDF with several bills_. The second hides the
  activity picker, accepts PDF only (up to 20 pages) and, after upload, goes to the new split page.
- **`/app/upload/split/[documentId]`** is a new screen (an addition to App Flow §2.3, which has one document per
  upload). While the OCR reads the PDF it says so and refreshes itself; then it shows the PDF beside the proposed
  bills — pages, what each looks like, the activity — which the uploader can edit, leave out, remove or add to, with
  the rules checked as they type. _Record N bills_ creates one record per kept bill and goes to My Submissions;
  possible duplicates must be acknowledged. Afterwards the page lists the recorded bills with links to verify them.
- A bill the uploader's role may not record (water for a Project Manager) is shown, said to be left out, and not
  offered in the activity list. The notification "PDF ready to split" deep-links to the page.

## A24 — Reports: SEBI-format tables and the yearly inputs form

Decisions: `.grill/audit-p0-decisions.md` (audit fixes P0-2 and P0-3).

- **The BRSR report PDF** prints greenhouse gas emissions, waste and Scope 3 as the July-2023 SEBI tables: current
  and previous financial year, metric tonnes, intensity rows and the assurance note, followed by a methodology,
  boundary and factor-source section. Indicator codes follow the July-2023 numbering (`A-20`, `P6-E7`, …).
- **Admin → Reports** gains a collapsed section, _Turnover, PPP rate and assurance for the report_: one set of
  values per financial year, saved with an outline button (the page keeps one primary button). An addition to
  App Flow §2.2, which has only the parameter form. Built plainly by the feature role
  (`app/admin/reports/report-inputs-form.tsx`); the ui role may restyle it.
- Anything not entered prints as "Not provided"; a single-period report shows no annual intensity.

## A25 — Hierarchy levels section; evidence files list

Decisions: `.grill/audit-p2-decisions.md` (audit fixes P2).

- **Admin → Organization** gains a collapsed section, _Hierarchy levels_: the levels in order, each renameable,
  removable when no org unit uses it, and a form to add a level after an existing one. An addition to App Flow
  §2.2 (Organization), which treats the levels as fixed. Every screen that names a level reads the configured name.
- **Verify Extraction and the record drawer** gain an _Evidence files_ list: the original document and any
  supporting files, each opening in a new tab, and an _Add a supporting file_ button for whoever could have
  uploaded the record, until it is approved or rejected. An addition to App Flow §2.3, which has one document per
  record on screen.
- Both are plain sections built by the feature role (`app/admin/organization/levels-card.tsx`,
  `components/records/evidence-files.tsx`); the ui role may restyle them. Outline buttons only — each page keeps
  one primary button.

## A26 — Factor screen: gases covered and rename; fuller report tables

Decisions: `.grill/audit-2-decisions.md` (second audit).

- **Admin → Conversion Factors:** the add / new-version sheet gains an optional _Gases covered_ field; the version
  history shows it and lets an Admin set it on an existing version; each factor has a _Rename_ button. The two
  edits use the browser's own prompt — one line of text each. Built plainly by the feature role; the ui role
  may replace the prompts with a dialog.
- **The BRSR report** gains: a break-up by gas under each scope total, a _Scope 1 by emission source_ table,
  SEBI's full waste table (categories A to H, recovered and disposed by operation), a _Consolidation by org
  unit_ table, and a line saying which days of the financial year the report covers when it is not the whole
  year. Additions to App Flow §2.2 (Reports), which describes the report only as "BRSR format".
- **Notifications:** a _Deadline approaching_ notice within three days of an open period's closing date.

## A27 — Upload stays on Upload; My Submissions lists PDFs waiting for their split

Decisions: `.grill/page-feedback-2026-10-09-decisions.md` (owner's page feedback).

- **App Flow §2.3 (Upload Document)** sends the user to My Submissions → Processing after an upload. The owner
  uploads several bills in a row, so the form now stays, shows a "received" notice with a link, and keeps the
  project and activity. Replacing a failed document still returns to My Submissions.
- **My Submissions** gains a section above the tabs for multi-bill PDFs whose split is not confirmed; each row
  opens its split screen. The whole of a submission row is clickable.
- **Profile** links to the emailed-code password reset under Change password.
- The upload progress display is more animated (UI brief §12.1 asks for a progress bar, filename and cancel —
  all kept).

## A28 — BRSR Disclosures screen; the report prints the whole format

Decisions: `.grill/full-brsr-report-decisions.md`.

- **New Admin screen, BRSR Disclosures** (`/admin/disclosures`, in the sidebar after BRSR Mapping): every
  question of SEBI's format by section, with a text box per question for one financial year. Not in App Flow
  §2.2. Built plainly by the feature role (native `details` sections, one Save per question); the ui role may
  restyle it.
- **Typed entry, for written statements only.** The Master Approach keeps normal users to uploads; this screen
  is for an Admin and for answers that have no source document.
- **The BRSR report** prints all of Sections A, B and C in SEBI's order and all 17 SDGs. Report Detail keeps
  listing only the measured indicators (the drill-down is for values).

## A29 — Reports history and evidence pages, KPI trends, reminders, mapping page sections

Decisions: `.grill/page-feedback-2026-10-09-decisions.md`, `.grill/grand-finale-deliverables-decisions.md`.

- **Reports** gains two buttons and two pages not in App Flow §2.2: _Past reports_ (`/admin/reports/history`)
  and _Evidence for the financial year_ (`/admin/reports/evidence`). The Reports page lists the latest five
  runs and warns how many written disclosures are unanswered.
- **Control Tower** gains a _KPI trends by financial year_ card below the issue panel.
- **Submission Monitoring**, missing-submissions view, gains a _Send reminders_ button.
- **BRSR Mapping** always shows Sections A, B and C, Section C grouped by principle, and lists each section's
  written questions with their answered state.
- **Organization:** expected submissions are grouped under Scope 1, 2, 3 and Other disclosures.
- **Sidebar:** Roles & Permissions before Users. All built plainly by the feature role; the ui role may restyle.

## A30 — Side panels dock on wide screens; Organization page in three columns

Decision: `.grill/page-feedback-2026-10-09-decisions.md` (owner's page feedback).

- **Every side panel** (record drawer, approval and validation drawers, the add / edit sheets — all built on
  `components/ui/sheet.tsx`): on a screen 1900px wide or more, a right-hand panel docks into the empty space
  beside the page, below the top bar, with no backdrop, and the page stays usable. An _Expand_ button opens it
  full size over the page; _Dock_ returns it. On narrower screens panels open over the page as the UI brief
  (§11) describes. The panel is non-modal in both views, so focus is not trapped inside the full-size view.
- **Organization** is three columns on wide screens: the tree (kept in view while scrolling), the selected
  unit, and the cards for adding units under it. "Child node" is worded as "unit under {name}"; the expected
  submissions card names the unit it applies to.

## A31 — Organization: add forms in a side panel; expected submissions saved with a button

Decision: `.grill/page-feedback-2026-10-09-decisions.md` (owner's page feedback, 2026-10-10). Replaces the
three-column layout in A30.

- **Adding units:** two buttons above the page, _Add a unit_ and _Add from a spreadsheet_; the form opens in
  the side panel (docked on wide screens, where the page makes room for it) and is not shown otherwise.
- **One tile for the selected unit:** its name and code, then its expected submissions.
- **Expected submissions** are no longer written tick by tick: _Save expected submissions_ writes the changed
  ticks, _Clear all_ unticks every box (still needs Save), and the number of unsaved changes is shown.

## A32 — ESG data analyst: a chat panel on every signed-in page

Decision: `.grill/chat-analyst-decisions.md` (owner's request, 2026-10-11). `03_APP_FLOW.md` and the UI brief
have no chatbot. Overview: `CHATBOT.md`.

- **Entry points:** an _Ask_ button in the top bar of both shells and a round button at the bottom right of
  the page. Both open the same side panel (`components/ui/sheet.tsx`, so it docks on wide screens). Neither
  is shown when the chatbot is not configured, or to a person whose role lacks the `chat.use` permission
  (every existing role holds it; an Admin changes that on Roles & Permissions).
- **The panel:** example questions, the conversation, a question box (Enter sends), _New conversation_ and
  _Saved_. An answer is the model's wording as plain text, then figures, tables and charts built by the server,
  a line saying which org unit, period and record statuses it covers, and the date it was produced.
- **Charts** are drawn by the app (bars and an SVG line); the app has no charting library.
- **Read-only:** nothing can be changed from the panel. Asked for the official BRSR report, it points to
  Admin → Reports.
- **Saved conversations** are private to their owner, kept 90 days, deletable. Admins see one audit entry
  per question (`chat.question_answered`) without the question's text.
- **One primary button per page (UI brief §18):** the panel's Send button and the floating button are not
  styled as primary buttons.
- **A docked pane, not an overlay (amended 2026-10-11, owner's request: "like Copilot in Edge").** On a screen
  1024px or wider the pane sits at the right, full height, 420px wide; the page narrows to make room, there
  is no backdrop and the page stays usable. It stays open from page to page and after a reload (remembered in
  the browser), and closes with its Close button, Escape or the top-bar button. Below 1024px it covers the
  screen. It no longer uses `components/ui/sheet.tsx`. The model is also told which page is open, chosen
  from a fixed list by the server.

## A33 — Bulk import: a whole branch of org units from one sheet; templates that show the hierarchy

Decision: `.grill/bulk-import-decisions.md` (owner's request, 2026-10-11). Amends A20, which created direct
children of one chosen unit only.

- **Org units:** columns Code, Name, Level, Parent code. A row with no parent code goes under the unit chosen
  on screen; a row with one goes under that org unit — existing, or another row — so one sheet builds
  several levels. Rows are created parents-first; each row still succeeds or fails by itself and the results
  list says why.
- **Both templates:** the first sheet has headings only (styled, kept in view), a "How to fill in" sheet
  carries the instructions and example, and a reference sheet lists levels and existing org units as the
  hierarchy stands at download, each unit indented under its parent.
- **Preview** on screen shows the level's name and the parent each row will sit under.

## A34 — Reports for a custom period; the chatbot opens the Reports page and, for an Admin, answers about people

**App Flow §2.2 / §4.10:** a report is generated for a period and an org scope. **A32:** the chatbot knows
nothing about people and only points to Admin → Reports.

**Now (owner's request, 2026-10-11; `.grill/chat-admin-access-decisions.md`):**

- **Reports → Covering** has a third choice, _Custom period_, with a From period and a To period. The report
  covers every reporting period between them and is named by its dates. It is built like a single-period
  report: no previous-year column, no turnover or intensity.
- **The Reports page reads a selection from its address** (`org`, and `period`, `fy` or `from` + `to`); a
  value that is not on the form's lists is ignored.
- **The chatbot, for an Admin,** has three more lookups: people (name, email, employee id, roles, org units),
  individual records with who submitted and approved them, and "open the Reports page" — the answer carries
  a link and the panel goes there at once with the org unit and period selected. Nothing is generated until
  the person presses the button.
- **For everyone else** those three do not exist; their chatbot is unchanged.

## A35 — Organization: a unit under several parents, more than one group, delete; the chat pane's header

**App Flow:** §2.2 Organization is one tree under one root; a unit is deactivated, never deleted.

**Now (owner's page feedback, 2026-10-11; `.grill/shared-org-units-decisions.md`, D36):**

- **Also under another parent.** A unit below group level can be placed under further parents. It is drawn
  under each, marked "Shared" where the parent is not its main one; both parents' people see it; its figures
  count in full in each parent and once in the group above them.
- **A new group.** Add a unit offers "On its own, as a new group": a separate tree, managed by the same
  Admins.
- **Delete this unit** removes an unused unit and the units under it after the word `delete` is typed; the
  dialog says what stands in the way when it has been used. Deactivating a unit with units under it asks for
  the word `deactivate`.
- **Bulk import** has an Also under column for the other parents of a shared unit.
- **Chat pane:** a coloured header bar as tall as the top bar, a one-line question box that grows, and the
  suggested questions at the foot of the pane.

## A36 — Invite user emails a temporary password (2026-10-12, owner's page feedback)

App Flow has an invited person set their own password from an emailed link. That link was sent by Supabase
Auth's own email service, which on the hosted project only reaches the Supabase team. **Invite user** now works
like bulk import: the account is created with a random temporary password, emailed through the app's own SMTP
sender (Brevo). Decisions: `.grill/invite-smtp-decisions.md`.

- **Invited** on the Users page now means "has never signed in" (it was "has not followed the link"), so
  bulk-imported accounts show it too until their first sign-in.
- **Resend email** sets a new temporary password and emails it; refused once the person has signed in.
- If the email cannot be sent the account still exists and the Admin is told why; the password is not shown.
- **The first sign-in must change the password.** After signing in with the temporary password, the sign-in
  page shows "Choose a new password" and no page or procedure opens until it is set; the person then continues
  signed in. Applies to Invite user, Resend email and bulk import from this change on.
- **Deleting a user** (same day, owner's report): refused only when the records name the person
  (submissions, uploads, verifications, approvals, reports, roles given to others, configuration changes),
  and the message counts what stands in the way. Notifications, reset codes and chat history go with the
  account. If the audit log names them, their profile row is kept hidden without the email address, so the
  history still shows who acted and the address can be invited again.
- **Expected submissions roll up on the Organization page** (same day, owner's request): what a unit below
  must submit is shown as expected on every unit above it, naming the unit it comes from. It is read from
  the hierarchy, not stored on the parent, so the Control Tower's figures (which already counted it there)
  do not change. Nothing is passed down.
- **Roles & Permissions has Edit role** (same day, owner's request): the name and description of any role,
  system roles included, can be changed; the code never changes (assignments, import sheets and the app's own
  rules refer to it), and the Admin role keeps every permission whatever it is called. Audited as
  `role.updated`.

## A37 — Super Admins and scoped Administrators (2026-10-13, owner's decision)

`03_APP_FLOW.md` §1 gives `/admin` to one Admin role and `/app` to everyone else, and §2.3 says the Admin
does not upload. The owner changed both (`.grill/scoped-admin-onboarding-decisions.md`, D41).

- **`/admin` is for administrators.** A Super Admin (the old Admin role, at most two people) sees all of it.
  An Administrator, assigned at any org unit, sees the pages about their own units — Dashboard, Submission
  Monitoring, the two queues, Scope 1/2/3, Data Explorer, Reports, Organization, Users — limited to that
  unit and everything beneath it. Group-wide configuration (conversion factors, BRSR mapping and
  disclosures, roles, reporting periods, hierarchy levels, yearly report inputs, the audit trail) and the
  pages not yet reviewed for scoping (OCR Monitoring, Reporting Deadlines, Forecast, Simulator, Carbon
  credits) stay with the Super Admin; an Administrator who opens one is sent back to their dashboard.
- **Roles are handed out downwards.** A Super Admin: any role anywhere. An Administrator: operational roles
  at their own units and beneath, the Administrator role only beneath (never a peer at their own level),
  never Super Admin. A whole account (deactivate, reactivate, delete, re-invite) can be changed only by
  someone who could take away every role it holds. Holding `user.manage` or `org.manage` without an
  administrator role no longer opens anything outside one's own assignments.
- **The Organization page** shows an Administrator their branch and, by name only, the units above it. Their
  own unit takes new units and expected submissions; its name, parent and status are changed from above.
- **Administrators upload** (Upload and My Uploads in the admin sidebar, the same screens as everyone
  else): any activity, whichever role owns it, for any unit they administer.
- **Approval:** still nobody decides on a record they submitted or verified — except a Super Admin, who has
  nobody above them. That decision carries a note in the audit trail and the flag
  `same_person_as_submitter_or_verifier`. `/app` no longer sends an administrator away; its dashboard does.

## A38 — Invitation links replace emailed passwords (2026-10-13, owner's decision)

Supersedes the emailed temporary password of A36 for every new account. Decisions:
`.grill/scoped-admin-onboarding-decisions.md`; D42.

- **Invite user** and **bulk import** create the account and email a link (`/invite#token`). No password is
  created for the person, shown on a screen or emailed. The bulk-import results no longer have a password
  column.
- **`/invite`** (public, new): checks the link, shows "Enter new password" and "Confirm new password", and on
  submit sets the password and uses the link up in one transaction. The person is then sent to the ordinary
  sign-in page; the link signs nobody in. A link that is unknown, used, revoked, expired or belongs to a
  deactivated account gets one message.
- **Users**: an invited account shows where its link stands (valid until, expired, revoked, none). The side
  panel has **Resend invitation** (a new link; the earlier one stops working) and **Revoke link**. Both are
  refused once the person has set the account up, and follow the same scope rule as deactivating an account
  (A37).
- **Forgot password** sends no code to an account that was never set up.
- Accounts that already hold an emailed temporary password keep the forced-change screen of A36 until an
  administrator sends them a link.
- Audit events: `user.invited` and `user.invite_resent` (with the validity, never the token),
  `user.invite_revoked`, `user.invitation_accepted` (in the person's own name).

## A39 — Sessions end by themselves (2026-10-13, owner's decision)

03_APP_FLOW §4.3 describes an expired session but sets no limit. Decisions:
`.grill/scoped-admin-onboarding-decisions.md`; D43.

- A sign-in ends after 3 hours without activity and 12 hours after it started. Closing the browser does not
  end it.
- Activity is what the person does on the page; the notification bell and refreshing lists do not count.
- Five minutes before the end a notice appears at the top of the page: for the idle limit with **Stay
  signed in**, for the 12-hour limit with the time only.
- When it has ended, an open page goes to sign-in ("Your session expired") and comes back to the same page
  afterwards; a procedure call is refused as for any expired session (§4.3).
- Only that device is signed out. Log out still ends every device.

## A40 — Owner's feedback of 2026-11-01

A closed period refuses new uploads, new evidence and confirming a multi-bill split; records already uploaded still
finish review. Opening a period past its deadline needs a new close date. Someone with status Invited can have their
name and email corrected (Manage panel); a changed email replaces the link. Organization: name and code are behind
an Edit button, Expected Submissions has a tree selector, a selected shared unit is highlighted under every parent.
Submission Monitoring and the Data Explorer choose the org unit from the same tree. The bell checks every 5 seconds
while the tab is visible, shows pop-ups and has Mark all read. `.grill/org-tree-users-notifications-periods-decisions.md`.

## A41 — One device per account, permission names, show/hide password (2026-11-07)

Sign-in on a second device asks "This account is signed in on another device" (a dialog, and the same choice on the
page itself, which also works without JavaScript); Sign out there and continue ends the other sign-in, Cancel signs in
nowhere. The other device goes to sign-in with "You were signed out because this account signed in on another
device at <time>" (shown for 24 hours; the browser keeps an `emeilsg-sign-in` cookie holding only the session id
for this). A Super Admin whose account takes over a sign-in is emailed. Roles & Permissions shows the 20 approved
permission names instead of codes (`lib/roles/permission-labels.ts`); the Audit Trail keeps codes. The eye button
is on forgot-password, reset-password and Profile's password fields. `.grill/feature-enhancement-roadmap-decisions.md`.
