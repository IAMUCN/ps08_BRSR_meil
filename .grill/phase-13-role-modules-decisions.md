# Grill: Phase 13 — Role-specific modules (HR, EHS, Procurement, Finance/CSR)

Date: 2026-09-21

## Intent

Prove the pipeline built for emissions also carries non-emission BRSR metrics, one module per remaining
role, with HR as the reference implementation and Journey 3 (`03_APP_FLOW.md`) passing exactly — a
genuinely low-confidence field blocks Confirm until HR reviews it, and the engine derives the percentage
HR never types (`06_IMPLEMENTATION_PLAN.md` Phase 13, PRD §23–§26, Master Approach §18–§21).

## Constraints

- Seed data first; any code beyond configuration is flagged against Rule 14. The plan itself names one
  exception: the `subtract` formula type (schema §6.7) for water.
- HR does not calculate percentages (Master Approach §18); the calculation engine does, from verified counts.
- Percentages must never be summed across projects when consolidation arrives (Phase 15).

## Key decisions

- Decision: **a derived metric's inputs all come from the same document.** A workforce statement carries
  total and women counts; a water record carries withdrawal and discharge. The formula names the field
  keys; the engine reads the verified field values and writes one `calculation_inputs` row per input
  (schema §10.4). Alternative considered: pairing separate records by project + period through
  `calculation_inputs.source_esg_record_id` (more realistic for water, much more machinery).
- Decision: **a `percentage` formula type is added** (part ÷ whole × 100) — schema deviation D14. Explicit
  and reviewable; `custom` stays reserved rather than becoming a small formula language.
- Decision: **HR goes live with two metrics** — employees by gender (% women) and training coverage
  (% trained).
- Decision: **one metric per other module**: EHS water consumption (withdrawal − discharge, the `subtract`
  path), Procurement MSME share of spend (percentage), Finance/CSR CSR expenditure, plus fines and
  penalties — both recorded amounts with no calculation.
- Decision: **no new screens.** Results appear where records already appear — the verify summary and the
  approval drawer — with the trace extended to list its inputs. Module dashboards wait for the Control
  Tower (Phase 16).
- Decision: **counts are stored, percentages are derived.** `calculation_inputs` keeps the part and the
  whole per record, so Phase 15 re-derives a consolidated percentage from summed counts.

## Surfaced assumptions

- For a multi-input metric the record's activity value is the formula's whole (percentage) or first input
  (subtract): total employees, total spend, water withdrawn. It is what validation's quantity and anomaly
  checks look at.
- Workforce counts have no unit field; their calculation records the inputs as `count`.
- Validation gains one configurable check, `not_greater_than` (women ≤ total, trained ≤ total, MSME spend
  ≤ total spend as hard fails; discharge ≤ withdrawal as a review flag).
- No conversion factor is involved in any of these metrics; nothing waits on MEIL's factor data.
- Water is recorded in kilolitres; m³ is accepted and normalised (1 m³ = 1 KL).

## Out of scope

- Turnover, board/KMP composition, safety, air emissions, waste by category, local/SHG procurement, CSR
  beneficiaries and aspirational-district spend — each is further configuration on the same machinery.
- Cross-record inputs, module dashboards (Phase 16) and BRSR mapping of these metrics (Phase 14).
