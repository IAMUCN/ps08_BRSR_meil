# Continue with Google, registered accounts only (2026-11-12)

Owner's request: "the registered users only can continue with google account. Give him the access; if a new user
who isn't registered by the admin, tell him that no signups are allowed, kindly contact admin, and give him the
mail address of the super admin (solarsyncx@gmail.com)." A59. No migration.

## What was built

- Sign-in page: "Continue with Google" under the password form (`app/login/google-sign-in.tsx`, server action
  `signInWithGoogle`), shown only while Supabase Auth reports the Google provider on (`lib/auth/google.ts`).
- `/auth/callback`: exchanges Google's code for a session, then lets in only an account with a `public.users`
  row, under the password sign-in's rules: deactivated refused, one sign-in per account (a second device gets
  "Sign out there and continue with Google"), a temporary password still to change, the sign-in marker cookie.
- Anyone else is signed out and sees: "No sign-ups are allowed: that Google account isn't registered in EmeilSG.
  Kindly contact the admin at solarsyncx@gmail.com" (mail link). If Supabase had sign-ups on and created an
  account for that address just now, it is deleted again. Audited as `auth.google_sign_in_refused`.
- A registered address whose Google account was not matched to it gets its own message (sign in with the password).

## Decisions (made by the agent; confirm with the owner)

1. The contact address is a constant (`SIGNUP_CONTACT_EMAIL` in `lib/auth/messages.ts`), as given.
2. Matching is by Supabase's own linking of verified emails: accounts are created with a confirmed email, so a
   Google account with the same address signs into the same account. The email typed by the admin must be the
   person's Google address.
3. An invited person who never set a password can sign in with Google; the invitation link stays valid until used.

## Setup the owner does (dashboards)

1. Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application). Authorised redirect
   URI: `https://<project-ref>.supabase.co/auth/v1/callback`. OAuth consent screen: External, app name EmeilSG.
2. Supabase dashboard → Authentication → Sign In / Providers → Google: enable, paste the client ID and secret.
3. Supabase → Authentication → URL Configuration → Redirect URLs: add `http://localhost:3000/auth/callback` and
   the Vercel address `…/auth/callback`.
4. Keep "Allow new users to sign up" off in Supabase Auth (the app refuses and cleans up either way).

## Checked / not checked

Typecheck, lint, unit tests; on a dev server against hosted: the callback's refusals (sign-ups refused →
not-registered notice, cancelled → sign-in page, bad code → try again), the page at 1280 and 390 px with the
notice and button, no console errors; with Google off on hosted the button led to Supabase's "provider is not
enabled", so the button is now hidden until it is on. Not checked: a real Google sign-in (needs the setup above).
