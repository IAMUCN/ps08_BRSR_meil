# Grill: Phase 12 — Scope 3 foundation

Date: 2026-09-20

## Intent

Prove that Scope 3 is a configuration layer: categories are rows under the `SCOPE_3` parent
(schema §7.1), a category with evidence runs the identical upload → OCR → verify → validate → calculate
pipeline, and the dashboard says honestly how much of Scope 3 is actually covered
(`06_IMPLEMENTATION_PLAN.md` Phase 12, PRD §22, TRD §29/§42).

## Constraints

- MVP is a **basic set** of categories chosen by evidence availability — never the full GHG Protocol list,
  and never a category with no plausible document (PRD §22).
- The UI brief demands the Scope 3 card read "X of Y categories active" rather than implying coverage.
- Adding a category must not need code (TRD §42).

## Key decisions

- Decision: **two categories go live — Business Travel and Waste Generated in Operations.** Both have a
  document MEIL already issues or receives (ticket invoices, disposal certificates), and waste is the data
  the EHS module will feed in Phase 13. Alternative considered: waste alone; travel plus employee
  commuting (commuting has no invoice-like evidence).
- Decision: **the ten candidate categories from Master Approach §17 are seeded as inactive configuration**
  and two are activated, so "2 of 10 categories active" is a true statement and enabling another is a
  configuration change. Inactive categories have no metric and never appear in the upload picker.
  Alternative considered: seeding only the live ones ("2 of 2", which implies full coverage); seeding all
  fifteen GHG Protocol categories, most of which will never apply.
- Decision: **business travel is spend-based**: the activity value is the invoice amount and the factor is
  kgCO2e per rupee, because every ticket invoice prints an amount while almost none print distance.
  A distance-based activity can be added later as configuration. Alternative considered: distance-based;
  both at once.
- Decision: **waste is weight-based** (kg/tonne on the disposal certificate) with the disposal route
  recorded as a field; separate factors per route are an Admin configuration choice, not code.
- Decision: **each category belongs to the role that owns the evidence** — waste to EHS/Environment, travel
  to Finance/CSR — through `esg_categories.owning_role_id`, matching the responsibility model. Project
  Managers do not see them in the upload picker.
- Decision: **the Scope 3 page leads with the category table** (active categories with totals and record
  counts, not-yet-enabled ones clearly labelled) above the same org-unit table, chart and record
  drill-down as Scope 1 and 2.
- Decision: **`scope.getTotal` rolls a scope up through its child scopes** instead of matching one code,
  so Scope 3's categories total without a new procedure — the change is in the shared query, not a Scope 3
  branch.

## Surfaced assumptions

- A Scope 3 record still needs a conversion factor an Admin enters with its source; nothing calculates
  from a guessed factor, and an unentered factor leaves the record visibly "not calculated".
- Category totals inherit the approved-only headline rule from Phase 10.
- The document types for these categories (travel invoice, waste disposal certificate) are seeded
  alongside them; the OCR worker needs no change because its extraction profiles are keyed by field.

## Out of scope

- The remaining eight candidate categories (enabled when evidence exists), the full GHG Protocol list,
  spend-vs-distance travel refinements, the EHS and Finance/CSR module screens (Phase 13) and the BRSR
  mapping of Scope 3 (Phase 14).
