# Grill: Phase 16 — Admin Control Tower

Date: 2026-09-22

## Intent

Replace the Admin dashboard's placeholders with real figures (UI brief §13.1, Master Approach §33): the
header strip, the completion-pipeline KPI row, the scope and readiness row, and the issue panel — every
card and row clickable, landing on correctly pre-filtered data. Build Submission Monitoring and the ESG
Data Explorer (`06_IMPLEMENTATION_PLAN.md` Phase 16).

## Key decisions

- Decision: **expected submissions are Admin configuration** — a `submission_expectations` table (org unit ×
  metric, deviation D16). An expectation applies to every period whose type matches the metric's frequency.
  It is the denominator of Submission Completion % and Scope 1/2/3 Completion %, and what "projects with
  missing submissions" counts. Alternatives: derive from recent history (a project that never submitted is
  never "missing"); every project × every metric its roles own (over-counts).
- Decision: **BRSR Readiness % is a weighted composite** of submission, evidence, validation and approval
  completion and the share of mapped indicators that are Complete, weighted equally by default in
  `org_settings.brsr_readiness_weights`. The card's info drawer lists every component and weight and says
  plainly it is an internal indicator, not an official score.
- Decision: **the org/period context lives in the URL** — a picker at the top of the Control Tower, carried
  into Submission Monitoring and the Data Explorer as filters by every card and issue link. No hidden
  session state; the queues read their initial filter from the URL.

## Definitions (for the node's subtree and the chosen period)

- Submission Completion = expectations with at least one non-rejected record ÷ expectations.
- Evidence Coverage = records whose primary document was read by OCR ÷ records.
- Validation Completion = verified records that passed validation (validated, or a flag an Admin accepted)
  ÷ verified records.
- Approval Completion = approved ÷ records that passed validation.
- Scope N Completion = expectations for Scope N metrics with an approved record ÷ Scope N expectations;
  Scope 3 also says "X of Y categories active".
- A card with no denominator shows "—" with the reason, never 0 % or 100 %.

## Surfaced assumptions

- "Organizations" in the header strip stays subsidiary/entity nodes (Phase 4).
- The Approval Queue already exists (pulled forward in Phase 8, A10) with self-approval refused server-side;
  this phase proves it for the Phase 13 records and adds the RLS-layer check.
- Expectations are edited from the Organization page's node panel — the node is where they belong.

## Out of scope

- A global, remembered context switcher across every admin page; Submission Monitoring for Corporate ESG
  under `/app` (App Flow §2.3); report generation (Phase 17).
