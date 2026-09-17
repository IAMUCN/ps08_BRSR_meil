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

- **Verify Extraction placeholder.** Notifications already store the final `/app/verify/{documentId}`
  link. Until Phase 7 that route shows the document's real OCR status (failure reason, fields found, fields
  needing attention), labeled a development placeholder. Unknown or out-of-scope ids redirect to `/app`
  with "You don't have access to that page" (§4.4).
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
