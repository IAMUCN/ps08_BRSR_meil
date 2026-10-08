# Grill: Bulk import (employees, org units) + OTP password reset

Date: 2026-09-25

Unplanned work requested directly by the owner mid-session, outside `06_IMPLEMENTATION_PLAN.md`'s phase
sequence — recorded here rather than under a phase number.

## Intent

Let HR (and any other role an Admin chooses) bulk-create employee accounts from a downloadable Excel
template, and let the same permission model cover bulk-creating org hierarchy nodes (projects/sites).
Separately: deliver bulk-import passwords by email, and replace the forgot-password flow with an
emailed OTP, both via Brevo — because the hosted Supabase project's own email only reaches the Supabase
team, so neither Supabase's invite-link nor reset-link email works for a real (non-team) user yet.

## Key decisions

- Decision: **two new permissions**, `user.bulk_import` and `org.bulk_import` (migration `0029`), not a
  hard-coded HR-only feature — matches "nothing hard-coded" and the owner's explicit call ("make it a
  permission, let the admin decide who does what"). Seeded: Admin gets both (every permission, per
  migration `0009`'s pattern); HR gets `user.bulk_import` by default (the original ask); `org.bulk_import`
  starts unassigned — an Admin grants it via the existing Roles & Permissions matrix, no new UI needed.
- Decision: **`users.employee_id`** (migration `0029`), nullable, unique when present. Only the bulk-import
  path writes it; the single Admin "Invite user" form is untouched. Alternative considered: don't persist
  it, use it only to label sheet rows — rejected, the owner asked to store it.
  Alternative rejected: reject on duplicate.
- Decision: **each row is its own transaction**, not one all-or-nothing batch — a bad row fails without
  taking the rest of the sheet down, mirroring the existing single-invite/single-create procedures
  (`users.invite`, `organization.create`) almost line for line. Reuses `isFrozen`/`canBeChildOf`/
  `checkRoleAtNode`; a new pure helper `reachableNodeIds` (`lib/org/rules.ts`) scopes a non-admin's
  reachable org units to their own assignments' subtrees.
- Decision: **org bulk import creates only direct children of one chosen parent per submission** — no
  multi-level sheets, no topological ordering between rows needed. Simpler; matches "adding child nodes
  (projects)" as asked.
- Decision: **the sheet is parsed entirely client-side** (`xlsx`/SheetJS, a new dependency) and submitted
  as JSON rows in one tRPC mutation — no signed-upload/Storage round trip like document evidence uploads,
  since there's no requirement to keep the original spreadsheet bytes. The server re-validates every field
  regardless of what the client parsed.
- Decision: **bulk-created accounts get a generated default password** (`Ravi@EMP1042`-style: first name +
  employee ID, padded with random digits to the existing 12-character minimum), created via
  `supabase.auth.admin.createUser` with `email_confirm: true` — not an invite link. The owner's explicit
  request ("send a default password... such as Name@231") conflicted with the app's own 12-character
  minimum (`Name@231` is 8 chars); resolved by padding rather than shortening the rule.
- Decision: **email delivery via Brevo, over real SMTP** (`smtp-relay.brevo.com:587`, `nodemailer`), not
  Brevo's REST API. The key the owner supplied is an SMTP key (`xsmtpsib-…`), not a REST API key
  (`xkeysib-…`) — the REST endpoint's `api-key` header only accepts the latter. `BREVO_SMTP_LOGIN` (from
  Brevo's SMTP & API page, distinct from the sender/from address) plus `BREVO_SENDER_EMAIL` (must be a
  verified sender) and `BREVO_SENDER_NAME` are the three env vars; sending is skipped (not faked) when
  they're unset, and each bulk-import row reports whether its email actually went out.
- Decision: **OTP-based password reset replaces the Supabase link-based one** for `/forgot-password` only.
  `/reset-password` (via `/auth/confirm`) is untouched — it still serves invite/first-password-set, which
  still uses Supabase's own invite email. A 6-digit code (`password_reset_otps`, migration `0030`,
  10-minute expiry, hashed at rest, max 5 wrong guesses), rate-limited per account and per client address
  by extending the existing `rate_limit_events`/`org_settings.rate_limits` mechanism (new
  `otp_requests_per_account`/`otp_requests_per_address`/`otp_window_minutes`/`otp_max_attempts` fields —
  additive defaults, no migration needed since `rateLimits()` already merges `DEFAULTS` over the stored
  row). On success, the password is set via `auth.admin.updateUserById`, never a live Supabase session.

## Surfaced assumptions / simplifications (ponytail)

- No cross-table transaction or advisory lock serialises two concurrent runs of the same bulk-import sheet
  (PostgREST/postgres.js transactions don't span multiple procedure calls the way a single script's
  transaction can) — acceptable for a human-driven, occasional bulk action; each row's own transaction
  still keeps partial failures clean.
- OTP password reset does **not** force-sign-out other active sessions, unlike the in-app "change
  password" flow (`profile.changePassword`, which uses `supabase.auth.signOut({scope: "others"})` on an
  active session). There's no simple documented Admin-API call to revoke every session for a user by id
  without an active session to scope "others" against, and reaching into Supabase's internal `auth.*`
  tables directly felt like the wrong tradeoff. Upgrade path: revisit if this becomes a real requirement.

## Out of scope

- Forcing existing accounts (created before migration `0029`) to backfill an `employee_id`.
- A dropdown/data-validation constraint inside the downloadable `.xlsx` template (SheetJS's free `xlsx`
  package can't write those) — a second "Valid codes" sheet lists them instead.
