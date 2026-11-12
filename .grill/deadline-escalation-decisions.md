# Grill: parent-child deadline reminders, and overdue escalation up the hierarchy
Date: 2026-11-13

## Intent
The owner wants submission status and deadline pressure to follow the organisation tree. A submission is expected
from a unit (a project, a subsidiary); its owners are reminded before the deadline; the Administrator above sees
what the owners do and do not do; and when it goes overdue the alert climbs the tree one step at a time instead of
jumping to the group.

## What the code did before (read 2026-11-13)
- Reminders ran from 7 days before the due date to the day itself (the Deadlines page allows up to 14).
- Each Administrator got one flat summary of what was missing in their units and below, until the due date.
- After the due date the new mechanism sent nothing. The old escalation sweep did the rest, but it was a manual
  button ("Run Escalation Sweep") that no schedule called: it told the owners, the Project Managers at or above the
  unit (for every category, HR's included) and Corporate ESG plus the Super Admins group-wide. An Administrator of
  the unit or its subsidiary was never part of it.

## Key decisions (owner, 2026-11-13)
- Decision: an overdue submission climbs one step at a time. Alternative considered: telling every Administrator above at once.
- Decision: the owners of the activity are the first link: the Project Manager for emissions, HR for workforce, EHS for
  water and safety, Procurement for MSME spend, Finance for CSR. Each is reminded about their own activities only. The
  Employee role only if nobody holds the owning role (unchanged). The Project Manager is NOT told about other roles'
  overdue items (no FYI); the project's Administrator is the first person who sees everything. Alternative considered:
  a light FYI to the Project Manager at 3 days late.
- Decision: HR, EHS, Procurement, Finance, Corporate ESG and Project Managers are never recipients of the escalation
  chain; only Administrators and the Super Admins are.

## Built that way (agent's choices, for the owner to confirm)
- Schedule before the due date: 14, 10, 7, 5, 3, 2, 1 and 0 days; in-app on all, email on 14, 7, 3 and 0. Editable on
  Reporting Deadlines (a Super Admin). A schedule the owner already changed on hosted is left as it is.
- After the due date (days late, editable in the same place): 1 = the nearest unit Administrator (the nearest unit at or
  above the submission's unit that has an `org_admin`; units with none are skipped); 3 = also the next Administrator up;
  7 = every Administrator above and the Super Admins. Each step is sent once and also tells the steps before it, so
  an Administrator hears again as it climbs. A third Administrator level (business unit between project and
  subsidiary) joins at the last step with the Super Admins.
- The owners are reminded every day while it is overdue, in the app; by email on the three step days.
- A unit with no Administrator below the group is escalated to the Super Admins only, at the last step.
- The messages list the owner's name per line ("owner: Asha") so the Administrator knows who to ask; "no one
  assigned" when nobody holds the owning role.
- Escalation stops when the period locks (after its late-upload window), as reminders always did.
- The old escalation sweep and its button are removed (one mechanism, nothing twice). The per-task "Remind" button
  stays. The Deadlines table's "escalated" levels now follow the same days: Level 1 once the unit Administrator is
  told, Level 2 once the Super Admins are (previously 3 and 7 days, to the PM and Corporate ESG).
- Migration `0071`: `reminder_sends.days_before` may be negative (-60 to 60), kind `escalation`, and the setting gains
  `escalation`. A schedule still equal to the 7-to-0 default moves to the new default.

## Phase 2 (2026-11-13), built with the agent's choices for the owner to confirm
- **On file but stuck counts as pending, past the due date only.** A submission that is uploaded but not approved
  (not yet verified, verified and under review, awaiting approval) climbs the same chain as a missing one once the
  due date has passed, with where it is stuck on the line ("Diesel — EV project · awaiting approval · owner: Asha").
  Its owners are not reminded again (they did their part); only Administrators and the Super Admins hear of it.
  Before the due date nothing is sent for it.
- **The summary before the due date is per unit with who is behind.** One line per unit: "EV project: 2 not started,
  1 on file, not approved (Asha, Ravi)". It is triggered by something not started, as before; the on-file count is
  context. Lines are grouped by unit, not by the Administrator's direct child: the hierarchy view is the board.
- **A status board on Reporting Deadlines** ("Submission status by unit"), for Super Admins (whole tree) and
  Administrators (their units and below): one period at a time (the open one with the latest due date by default,
  a select for the others), each unit with approved / expected for it and everything beneath it, badges for overdue,
  not started and on file, "Behind: names", and its own expected submissions expandable with owner and status.
  A unit shared by several parents appears under its main parent only; units with nothing expected are left out.
  Tasks and counts come from the same data as the Deadlines table.
- Not built: a link from a reminder email straight to the board for that period (it goes to Submission Monitoring);
  a board for periods across the year; collapsing whole branches.

## Open questions
- Whether a Corporate ESG user should hear anything (they are read-only; removed from the old group-wide step).
- Whether the day-3 and day-7 messages should also go to the Employee role that uploads for a Project Manager. Today
  they do not.

## Verification (nothing here has been run against a database)
Unit tests pass (planner 18 cases incl. each step day, skipped levels, same-person-two-levels, custom days, stuck
items; board roll-up 6 cases). Not run: migration `0071`, `reminder_schedule.test.sql` (plan 11), the `loadAdminLevels`
and `deadlines.board` SQL, `phase5-reminders.mjs` (updated incl. a board section; needs the local stack and the mail
catcher), the panel and the board in a browser. Steps for MACRO72: apply `0071` after
`0070`, `pnpm db:test`, then `phase5-reminders.mjs`; on the Deadlines page set a period's due date a few days back
and press Save schedule (it runs today's reminders) to see the climb.
