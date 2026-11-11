# Grill: owner's page feedback of 2026-11-11
Date: 2026-11-11

Feedback sent from the agentation widget on Submission Monitoring, Conversion Factors, Reporting Deadlines, Audit
Trail and the multi-bill split page. Built by the feature session at the owner's request (several items are in the
ui lane; `UI_NOTES.md` lists what was touched). No migration.

## Intent
Make the filter-heavy Admin pages faster to use (filters that follow each other, apply by themselves, reset in one
click), remove words and options that mislead ("Unassigned", future financial years, a document-type filter that
repeats the activity), and make the side panels and the split page work like a desktop tool (expand, resize, undo,
keyboard).

## Key decisions
- **Submission Monitoring filters.**
  - Decision: remove the Document type filter. Reason: every activity maps to exactly one document type, so it
    repeats Activity. Alternative considered: keep it for when an activity gains a second type (rejected for now).
  - Decision: the Activity list follows the chosen Scope; with Scope "All" it is grouped under Scope 1 / 2 / 3, and
    choosing an activity sets Scope to match.
  - Decision: a date filter on the **upload date**, From and To (one day = both the same), in the URL with the other
    filters, combined with Period. Alternative considered: the bill's own billing period (rejected).
  - Decision: a visible **Reset filters** button in the filter bar, shown only when something differs from the
    default; default = own org unit, current open period, everything else empty, search cleared. Replaces the
    floating "Clear filters" link.
- **Role under the submitter's name.** Decision: the person's role(s) today at the record's unit or above, joined
  with " · " when several; when the activity's owning role differs and the person uploads on its behalf, add
  "for <role>" (e.g. "Employee · for Project Manager"). Reason: matches the Role filter and needs no migration.
  Accepted cost: a role changed later shows on old rows. Alternative considered: store the role at upload
  (rejected: migration for a display line).
- **Badge and period select.** "Pending approval" must fit its cell; the Period select must show its whole label.
- **Conversion Factors yearly review.** Decision: the financial-year list runs from the current FY (2026-27) back
  to the earliest FY with a factor or reporting period; never ahead. Check both databases for any factor, period
  or review row dated in a future FY and remove only those (option a). Not touched: synthetic factors, the fed
  test months.
- **Reminders.** Decision: remove Run now; Save schedule saves and then runs today's reminders immediately
  (emails included, owner accepted), still at most once per reminder. The panel shows "Active — next run tomorrow
  9:00 India time", or "Daily run not set up on this server" when `CRON_SECRET` is missing. The owner adds
  `CRON_SECRET` on Vercel (steps to be given).
- **"Unassigned" on Reporting Deadlines.**
  - Decision: who can submit uses the Upload page's own rule. Listed as **Responsible** (the activity's owning
    role) and **Can also upload** (roles that upload on its behalf, marked "(on behalf)"). Reminders go to the
    responsible people, or, when there are none, to the on-behalf uploaders. Administrators keep only their summary.
  - Decision: "No one to submit" (with a hover note naming the missing role and an Assign link to Users filtered
    to the unit, for Administrators) only when nobody but an Administrator could upload. A record not yet in says
    "Not submitted" plus days left / overdue in the status column.
- **Audit Trail.**
  - Decision: rule-based context search (option a): suggestions grouped People, Roles, Actions (plain words),
    Activities, Org units, Periods; picking one sets that filter, Enter searches the words; word forms and plain
    action names match codes ("approve/approved/approval" → `approval.decided`), case and word order ignored. No
    placeholder text. Alternative considered: AI semantic search (rejected: AI service down, audit data would
    leave the app).
  - Decision: linked filters. "Only my activity" greys out Role and User (Action stays usable). Role narrows Users;
    a User sets Role, and a person with several roles gives "Any of theirs" with the Role list narrowed to theirs;
    Action narrows to actions the chosen role or person has performed.
  - Decision: filters apply on change (typed boxes after half a second); no Apply button; Clear filters appears
    once anything is set.
- **Split page.** Decision: Undo / Redo buttons in the header and Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z for every change
  to the split (pages, add / remove bill, activity, leave out); history lives until confirm or leaving; ← / →
  turn pages. While focus is in a text box or select, both behave normally for that field.
- **Side panels (every panel).** Decision: Expand shown from 768px up (was 1900px), expanding to the whole window
  over the sidebar and top bar; Collapse or Esc returns. A drag handle on the inner edge resizes from about 360px
  to the full window; double-click resets; ← / → on the focused handle resize in steps. Each kind of panel
  remembers its own width in this browser (`localStorage`); expanded state is not remembered.

## Surfaced assumptions
- The Deadlines owner list and the Upload page used different rules; an Employee uploading for a Project Manager
  made a unit look "Unassigned". They are now one rule.
- "Run now" existed because the daily trigger is not configured anywhere yet; on Vercel it needs `CRON_SECRET`.
- Picking the next financial year repeatedly walked the review to 2029-30; the list itself, not the data, caused it.

## Out of scope
- Storing the submitter's role at upload time (would need a migration).
- AI search over the audit log.
- Removing the fed test months or synthetic factors.
