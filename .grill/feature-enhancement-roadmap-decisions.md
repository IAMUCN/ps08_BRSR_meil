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

## Phase 2 decisions (2026-11-07)
- Decision (req. 39, plan 2.1): several reporting periods may be open at once (the one-open-period rule is dropped);
  the uploader picks the period among the open ones, newest first, each shown with its dates. Periods stay centrally
  configured by a Super Admin. Reason: a month's bills arrive after the month ends (August's bill in mid-September).
  Alternatives: one open period plus reopening (today) — rejected; late-only path without several open periods.
- Decision: each period has a due date (submission_closes_on, default 15 days after the period ends) and a "late
  uploads until" date (default 45 days after), both editable. Between them an upload is accepted but marked Late;
  on the second date the automatic job locks the period; after that only reopen-with-reason. Reason: owner's choice;
  a hard end keeps a period's report from changing for ever.
- Decision: lateness is a validation flag ("Submitted after the due date …") that sends the record to the Validation
  Queue under a Late category; a Super Admin, a holder of validation.review (Corporate ESG) or the unit's
  Administrator accepts it with a reason or returns it; the Late mark stays visible on the record. Administrators
  already hold validation.review (0050) and the queue is scope-limited, so no new permission.
- Decision (req. 22, 23, plan 2.3): duplicate policy — a file name is never a reason by itself; identical content
  (SHA-256), in the same or another period, is a validation flag naming the earlier record (it used to be a warning
  only); a re-upload after return or rejection is a new version linked to the old record, not a duplicate;
  different files where OCR reads the same supplier + bill number + billing period are flagged as the same bill;
  same project, period and activity with different bills stays a warning only. Nothing is ever overwritten.
- Decision: files keep their storage id; the confirmed bill number is stored with the supplier and is the duplicate
  key; monitoring shows a Bill no. column and searches it; downloads get readable names
  (supplier_Bill-number_period). Alternative: storing files by bill number (owner's idea) — not taken: the number is
  unknown at upload, OCR can miss or misread it, and numbers are unique only within one supplier. Owner agreed.
- Decision (req. 2, 4, 22, plan 2.2/2.4): one approval list for approvers and Admins — a thumbnail of the bill, bill
  no., activity, value, uploader, date, Late / Duplicate badges, Approve and Return on the row for records with no
  flags; every record shows a stage tracker (Uploaded → Read by OCR → Checked by uploader → Validated → Approved) with
  whom it waits on and the next action; the record panel shows the bill beside its values.
- Decision (req. 25, 28, plan 2.4): Submission Monitoring, the Data Explorer and the approval list filter by both
  Document type and Activity; each record says whether OCR suggested its document type or a person chose it. An
  Admin may correct the document type (reason, audited; values unchanged). A wrong activity is returned to the
  uploader ("wrong activity") and re-uploaded as a new version, never changed in place.

## Phase 3 decisions (2026-11-08)
- Finding (req. 27): 4 of 5 hosted electricity photos with no billing period are one TPCODL bill whose PRES line
  reads "PRES:7591.1201-04-2026" — the reading and the date run together, and the date rule refuses a date glued to a
  number; the 5th photo gave only 6 text lines (unreadable). Fix: accept a date glued to the end of a meter reading on
  PREV/PRES lines, confidence capped so it is always reviewed; store a reason whenever the billing period is missing.
- Decision (req. 28, plan 3.2): OCR classifies against every document type; when the document clearly looks like
  another activity's, validation flags it ("looks like an electricity bill — wrong activity?") for the Validation
  Queue, where an Admin returns it (Phase 2) or accepts. The uploader still picks the activity. Alternatives: no
  activity at upload (OCR decides) — rejected; show the guess only — rejected.
- Decision (req. 38, plan 3.3): a spreadsheet-style grid of the extracted fields on the verify screen — value read,
  confidence, the person's value; low-confidence cells red and edited in place; selecting a cell boxes its source on
  the document and selecting a box selects its cell; original and corrected values kept and shown; Excel download.
  Alternative: recreating the bill's printed table — rejected for now.
- Decision (req. 1, 26, plan 3.1): Submission Monitoring and OCR Monitoring become one page: an OCR column with
  colour-coded states, an OCR filter, the stuck-queue banner, Retry and OCR details in the record panel; the OCR
  Monitoring address redirects to the filtered Submission Monitoring.
- Decision (req. 15, plan 3.4): "handwritten notes" are bus tickets written by the conductor. Possible, as assisted
  entry under the existing bus passenger-km activity (passengers x distance x factor); distance from an Admin-kept
  route list (else typed). Waits for 3-5 real ticket photos to test a handwriting model before anything is built.
- Agent's decision, to confirm: Grid Electricity gains an optional Bill number field (OCR reads "Bill No"), so the
  same-bill check and the Bill no. column work for electricity; the utility it already records stands in for the
  supplier.

## Phase 4 decisions (2026-11-08)
- Decision (req. 9, plan 4.1): whoever may generate reports for a unit may forward a ready report, with an optional
  note, to the Administrators of the next unit up; if that unit has none, the next one above, ending with the Super
  Admins. A unit under several parents goes to each parent's Administrators. Outcomes: Verify (optionally forward
  on to the level above) or Return for correction with a reason; no Rejected. Every step audited and notified; the
  report shows its trail; nobody verifies a report they generated or forwarded.
