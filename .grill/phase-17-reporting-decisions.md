# Grill: Phase 17 — Reporting

Date: 2026-09-22

## Intent

Generate a consolidated BRSR report for an org node and a period or financial year, non-blocking, rendered to
PDF with headless Chromium, every run kept; and a Report Detail page where any reported value drills down
Report Value → BRSR Indicator → ESG Metric → Calculation → Verified Activity Data → Original Document without
leaving the report (`06_IMPLEMENTATION_PLAN.md` Phase 17, App Flow §4.10 and Journey 5, TRD §17).

## Key decisions

- Decision: **required indicators are Section A/B and every Essential indicator** — what SEBI makes
  mandatory; Leadership indicators are voluntary. Generation fails, with the codes named ("Report generation
  failed: 2 required BRSR indicators have no metric mapping: P1-E2, P3-E8"), if any required indicator has
  no applicable mapping. Alternatives: every seeded indicator; an Admin-set `is_required` flag.
- Decision: **a report covers one period or one April–March financial year, approved records only.** The
  report states how many records were still awaiting approval and left out. One report type, BRSR:
  indicators with their consolidated values plus a Scope 1/2/3 summary.
- Decision: **generation runs in the app after the response** (Next.js `after()`): the request records a
  pending run and returns; the job renders with `puppeteer-core` + `@sparticuz/chromium` (TRD §17; locally a
  Chromium-family browser named by `CHROMIUM_EXECUTABLE_PATH`). A run still pending or generating after
  10 minutes is marked failed. The Admin is notified either way. Alternative: a separate polling worker.

## How a report stays true to itself

- `report_runs.snapshot_data` holds every reported value and, per indicator and metric, the contributing
  `esg_record_id`s **with the calculation row each one used** (schema §13.1). Calculations are append-only,
  so the drill-down shows the exact trace the report used, and says so if the record has been recalculated
  since.
- Values come from the same consolidation rules as Phase 15 (percentages from summed counts, recorded
  amounts normalised, units never mixed).
- The PDF is stored in a private `reports` bucket (migration `0025`) and served only through an
  Admin-checked route, like evidence.

## Found while verifying

- The first generated report printed waste **emissions** under P6-E8, which asks for the waste **quantity**.
  A mapping now says which value it reports — the calculated result or the verified quantity (deviation
  D18, migration `0026`); waste → P6-E8 reports the quantity, waste → P6-L4 the emissions. Kilogram figures
  show their tonne equivalent, as the scope dashboards already do.

## Surfaced assumptions

- `report_runs.reporting_period_id` becomes nullable with a `financial_year` column beside it — exactly one
  is set (deviation D17).
- Generating needs `report.generate`; a non-Admin holding it could only report inside their own
  assignments (the check exists even though only Admins hold it today).
- The PDF is a faithful rendering of the snapshot; drill-down lives in the web Report Detail page.

## Out of scope

- Comparing against a prior period's report (App Flow secondary action), other report types (ESG,
  consolidated), scheduled reports and the BRSR XBRL filing format.
