# Grill: tree selector, invited-user edits, role codes, notification pop-ups, automatic period closing

Date: 2026-11-01

## Intent

The owner's six-part feedback list: choose org units from one tree selector, calm the Shared tag, correct the
name or email of someone invited, clear errors for role codes, notifications that actually pop up, and reporting
periods that close by themselves.

## Constraints

- Hosted migrations and pushes wait for the owner's go-ahead.
- No organisation a person may not read is shown to them.
- Existing data is not deleted.

## Key decisions

- Decision: a period closes after its submissions close date, at midnight India time; the end date only when no
  close date is set. Reason: on hosted, August ends 31 Aug and its submissions run 1 Sep to 15 Oct; closing on the
  end date would shut it before submissions open. Alternative considered: the end date, as first asked.
- Decision: a closed period refuses new uploads, new evidence files and confirming a multi-bill split. Records
  already uploaded still finish verification, correction and approval; approved records stay locked. Reason: the
  deadline means "get your documents in"; reviewers are not penalised. Alternative considered: freezing everything.
- Decision: reopening, or opening a draft whose date has passed, needs a new submissions close date of today or
  later, audited with the reason. Reason: otherwise the job closes it again at once. Alternative considered: stays
  open until closed by hand.
- Decision: the next period is not opened automatically. Super Admins are notified when a period closes, with the
  unapproved and unresolved counts; unresolved issues do not delay the close.
- Decision: the closing runs as a scheduled job inside the database (agent's), and uploads also check the date.
- Decision: "invited Startus employees" means people whose status is Invited. Edit changes name and email only,
  for people the caller already manages, enforced on the server. A changed email cancels the old link and sends a
  new one; the address must be free; the sign-in record changes with it.
- Decision: the "group name" was the unit's rename box above Expected Submissions. Name and code become plain text
  with an Edit button; a tree selector heads the Expected Submissions card, in step with the big tree.
- Decision: "SAD" is the Shared tag. Its glow becomes a soft tint and a thin border. A selected shared unit is
  highlighted under every parent, the clicked copy fully and the others lightly; a collapsed parent shows a small
  marker. This reverses the 2026-10-11 rule that only the clicked drawing is highlighted.
- Decision: "Observation Monitoring" is Submission Monitoring. It and Data Explorer share a filter bar, so the
  tree selector replaces the dropdown once there. Other organisation dropdowns stay for now.
- Decision: the filters leave out units the person cannot read. On the Organization page, units above the person's
  own stay greyed as that page already shows them, and siblings stay hidden. Inactive units show, marked Inactive.
  Selecting a parent keeps showing it and everything beneath. Reason: the brief asks both to show inaccessible
  nodes and not to expose them; a grey name still exposes.
- Decision: notifications are checked every 5 seconds while the tab is visible, and at once on return; a hidden tab
  does not check. Reason: the owner chose 5 seconds over 15; each check is real work, so hidden tabs pause.
- Decision: notifications from while the person was away do pop up: up to 3 separately, more as one summary linking
  to Notifications. Each pops up once per account, read ones never, from a time stored on the account; the start
  point is set at deployment so old backlogs do not appear. Alternative considered: silent, in the bell only.
- Decision: pop-ups last about 6 seconds and open the notification's page when clicked. Mark all read sits in the
  bell's header while something is unread.

## Surfaced assumptions

- "Startus", "SAD" and "Observation Monitoring" appear nowhere in the app; each is read as above and confirmed.
- The empty Name box in the owner's screenshot looks hand-cleared: the code fills it with the unit's name.

## Open questions

- On deployment August closes at once (15 Oct has passed) and no other period exists, so uploads pause until a
  Super Admin creates and opens the next one.

## Out of scope

- Instant delivery through a live connection (session cookies are hidden from browser code by design).
- Opening the next period automatically.
- Tree selectors on Reports, the Control Tower and the Scope pages.
