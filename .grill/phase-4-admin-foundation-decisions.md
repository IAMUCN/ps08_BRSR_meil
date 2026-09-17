# Grill: Phase 4 — Organization and Admin Foundation decisions
Date: 2026-09-17

## Intent
Build Phase 4 of `06_IMPLEMENTATION_PLAN.md` — organization hierarchy, user management, roles & permissions, reporting periods, the Admin and user shells and Profile — as the first real server-only transactional Admin writes, without inventing product requirements or showing fake data.

## Constraints
- Server-only writes via tRPC procedures + postgres.js transactions, audit entry in the same transaction (Phase 2 D1–D3, Phase 3 postgres.js decision).
- No fake functionality: placeholders only when clearly labeled as development placeholders.
- Synthetic data only until Phase 18; hosted invites reach Supabase team members only until custom SMTP exists.

## Key decisions
- Decision: **Org tree ordering — skip levels, never invert.** A child's `unit_type` must come strictly later than its parent's in the reference order (group → subsidiary → business_unit → region → project → site → department); exactly one `group` root; moving a node applies the rule to the node and its subtree, rejects cycles, requires confirmation and is audited with old/new parent. Server-side checks, no schema change. Reason: prevents nonsense trees that would corrupt consolidation and scope cascade while keeping Region/Department optional (Master §5 "configurable"). Alternative considered: no ordering rule, cycle prevention only.
- Decision: **Deactivated org node = frozen but readable.** An inactive node — or any node with an inactive ancestor — accepts no new uploads (Phase 5), assignments or child nodes. Existing assignments remain; users keep read access to history; consolidation/reports still include its approved data. Confirmation shows impact counts (descendants, active assignments, in-progress records). Reactivation reverses it; both audited. No RLS change. Alternative considered: revoke all assignments on deactivation — rejected (loses users' read access to their own history; not reversible).
- Decision: **Submission windows as guidance dates (schema deviation D10).** Add nullable `reporting_periods.submission_opens_on` / `submission_closes_on` (check: closes ≥ opens). Uploads remain gated by manual `status = 'open'`; window dates drive due-date display, the Phase 6 "deadline approaching" notification and Control Tower missing-submission logic. Reason: Master §7C "Define submission windows" + App Flow §2.2 action had no schema columns. Alternatives considered: automatic open/close scheduling (no scheduler in stack; collides with single-open-period constraint); no window columns (fails Master §7C).
- Decision: **Closed periods can be reopened only deliberately.** `closed → open` requires a written reason stored in the audit entry (`reporting_period.reopened`); refused while another period is open; confirmation warns when report runs exist for the period, and from Phase 17 those runs show a "period reopened after generation" warning. `draft → closed` is not allowed. Alternative considered: closing is final.
- Decision: **Lockout protection — all three guards.** (1) No self-deactivation and no revoking one's own Admin assignment. (2) The last active Admin cannot be deactivated or lose the Admin assignment (checked inside the transaction). (3) The `admin` role's permission set is locked to the full catalogue; system roles cannot be deleted (their permissions otherwise editable); Admin-created roles are editable/deletable while no active assignment uses them; the permission catalogue is read-only in the UI. Alternative considered: last-Admin guard only.
- Decision: **No fake Control Tower numbers.** Header strip shows live Total Organizations / Total Projects / Active Users; the two KPI rows and the Issue Panel render structure with "—" values and a visible "Development placeholder — data arrives in Phase 16" label. Sidebars list only pages that exist. Alternative considered: omit KPI rows until Phase 16.
- Decision: **Profile password change requires the current password** (server re-verifies it before `updateUser`); other sessions are signed out; audited as `user.password_changed` with no password material. Emailed reset links do not require it. Alternative considered: Supabase `secure_password_change` (depends on email delivery).
- Decision: **The `admin` role can be assigned only at the root Group node**, enforced in the User Management procedure and in `scripts/provision-user.ts`; `is_admin()` unchanged. Scoped oversight uses `corporate_esg` at a subtree. Reason: `is_admin()` is global, so "Admin at Project X" would silently grant organization-wide control. Alternative considered: genuinely scoped Admin — rejected (changes helpers and every Admin check; Master §4 describes Admin as overall control).

## Surfaced assumptions
- Invites expire (Supabase OTP expiry 1 hour), so User Management needs "resend invite" for users who have not accepted yet.
- Deactivation touches two systems: the Supabase Auth ban is an external API call and cannot join the Postgres transaction, so the procedure bans first, then commits the DB change + audit, and lifts the ban if the transaction fails.
- The theme switcher and its per-user persistence stay in Phase 19 (Profile in Phase 4 covers display name and password only); persisting the theme needs a column the schema does not have — to be raised in Phase 19.
- The org/period context switcher and notification bell in the top bar (App Flow §1) are not built in Phase 4; they arrive with the data/notifications they control (built-pages-only rule).

## Out of scope
- Upload blocking for inactive nodes (Phase 5 enforces it using the rule defined here).
- Control Tower data, KPI definitions such as "expected submissions" (Phase 16).
- Theme switcher (Phase 19); My Organization/Project page (not listed in Phase 4).