- Decision (req. 12, 29, 30, plan 4.2): everyone sees their own entries ("My activity"); an Administrator also sees
  every entry about something inside their units (records, documents, OCR, reports and forwarding, people holding a
  role there), with the person's name and role; Super Admin sees everything. Entries are scoped by what they are
  about, not by who did them; group-wide configuration stays Super Admin only. The Audit Trail gets a search bar and
  filters (mine / all I may see / a person / a role / dates / action). Approvers see a record's history in its panel,
  as today.

## Phase 5 decisions (2026-11-08)
- Decision (req. 10, 24, plan 5.1): one reminder schedule, a Super Admin setting, counted in days before each
  period's due date, India time: in-app on days 7, 6, 5, 4, 3, 2, 1 and 0; email on days 7, 5, 3 and 0. Sent only to
  the owners of expected submissions still missing; at most one reminder per person, period, schedule day and
  channel. After the due date the existing overdue escalations continue. Days and channels editable.
- Decision (req. 16, plan 5.2): each unit's Administrators get one summary of what is still missing in their units
  and below, on the same schedule, until nothing is missing; the Super Admins get the group summary on email days
  only. The Deadlines page shows each reminder sent (day, channel, recipient, email accepted or failed), for the Super
  Admin and for Administrators' own units. A failed email is retried once on the next run; an accepted one never again.
- Decision (plan 5.3): Vercel Cron calls a protected /api/cron/reminders once a day at 09:00 India time; the owner
  adds CRON_SECRET to the Vercel project; a Super Admin also has "Run now". Alternatives: the database calling the
  app — rejected; manual only — rejected.
