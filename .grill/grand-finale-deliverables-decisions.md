# Grill: The Grand Finale deliverables (2026-10-09)

Date: 2026-10-09

The owner shared the five Grand Finale deliverables and asked for the gaps to be closed, leaving the demo data
to them.

| Deliverable | State after this work |
|---|---|
| Portal with BRSR Sections A, B, C and nine principles | Met (migration `0040`; `.grill/full-brsr-report-decisions.md`) |
| Multi-user workflow: role-based assignment, status tracking, reminders, three departments or plants | Built; the three-plant demonstration needs the owner's demo data |
| Validation engine catching missing, inconsistent, improbable entries | Met; the improbable check needs three earlier periods of data to fire |
| Report in prescribed format; management dashboard with completion, exceptions, multi-year KPI trends | Met with the trends card below |
| Evidence and audit-trail module with a documented assurance account | Met with `ASSURANCE.md` |

## What was built

- **`ASSURANCE.md`** (repo root): the controls an assurer relies on, each BRSR Core KPI marked evidence-backed
  or typed with its source evidence, an eight-step walkthrough of testing a figure, what can be handed over,
  the limits, and where each control is implemented and tested. The KPI list is taken from the L&T reference
  report's assurance statement; SEBI's own Core annexure is not in the repository.
- **KPI trends by financial year** on the Control Tower: Scope 1, 2, 3 and total emissions, water consumed and
  waste generated, for up to five financial years, for the org unit in context and everything beneath it.
  Approved records only. A year with no approved data is empty, never zero, and no change is claimed across an
  empty year. A table with a bar and the change on the year before in each cell (`lib/dashboard/trends.ts`,
  `records.kpiTrends`). All six are "less is better", so a rise is shown as adverse.
- **Reminders for missing submissions:** Submission Monitoring → missing submissions has "Send reminders". Each
  person whose role owns a missing activity and who is assigned at that org unit or above gets one in-app
  notification listing what is missing, and an email when Brevo is configured. At most one per person per
  period per day; audited as `submission.reminders_sent`. **Sent when an Admin presses the button — there is no
  scheduler.** The automatic deadline notice (three days before a period closes) is unchanged.

## Not built

- A scheduled (daily) reminder: needs a job runner, which arrives with deployment.
- A trend for social KPIs (safety rate, % women): the card covers the environmental headline figures.
- A read-only assurer role; a supporting file on a typed disclosure.

## Checked

Web unit 98/98 (new `kpi-trends.test.ts`), lint, typecheck, format. The trend query was run on the local
database (three financial years of approved data came back) and on hosted read-only (no approved data yet);
the reminder query ran on both. **Not run:** the reminder mutation through the app (no email was sent), the
end-to-end suite, a browser view of the trends card.
