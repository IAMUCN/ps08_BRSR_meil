# Grill: Password composition rules + live strength meter

Date: 2026-09-25

Requested directly by the owner mid-session, superseding Phase 3's "12 characters, no composition rules"
decision (`.grill/phase-3-auth-decisions.md`, NIST SP 800-63B).

## Intent

Every screen that sets a password should show the actual criteria (length, uppercase, lowercase, number,
special character) and a live strength bar that fills and colours in as they're met.

## Key decisions

- Decision: **one shared policy module**, `lib/auth/password-policy.ts` — 5 rules (12+ characters,
  uppercase, lowercase, number, special character), a `passwordMeetsPolicy` gate, a
  `passwordPolicyMessage` that names only what's still missing, and a `passwordStrength` score (0–5,
  weak/fair/good/strong). Pure, no `server-only` — the same rules run in the browser (the live meter) and
  on the server (every setter), so nothing the meter shows can be more lenient than what actually saves.
- Decision: **enforced everywhere a password is set**, not just the ones the owner named:
  `/reset-password` (invite / first-password-set), `/forgot-password`'s OTP step, Profile's change-password
  form, and `apps/web/scripts/provision-user.ts --password`. Missed any one of these and the policy would
  have a hole.
- Decision: **the bulk-import default-password generator (`generateDefaultPassword`,
  `lib/users/rules.ts`) now guarantees policy compliance**, not just the 12-character minimum — a
  one-letter first name or an all-letters employee ID could otherwise produce a password missing a
  lowercase letter or a digit, which the server would then reject against its own generated value. Fixed
  fillers (`X`/`x`/`7`/`!`) top up whichever rule the name/id alone didn't happen to cover.
- Decision: **`supabase/config.toml`'s `password_requirements` moves to `lower_upper_letters_digits_symbols`**
  (was `""`) for local dev, so Supabase Auth itself also enforces the same policy as defense in depth. The
  hosted project's Auth settings are a dashboard/Management-API setting, not this file — still an open item
  (same gap `PROGRESS.md` already tracks for `minimum_password_length`).
- Decision: **a single `PasswordStrengthMeter` component** (`components/auth/password-strength.tsx`): a
  colour-coded fill bar (red/amber/green, the app's existing 3 status colours — no new colour invented) plus
  a checklist where each criterion turns green with a check as it's met. Replaces the old static "At least
  12 characters" hint on all three password-entry screens.

## Out of scope

- MFA, leaked-password screening (Supabase paid-tier feature, still not in the source documents).
- Existing accounts' current passwords are not re-validated against the new policy — only newly *set*
  passwords are checked.
