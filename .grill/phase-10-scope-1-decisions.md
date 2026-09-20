# Grill: Phase 10 — Scope 1

Date: 2026-09-20

## Intent

The first complete vertical slice: a fuel invoice goes upload → OCR → verification → validation →
calculation → a Scope 1 number that an Admin can see, drill into and trace back to the original document,
with no manual database steps (`06_IMPLEMENTATION_PLAN.md` Phase 10, PRD §20, App Flow §2.2).

## Constraints

- Scope 1 coverage is configuration: fuels, their fields, formulas and factors are data, never code
  (PRD §20, Rule 3).
- Totals are queries over `calculations`, not stored aggregates (schema §13's consolidation-as-view
  principle, extended by the plan).
- The UI brief warns against chart-first dashboards that bury the table, and against decorative numbers.

## Key decisions

- Decision: **seed Petrol, CNG and LPG** alongside the existing Diesel metric, each with the same four
  fields (quantity, unit, invoice number, billing period), a `direct_multiply` formula, an allowed-units
  validation rule and a shared "Fuel Invoice" document type. The OCR worker needs no change: its
  extraction profiles are keyed by field, not by metric. LNG and coal follow the same pattern when MEIL
  asks. Alternative considered: diesel only; all six PRD fuels now.
- Decision: **no placeholder factor values, even though the Phase 10 plan permits clearly-marked ones.**
  Phase 9's rule stands: factors are entered by an Admin with the source they verified. The Scope 1
  dashboard shows an honest empty state until then. Recorded as a deliberate departure in
  `APP_FLOW_DEVIATIONS.md`. Reason: a flagged placeholder in a hosted environment is still a number
  someone can report.
- Decision: **the headline total counts approved records only**, with "awaiting approval" and "not
  calculated" shown beside it as separate figures, so nobody mistakes an unreviewed number for a
  reportable one and the gaps stay visible. Alternative considered: everything calculated; an Admin toggle.
- Decision: **`/admin/scope-1` stays Admin-only** (App Flow §2.2). Everyone else sees their own project's
  Scope 1 total on their dashboard, scoped to their assignment — never an organisation-wide figure.
- Decision: **drilling goes all the way to the evidence**: Organisation → every level of the configured
  hierarchy that exists → contributing records, breadcrumb retained, and a record opens its calculation
  trace and the original document in a drawer. Phase 17 adds the BRSR-indicator levels above it.
- Decision: **totals are grouped by result unit and never mixed.** For CO2e units the kilogram total is
  shown with the tonne figure beside it (1 t = 1000 kg is arithmetic, not an emission factor); two
  incompatible units are listed separately rather than added.
- Decision: **charts are inline SVG bars using the brief's chart tokens**, table first, no charting
  dependency. Alternative considered: adding Recharts now for Phases 15–17.
- Decision: **mass units join the normalisation table** (kg/kilogram(s), t/MT/tonne(s)) because CNG and LPG
  are measured by weight. Still physical constants in code, never factors.

## Surfaced assumptions

- `scope.getTotal` is parameterised by scope code, so Phase 11 (Scope 2) and Phase 12 (Scope 3) reuse it
  unchanged; if Phase 11 needs new query code, that is a defect in this phase (plan Rule 14).
- A record contributes to a scope through its metric's `scope_id`, carried onto the `calculations` row at
  calculation time.
- Trend is the last 12 reporting periods that have any calculation for the scope.

## Out of scope

- LNG, coal and other fuels (same pattern, seeded when needed), Scope 2 and Scope 3 dashboards
  (Phases 11–12), consolidation snapshots (Phase 15), BRSR-indicator drill-down and report export
  (Phases 14/17), the Admin Control Tower's completion cards (Phase 16).