- Built that way (agent's choices, for the owner to confirm): the reminders replace the bell's own "due soon"
  notices and the escalation sweep's before-due stages (one mechanism, no doubles); the sweep keeps only the
  overdue escalations. An Administrator's log shows their own reminders and the owners' reminders about their
  units, never another Administrator's or a Super Admin's summary (those count units outside theirs). The
  schedule allows 0 to 14 days on the page (60 in the setting). Reporting Deadlines opens to Administrators for
  the Reminders section only; the task list and the sweep stay Super Admin. The log shows the newest 200, 20 at a
  time. Without CRON_SECRET the daily trigger refuses every call (503), so nothing runs until the owner sets it.

### Phase 6 decisions (2026-11-08)
- Research (req. 17, plan 6.2): no SEBI or other official API publishes emission factors. SEBI's BRSR is a
  disclosure format; CEA publishes the grid factor once a year as the CO2 Baseline Database (Excel and a PDF user
  guide, e.g. cea.nic.in/api/cdm-report-version/view-pdf/en/68), not an API. Recorded as the limitation the plan
  asks for.
- Decision (req. 7, plan 6.1): every version stores its link, publisher, financial year, the date it was read and
  whether the value was typed or picked from the fetched page (with the page's SHA-256). "Fetch values" works
  only for a link on the official list (org_settings.factor_source_hosts: CEA, BEE, MoEFCC, Steel, NITI Aayog,
  IPCC NGGIP, IPCC, GHG Protocol, India GHG Program); it reads HTML, PDF, CSV or Excel and offers the numbers that
  look like factors; nothing is saved until the person picks one and saves a draft. Alternatives: no fetching --
  rejected; any link -- rejected (the server could be sent to internal addresses).
- Decision (plan 6.2): a new or corrected version is a draft; a different Super Admin approves it. While only one
  Super Admin exists they may approve their own, marked "self-approved" in the version and the audit trail. A
  draft can be turned down (or withdrawn) with a reason and is kept, retired. Alternatives: strictly a second
  Super Admin -- rejected (hosted has one today); no approval step -- rejected.
- Decision (req. 17): a yearly review on Conversion Factors lists, for a financial year, every activity that takes
  a factor with no value, an earlier year's value, or one entered for that year, with "Add value". Alternative:
  also reading CEA's Excel -- rejected (its layout changes between versions).
- Decision (req. 35, plan 6.3): a preset, editable list of outside sites on Carbon Markets, grouped India's carbon
  market / exchanges / international registries, each opening in a new tab with its address shown, under a notice
  that EmeilSG does not sell, certify or guarantee credits. Preset after fetching each on 2026-11-08: Indian Carbon
  Market (indiancarbonmarket.gov.in, BEE), BEE, IEX, HPX, Verra Registry, Gold Standard Registry. Left out: PXIL
  (refused connections that day), Grid-India (its page did not show its registry role). "Check addresses"
  records each answer; all six answered 200 on 2026-11-08.
- Built that way (agent's choices, for the owner to confirm): a version's result unit must be kgCO2e, tCO2e,
  kgCO2 or tCO2 and match the factor's earlier versions; its per-unit must measure the same thing as the
  activity's unit; a financial year sets 1 April - 31 March and the start date must fall in it. Versions active
  before this phase stay active, shown as "Before the approval step". Retire and Put back stay for approved
  versions; a turned-down draft cannot be put back. The source fetch is limited to 20 per person per 10 minutes,
  10 MB, 15 seconds and three redirects, each re-checked against the list; every address the name resolves to
  must be public. Carbon links are listed to anyone with carbon_credit.view (the page itself is Super Admin only
  today) and changed by a Super Admin.

### Phase 7 decisions (2026-11-09)
- Decision (req. 33, plan 7.1): a new page, Carbon Analytics (/admin/carbon-analytics), for Super Admins (every
  unit) and Administrators (their units and below); the Control Tower's KPI card stays and links to it. Year-wise
  emissions per scope and per activity from approved records only, in tCO2e. A year is complete when all 12 months
  have approved data, nothing awaits approval or a factor, no expected submission is missing and the year is over;
  otherwise the page says what is missing. Years are compared like for like: in full when both are complete, else
  on the months both have, else "not comparable". Alternative: extending the Control Tower card -- rejected.
- Decision (req. 33, plan 7.2): owner's choice "rules plus AI wording". A reviewed list of rules (11 activity
  groups: travel, grid electricity, fuels, coal, refrigerants, freight, commuting, cement and steel, waste, process,
  steam and heat) picks the suggestion and states its figures; "Explain in plain words" asks the AI service
  (NVIDIA, the chatbot's settings; needs chat.use) to reword one, on request only. The model sees the suggestion's
  wording and figures, not the unit's name, people or documents; a reply with a number it was not given (or a
  tonnage, percentage or ratio not given with that unit) is refused and the fixed wording stays. Every request is
  audited without its text. Alternatives: rules only; AI decides -- rejected (not explainable or testable).
- Decision (req. 34, plan 7.3): owner's choice -- the expected average of a period is the mean of the same period
  in up to three earlier financial years (at least two), per unit and scope; an alert when approved emissions are
  more than the scope's threshold above it (default 20%, a Super Admin setting). Checked by the daily 9:00 call
  (the same Vercel Cron as the reminders) and by "Check now"; delivered in the app and by email to the unit's
  Administrators (at the unit or above) and the Super Admins, one notification and one email per person per run,
  never twice. Skipped when the period or an earlier one has anything missing, awaiting approval or uncalculated.
  Alternatives: trailing average (seasonal false alarms); fixed limits only -- rejected.
- Built that way (agent's choices, for the owner to confirm): "rising" is +20% and at least 0.5 tCO2e on the year
  before (+50% is high priority); "unusually high" is a month at least 1.5 times the median of the 12 months with
  data before it, and not a lasting step (it must stand out from the later months of its year too); a group that
  is 40% or more of the year's total gets a low-priority "largest source" suggestion when nothing else fired; one
  suggestion per activity group. Alerts: only closed periods that ended within 180 days, at least 0.5 tCO2e above
  the average; an alert keeps its figures and earlier periods, is acknowledged once with a note (Administrator of
  the unit or a Super Admin), and is sent to people who become Administrators later only within 7 days. The scope
  colours were not used for a stacked chart (they fail the colour-separation check in the Special and Dark themes):
  one small chart per scope instead.
- Found while testing: on this machine's .env.local the three NVIDIA models answer 404 (not for this account), 410
  (retired) and a timeout, so AI wording -- and probably the chatbot -- does not work on the owner's dev server
  until NVIDIA_NIM_MODEL lists a working model.

## Surfaced assumptions
- "Device" cannot be identified by a web app; a browser (cookie) is the device. One account per browser already holds.
- A session left open on a closed laptop stays active until its 3-hour idle limit, so the takeover prompt will
  appear in that case too; that is intended.

## Open questions (asked at the start of the phase that needs them)
- Phase 6: answered -- no SEBI API exists; a yearly review with sources and approval instead (Phase 6 decisions).
- Phase 7: answered -- new page, rules plus AI wording, same period of earlier years, daily in-app and email
  (Phase 7 decisions).
- Lane: who builds ui-lane items (3, 6, 8, 40 and the UI parts of others).
