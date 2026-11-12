# Grill: Super Admin and scoped administrators, link onboarding, sessions, exports, docs, phone pass

Date: 2026-10-13

## Intent

End the situation where every Admin can do everything (hosted had five within three weeks). A very small, fixed
set of Super Admins holds group-wide configuration; everyone else who administers is limited to the part of the
organisation they are assigned to. Along with it: no password is ever emailed, sessions end by themselves,
exports are complete Excel files, the public site explains the app, and every page works on a phone.

## Constraints

- Merging to `origin main` deploys to the live Vercel site, so each migration reaches hosted before its merge.
- The owner says "go" before every hosted migration and every merge.
- Evidence-first stays: no typed data-entry form; an administrator uploads through the existing upload and
  verify screens.
- The chatbot's read-only, scope-aware behaviour is not changed.
- Nothing is published in the public docs that maps who can do what at the top (see Key decisions).

## Key decisions

- Decision: scoped administrators get the pages about their units (Users, Organization, Submission Monitoring,
  Data Explorer, validation and approval queues, Scope 1/2/3, Reports, Control Tower, Upload), limited to their
  subtree; group-wide configuration (conversion factors, BRSR mapping and disclosures, roles and permissions,
  reporting periods, hierarchy levels, settings, the full audit trail) is Super Admin only. Reason: a project
  admin editing a factor or a mapping changes every other project's numbers, so those pages cannot be scoped.
  Alternative considered: all of `/admin` scoped; user management only.
- Decision: the existing `admin` role is the Super Admin. A new single **Administrator** role takes its reach
  from the org unit it is assigned at. Reason: a new hierarchy level then needs no new role. Alternative
  considered: one role per level.
- Decision: at most **two** Super Admins, enforced by the database, the cap held as one setting. Only a Super
  Admin grants or removes the role; the last one cannot be removed. Reason: the owner wanted a spare with a real
  mailbox; the original brief said exactly one. Alternative considered: exactly one; no cap.
- Decision: Super Admins are `admin@meil.local` (kept as it is, by the owner's choice) and
  `niharbehera965@gmail.com` (to be invited through the new link).
- Decision: the other four hosted Admins become Administrators — Bal at Olectra Greentech, DD at EVEY, AB at
  MSRTC e-bus order, AD at BEST Mumbai e-buses. Done by a one-off audited script on hosted, before the
  constraint, not by the migration. Reason: each lands on real data and the placement shows both isolation
  cases (sibling subsidiary, sibling project). Alternative considered: random placement; all four at the group.
- Decision: administrators (Super and scoped) can upload any activity for any unit in their scope, ignoring the
  activity's owning role, from an Upload entry in the admin sidebar.
- Decision: nobody approves a record they submitted or verified — except a Super Admin, who may approve their
  own; that approval is marked in the audit trail and in the report drill-down as submitted and approved by the
  same person. A scoped administrator's upload is approved by any different approver in scope, an administrator
  above them, or a Super Admin. Reason: one Super Admin approving every administrator's upload would stall the
  group. "Verify" in the owner's answer meant approve.
- Decision: who creates whom — a Super Admin: any role at any unit; an Administrator at X: operational roles at
  X and beneath, the Administrator role only **beneath** X, never Super Admin; HR keeps bulk import in scope and
  an import row asking for an admin role is refused; nobody changes their own assignments. Reason: every
  administrator is appointed from above, so admins cannot multiply sideways.
- Decision: a scoped administrator removes only assignments inside their scope, and may deactivate a whole
  account only when every assignment that person holds is inside that scope.
- Decision: invitations use the app's own random token (only its hash stored), emailed through Brevo. Opening
  the link changes nothing; the token is used up when the password form is submitted, in the same transaction;
  no sign-in from the link. Valid 24 hours (a setting); a resend cancels every earlier link; Resend and Revoke
  for a pending account; one generic message for an expired, used or unknown link. Reason: Supabase's invite
  link is consumed and signs the person in on a plain GET. Alternative considered: 1 hour; older links staying
  valid.
- Decision: bulk import uses the same link; no path emails a password. Accounts that already hold an emailed
  temporary password keep the existing forced-change screen.
- Decision: sessions end after 3 hours without activity and 12 hours after sign-in, enforced in the app (both
  settings); they survive a browser close; background polling (notification bell, My Submissions refresh) does
  not count as activity. Alternative considered: 8 hours absolute ending with the browser; 30 minutes idle.
- Decision: the four on-screen CSV exports (records, audit log, two bulk-import result sheets) become
  server-generated `.xlsx` with every row matching the filter, a header block (org unit, period, filters, who,
  when), typed cells, no internal ids, formula-injection guard; the audit-log export stays Super Admin only.
  The evidence bundle's ledgers stay CSV. Reason: they are fingerprinted, and an `.xlsx` gives different bytes
  on each generation.
- Decision: public docs at `/docs`, one Markdown file per article, sidebar, breadcrumbs, table of contents,
  related articles, in-browser search; text and simple diagrams only, no screenshots. The full permission
  matrix and the Super Admin approval rule go in a signed-in help page, not the public docs.
- Decision: demo request stores the email address and the time only; not readable through the app for now;
  the same address twice gives the same success message and one row; rate-limited per address and client; one
  line of notice under the field.
- Decision: six branches in order, each tested and merged before the next: (1) roles and scope, admin upload,
  approval rules — migration `0050`; (2) invitations — `0051`; (3) sessions — `0052` (it needed a table
  after all); (4) tree selector, Scope 1/2/3 filters, Excel; (5) demo request, public docs, signed-in help —
  `0053`; (6) phone and tablet pass, security regression check, documents. The feature session does the ui-lane parts and records them in `UI_NOTES.md`.

## Decisions made while building stages 2 and 3 (2026-10-13, the agent's, for the owner to confirm)

The owner asked for both stages in one go ("implement stage 2 and 3") with stage 1 still uncommitted, so
all three sit in one working tree on `feature-scoped-admins`.

Invitation links (stage 2):

- Decision: the token travels after the `#` of the link (`/invite#token`). Reason: a browser never sends
  that part to a server, so the token is in no access log, proxy log or Referer header, and a mail scanner
  that fetches the address gets a page that knows nothing. The page reads it, takes it out of the address
  bar and the history, and asks the server by POST. Alternative considered: in the path or the query string
  with a page that only shows a form (the token would be in the host's request logs).
- Decision: 32 random bytes; only the SHA-256 is stored; the database refuses anything that is not a hash,
  refuses a second open link per account, and refuses to change a link's account, token or expiry or to
  bring back a used or revoked one.
- Decision: the new account is created with no password supplied. Supabase Auth fills in a random one that
  it never returns, so the account cannot be signed in to; the person's own password is set, hashed by
  Supabase Auth, in the transaction that uses the link up.
- Decision: the reset-by-code form sends no code to an account that was never set up (no link used and
  never signed in), with the same "if that email exists" answer as always. Reason: otherwise Revoke link
  and an expired link could be walked around by anyone who can read that mailbox. Consequence: an account
  from before the links that never signed in must be sent a link by an administrator.
- Decision: "Invited" now means no link used and never signed in. Resend and Revoke are refused for any
  other account: a link is never a way to set the password of an account in use.
- Decision: Resend for an account that still holds an emailed temporary password overwrites that password
  with a random one nobody is told and removes the forced-change mark.
- Decision: deactivating or deleting an account revokes its open link.
- Decision: limits (in `org_settings.rate_limits`, defaults in code): 600 links per issuer and 5 new links
  per account in 60 minutes; 30 links that do not exist per client address in 15 minutes. Only wrong links
  are counted, so a whole office behind one address setting up accounts is not locked out.
- Decision: the app's email can be sent to a mail catcher on this machine (`EMAIL_SMTP_HOST`,
  `EMAIL_SMTP_PORT`), honoured only for a loopback address. Reason: the end-to-end test has to read a real
  link, and the token exists nowhere but in the email.
- Not done: `scripts/provision-user.ts` without `--password` still uses Supabase's own invite email and
  `/auth/confirm`; the Supabase link is used up by a plain GET. It is a command-line tool for the first
  account of an installation, not reachable from the app.

Session limits (stage 3):

- Decision: the app keeps its own clock per sign-in (`user_sessions`, keyed by the access token's
  `session_id`) and checks it in the one place every page, procedure and file route already goes through
  (`resolveSession`). Reason: a time kept in a cookie could be rewritten by whoever holds the browser, which
  is exactly who an idle limit is for. Alternative considered: Supabase's dashboard session settings (a paid
  plan, and not readable from the repository).
