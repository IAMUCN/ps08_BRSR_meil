# Invite user through the app's SMTP sender — decisions (2026-10-12)

Owner's page feedback on `/admin/users`: "This invite user is not using the SMTP protocol. It is using the
Supabase auth to mail the user and send him a link to accept the invitation. Check that and redirect it to the
SMTP. Give him the default password as it was in bulk import."

| Question | Decision | Whose |
|---|---|---|
| What is emailed | A temporary password, as in bulk import: 16 random characters (`generateInitialPassword`), not the old name-plus-employee-id pattern the security audit replaced | Owner (the pattern); agent (keeping it random) |
| Sender | `lib/email/brevo.ts`, the same email as bulk import ("Your EmeilSG account") | Owner |
| Email fails or is not configured | The account stays; the Admin sees the reason and uses **Resend email**. The password is never shown on screen | Agent |
| Resend | A new temporary password replaces the earlier one; refused after the first sign-in | Agent |
| "Invited" status | Never signed in (`last_sign_in_at` empty). The account is created confirmed, so the old test no longer tells anything | Agent |
| Forced change at first sign-in | **Yes** (owner, same day): after signing in with the temporary password the sign-in page asks for a new one, and nothing else opens until it is set | Owner |
| Where the "must change" mark lives | The sign-in account's app metadata (`must_change_password`), which only the server can write; no migration. `resolveSession` returns `password_change_required`, so every page, procedure and file route refuses the session | Agent |
| Which accounts | Invite user, Resend email and bulk import set the mark. A password chosen with an emailed reset code clears it. Accounts created before this change are not marked | Agent |
| After the change | The person stays signed in and goes to the page they asked for; one audit entry `user.temporary_password_changed` | Agent |
| `scripts/provision-user.ts` without `--password` | Unchanged: still Supabase's invite email | Agent |

Accounts invited the old way and never accepted show as Invited; Resend email gives them a temporary password.
The emailed link route (`/auth/confirm`, `/reset-password`) is unchanged and no longer reached from the app.

Checked 2026-10-12: the two procedures on the local database with the SMTP transport replaced by a capture,
22/22 (account, audit entry, status, no password in the answer, the emailed password signs in, a wrong one does
not, resend refused after sign-in, failure reported); typecheck, lint, format, unit 195/195, production build.
Not run: a real email through Brevo, the Users screen in a browser, the end-to-end suite.

First sign-in, checked the same day in Edge on the built app against the local stack, 24/24: the prompt after
signing in, the app and the API closed until the change, weak / mismatched / unchanged passwords refused, the
new password opening the page asked for, the temporary one no longer working, Sign out from the prompt.
Not run: bulk import followed by a sign-in, the reset-code path clearing the mark (read in code only).
