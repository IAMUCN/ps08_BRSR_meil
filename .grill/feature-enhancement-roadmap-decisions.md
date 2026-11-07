# Grill: feature enhancement roadmap (feature_enhancement.md)
Date: 2026-11-07

## Key decisions
- Decision: Phase 1 proceeds with requirement 37 (local database) left BLOCKED until after the HoD demo and the
  data wipe; later phases may start as long as they do not depend on it. Reason: no later phase depends on where
  the database runs; every change is a migration that replays onto the local database. Alternative considered:
  moving the database first, as the document orders — rejected by the owner (demo first).
- Decision (requirements 18 and 32): one signed-in session per account for every user. A sign-in while another
  session of the same account is active does not complete at once: after the password is accepted, the new device
  asks "This account is signed in on another device. Sign out there and continue here?" Confirm ends the other
  session(s) and signs in here; Cancel signs in nowhere. Reason: the owner's choice, modelled on the Odisha State
  Scholarship Portal. Alternative considered: Super Admins only (agent's recommendation) — rejected; one account per
  browser alone — already true and kept.
- Decision: the device that was signed out goes to sign-in with "You were signed out because this account signed in
  on another device at <time>"; every takeover is audited with both devices' browser and address; a Super Admin
  also gets an email warning. No "this wasn't me" button on the old device. Reason: owner accepted the
  recommendation.
- Decision (requirement 13): permission codes stay unchanged internally (no migration); the owner approved the 20
  display names proposed on 2026-11-07 (e.g. document.upload = "Upload documents"). Codes are removed from the
  Roles & Permissions screen and the role editor; the Audit Trail and its exports keep codes. Reason: owner's
  choice; codes mean nothing to administrators.

## Decisions made while building Phase 1 (2026-11-07), for the owner to confirm
- A sign-in that reaches the app without the form (straight against the Supabase Auth API, or an emailed link)
  cannot be asked first, so on its first request it ends the other sign-in itself, audited as `first_request`.
  Reason: otherwise one session per account would hold only for people who use the form. Alternative: refuse such
  a session — rejected, it would break the emailed reset link when another device is signed in.
- "A Super Admin also gets an email warning" was read as: when a Super Admin's own account takes over a sign-in,
  that Super Admin is emailed (`admin@meil.local` has no mailbox, so nobody receives it for that account). The
  other reading (every takeover of anyone emails the Super Admins) was not built.
- The takeover revokes the other device's Supabase session at once (not only the app's clock), so its tokens stop
  working against Supabase directly too.
- The signed-out notice is shown for 24 hours after the takeover; the browser keeps a small cookie with the session
  id (not a credential) because Supabase clears its own cookie as soon as the revoked session is refused.
- Profile's password fields got the show/hide button too (requirement 11 named forgot-password only).

## Surfaced assumptions
- "Device" cannot be identified by a web app; a browser (cookie) is the device. One account per browser already holds.
- A session left open on a closed laptop stays active until its 3-hour idle limit, so the takeover prompt will
  appear in that case too; that is intended.

## Open questions (asked at the start of the phase that needs them)
- Phase 2: reporting calendar (grace period, late submission, who configures); duplicate policy across periods;
  what "simpler" approval screens means (req. 4); which screen lacks the PDF preview (req. 2).
- Phase 3: a failing image for the billing-period bug (req. 27); handwriting reference diagram (req. 15).
- Phase 4: who receives a forwarded report and what outcomes exist; which roles see whose logs.
- Phase 5: one reminder schedule reconciling the 7-day daily window with 5/3/0-day reminders.
- Phase 6: an authoritative factor source (SEBI API existence is unconfirmed).
- Lane: who builds ui-lane items (3, 6, 8, 40 and the UI parts of others).