- Decision: "activity" is what the person does on the page (a key, a click, pointer movement, a scroll),
  reported by the page at most once a minute. A request by itself never counts. Reason: the notification
  bell and the refreshing lists are requests like any other; nothing on the server tells them apart from a
  person. Alternative considered: counting every request except a list of polling procedures (the list
  would have to be kept right forever).
- Decision: five minutes before the end the page says so. For the idle limit there is a Stay signed in
  button; for the 12-hour limit there is none, only the time. When the session has ended an open page goes
  to sign-in by itself and returns to the same page after signing in.
- Decision: a session that ran out ends on that device only; Log out still ends every device.
- Decision: a missing or senseless setting means the default limits, never no limit; a session the app
  cannot identify is refused.
- Known limit: sessions that exist when this is deployed are given a fresh clock at their next request.

## Surfaced assumptions

- "sad icon" is the **Shared** tag in the org tree (an 8px glow at 50% opacity); "notes" are **nodes** (org
  units); "Remise Obligations" is **My Submissions**, the reference page for the phone-width table fix.
- The Scope 1/2/3 pages already filter by org unit on the server. What is missing: an explicit cascading
  picker, a filter by activity or source category, a consolidated / this-unit-only switch, and access for
  scoped administrators.
- Landing redirects, safe return paths, the same-origin check on mutations, HttpOnly cookies and `no-store`
  on API answers already exist.
- "Group-level admins" in the owner's words means every administrator below a Super Admin.

## Open questions

- The date of the finale or judged demo was asked and not given; hosted changes wait for an explicit go-ahead
  in any case.
- The hosted Supabase plan and its dashboard session settings were not read (not needed: the limits are
  enforced by the app).
- Brevo may rewrite links to count clicks. If click tracking is on for transactional email, the invitation
  link passes through Brevo's redirect; switch it off for this sender in the Brevo dashboard.

## Out of scope

- A second factor (MFA) for Super Admins — deferred; an open risk: the two most powerful accounts rest on a
  password, and `admin@meil.local` is a shared login with no mailbox.
- Asking for the password again before sensitive Super Admin actions.
- Screenshots in the docs; a page listing demo requests; any sales or mailing workflow.
- Converting the evidence bundle's ledgers to Excel.
