# Grill: Phase 15 — Consolidation

Date: 2026-09-22

## Intent

Roll every metric up the configured org tree — Site → Project → Business Unit → Subsidiary → Organization,
whatever levels exist — correctly for each metric type, as a query layer over current data, filterable by
year, month, org node, scope and metric (`06_IMPLEMENTATION_PLAN.md` Phase 15, PRD §31, TRD §29).

## Constraints

- No stored aggregate: consolidation is a view over current records and calculations (schema §13/TRD §29).
- The tree is walked generically; no query names a fixed chain of levels (audit finding C3).
- A non-admin's consolidated view is bounded by their own org scope.

## Key decisions

- Decision: **"year" is the Indian financial year, April–March**, as BRSR reports it. FY 2026-27 is every
  reporting period that lies inside 1 Apr 2026 – 31 Mar 2027. Alternative: calendar year.
- Decision: **approved figures are the headline; awaiting-approval figures and record counts sit beside
  them**, the same rule the scope dashboards use. Alternative: approved only.
- Decision: **one aggregation path.** Two views in migration `0023` — `org_unit_tree` (every ancestor with
  every descendant) and `consolidation_records` (what counts: verified, not rejected, with its value) — and
  the scope dashboards now read from them too. Alternative: leave the scope dashboards' own queries.

## How each metric type consolidates

- Calculated metrics (`direct_multiply`, `subtract`): the sum of results, per result unit, never mixing
  units. For water, the sum of (withdrawal − discharge) equals the sum of withdrawals minus the sum of
  discharges, so summing results is exact.
- Percentages: **re-derived from summed inputs** — Σ part ÷ Σ whole × 100 — never summed or averaged.
- Recorded amounts (no calculation — CSR, fines): the sum of verified amounts, normalised to the metric's
  unit where the unit table can (Rs/INR); anything else kept as its own row.
- Records that need a calculation but have none are counted as "not calculated", never as zero.

## Surfaced assumptions

- A deactivated org unit's records still roll up (it's frozen, not erased).
- The closure view recomputes the tree per query; fine at MEIL's hundreds of nodes, marked for a
  materialised closure if it reaches tens of thousands.
- No new screens (the plan: consumed by Phases 16–17); `consolidation.query` is the API.

## Out of scope

- The Control Tower and report views that display these figures (Phases 16–17), intensity ratios
  (per-rupee turnover), and consolidating the BRSR readiness tree per node.
