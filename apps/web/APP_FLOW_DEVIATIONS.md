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
