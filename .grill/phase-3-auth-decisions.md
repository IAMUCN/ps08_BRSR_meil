# Grill: Phase 3 — Authentication and authorization decisions
Date: 2026-09-17

## Intent
Build Phase 3 of `06_IMPLEMENTATION_PLAN.md` — real login, session handling, role/org-scope resolution and route guards — consistent with the Phase 2 server-only write model, without inventing product requirements.

## Constraints
- Server-only writes (Phase 2 D1–D3) — no client writes to lifecycle, configuration or identity tables.
- Synthetic data only until Phase 18; no real MEIL users until custom SMTP exists.
- Next.js 16: `middleware` is renamed `proxy` (Node runtime); bundled docs say proxy does optimistic cookie checks only, security checks live in a Data Access Layer.

## Key decisions
- Decision: **Admin-provisioned accounts only; self sign-up disabled** (`enable_signup = false`, local and hosted). Accounts are created only by server-side service-role code that creates the Auth user, the `public.users` profile row (Admin supplies `display_name`) and the role/scope assignment in one audited operation. Reason: App Flow has no sign-up page; Supabase allows public sign-up by default via the public anon key. Alternative considered: self sign-up with profile creation at first login — rejected (unapproved-account path; no source for `display_name`).
- Decision: **Deactivation cuts access at all three layers.** (1) Auth: the Phase 4 deactivate procedure bans the Supabase Auth user (revokes sessions, refresh fails); banned sign-in maps to App Flow's "account deactivated" message. (2) Database: migration `0010` makes `is_admin()` and `my_org_unit_ids()` count only assignments of users with `is_active = true`, so an unexpired token reads nothing (schema deviation D9). (3) App: the Data Access Layer checks `is_active` on every protected request. Reactivation reverses all three. Alternative considered: login + middleware check only — rejected (a still-valid token keeps reading via the data API).
- Decision: **Corporate ESG approves at `/app/approvals`**, same page component and server procedure as `/admin/approval-queue`; `/admin/*` stays strictly Admin-only; the Approvals nav item is gated by `approval.decide`. Reason: resolves the `03_APP_FLOW.md` §1 (`/admin/*` Admin only) vs §2.2 (Approval Queue route `/admin/approval-queue` includes Corporate ESG) contradiction, following §2.2 Submission Monitoring's own precedent of an analogous `/app` view for Corporate ESG. Recorded as an App Flow deviation beside the code. Alternative considered: per-route exception into `/admin/approval-queue` — rejected (non-admin inside Admin shell; exception list in the namespace guard).
- Decision: **Password policy: minimum 12 characters, no composition rules**, enforced by Supabase Auth locally and on hosted; rule shown inline on change/reset forms. Reason: NIST SP 800-63B favors length over composition. MFA and leaked-password checks not added (not in source documents / paid-tier feature). Alternative considered: 8 characters + composition rules.
- Decision: **Email delivery: Mailpit locally now; custom SMTP (Resend, per TRD §13) required before any non-team user gets a hosted account.** Reason: Supabase's built-in email sends only to project team members and is heavily rate-limited. Alternative considered: configure Resend SMTP before Phase 3.
- Decision: **First-Admin/bootstrap via `apps/web/scripts/provision-user.ts`** (service role, run locally by a developer): creates Auth user via Admin API invite, profile row, role/scope assignment and a `user.provisioned` audit entry (system action); deletes the Auth user if a later step fails. **First-Admin guard:** refuses to create an Admin when an active Admin already exists. Passwords never pass through repo or CLI — the invite email lets the user set their own. Also used for local dev seeding (Admin at MEIL, Project Manager at Project X). Alternative considered: manual dashboard + SQL editor — rejected (unaudited, error-prone, repeated after every local reset).
- Decision: **`is_active` app-layer check lives in the Data Access Layer** (protected layouts + tRPC context), not in `proxy.ts`; proxy only refreshes the session and optimistically redirects unauthenticated requests. Reason: Next.js 16 bundled authentication guide. Same enforcement coverage as the approved "middleware" wording.

- Decision: **Server-side mutations use direct Postgres transactions via `postgres` (postgres.js)** over `DATABASE_URL` (TRD §33), server-only. Every multi-table write (mutation + `audit_logs`, provisioning, §20.3 boundaries) runs inside `sql.begin(...)` in TypeScript. `@supabase/supabase-js` remains for Auth, Storage and RLS-scoped reads as the signed-in user. On Vercel, connect through Supabase's transaction-mode pooler (port 6543) with prepared statements disabled. Reason: supabase-js (PostgREST) cannot run multi-statement transactions, yet D1–D3 and schema §20.3 require atomic mutation+audit writes; keeps business logic in TypeScript (TRD §2 principles 1, 5; §24). Alternative considered: one service-role-only Postgres RPC function per mutation — rejected (workflow logic in SQL, split across TS/SQL).

## Surfaced assumptions
- tRPC is not set up by any earlier phase even though Phase 3 references "tRPC context"; Phase 3 adds tRPC (TRD §5).
- Password reset and invite acceptance need an in-app confirm handler and a set-password form, implied by App Flow §2.1 ("user follows emailed link to a password-reset form").
- Custom SMTP is a tracked blocker before the first real (non-team) user is invited.

## Open questions
- Hosted project Auth settings (sign-up off, 12-char minimum, email templates) must be applied to the hosted project once it is linked (`supabase config push` or dashboard) — pending the user's `supabase login`/`link`.

## Out of scope
- MFA, leaked-password protection, login rate-limiting beyond Supabase defaults (Phase 18 reviews rate limiting).
- Phase 4 invite/deactivate UI and the Auth ban step itself (Phase 4); Phase 3 only maps a banned sign-in to the deactivated message.
- The `/app/approvals` page itself (built with the Approval Queue in Phase 16).
