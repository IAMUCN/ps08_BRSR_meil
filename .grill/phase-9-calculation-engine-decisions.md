# Grill: Phase 9 — calculation engine and conversion factors

Date: 2026-09-20

## Intent

Turn a validated record into a reproducible number: normalise the verified unit, pick the factor version
that was effective for the record's reporting period, apply the metric's formula, and store a trace that
lets anyone re-derive the result years later (`06_IMPLEMENTATION_PLAN.md` Phase 9, TRD §24/§25,
schema §10). No AI anywhere on this path, ever.

## Constraints

- Factor values are regulatory data marked **[VERIFY AGAINST AUTHORITATIVE SOURCE]** in the PRD/TRD; the
  platform defines the storage and versioning mechanism, not the numbers.
- A stored calculation must stay reproducible: a factor version already used by a calculation can never
  change its value or units (schema §19.3 trigger is the backstop).
- Calculation is deterministic TypeScript, one central engine, no per-screen maths (PRD §30).

## Key decisions

- Decision: **no factor values ship in a migration.** `/admin/conversion-factors` starts empty with the
  App Flow's blocking notice ("calculations cannot run until factors exist") and an Admin enters each
  factor with its source reference. `supabase/seed.sql` (local only, never the hosted project) gets one
  clearly-labelled development factor so the local app can calculate.
  Reason: shipping numbers I chose as if MEIL had verified them is exactly the fake-data rule.
  Alternative considered: seeding IPCC/CEA defaults as `draft` for an Admin to activate.
  Amended while building: `supabase/seed.sql` cannot carry a factor either — `conversion_factor_versions`
  requires a `created_by` user and a freshly reset local database has none. Locally the Admin adds the
  factor through the page as well (README says so).
- Decision: **calculation runs when a record enters the approval queue** — inside the same transaction as
  Confirm → validation → submit for approval, and equally on the Admin's "Accept" of a flagged record.
  One call site (`submitForApproval`), so no path reaches an approver without its trace.
  Alternative considered: calculating on approval (the approver would decide without the number).
- Decision: **a missing factor never returns the record to the submitter.** It is an Admin configuration
  gap: the record still lands in Pending Approval, `calculation_status` stays `pending`, Approve is
  disabled with the reason, and Admins get a `calculation_blocked` notification. Once the factor exists an
  Admin runs `factors.recalculate` on the record.
- Decision: **`result_unit` is the factor version's `output_unit`.** The engine never invents a CO2e unit
  conversion. Alternative considered: normalising everything to kgCO2e in code.
- Decision: **never auto-recalculate.** A stored calculation keeps its factor version; a new version only
  feeds records with no current calculation. An Admin may explicitly recalculate a record that is not yet
  approved (new `calculations` row, previous row keeps its trace with `is_current = false`, audited).
  Approved records are closed to recalculation in this phase.
- Decision: **Conversion Factors lives in the Admin area only**, gated on the `factor.manage` permission
  (only the Admin role holds it today). If it is ever granted to another role, an `/app` mirror follows,
  the way Approvals did.
- Decision: **the calculation trace is visible to the submitter too** — on the verify summary and their
  own record — as well as to approvers and Admins. Editing factors stays Admin-only.
- Decision: **unit normalisation is a TS table in code** (TRD §27 says exactly that): the spellings
  Phase 8 already accepts (L/Ltr/Ltrs/Litre(s)/Liter(s), KL/Kilolitre; kWh/Units, MWh) mapped to the
  metric's canonical unit. These are physical constants, not policy — unlike factors, which are data.
  An unknown unit fails calculation with a named reason; it never guesses.
- Decision: **records already validated or approved locally are calculated once** by
  `pnpm --filter web calculate-pending` (same engine, one transaction per record, idempotent), mirroring
  `validate-pending`. Local/dev data only.
- Decision (found by the end-to-end test): **the factor lookup accepts `active` and `superseded`
  versions**, choosing by effective dates. A superseded version is the *correct* version for the periods it
  covered, so a past record recalculates to the same number after a correction; `retired` and `draft`
  versions are never selected.
- Decision: **a blocked record notifies the Admins once per reason.** The audit entry is written on every
  attempt, but a retry that hits the same gap doesn't fill every Admin's bell again.

## Surfaced assumptions

- `record_calculation_status` has no `failed` value and gains none: `pending` means "not calculated yet",
  and the blocking reason is derived live from the factor lookup (plus the audit entry and the Admin
  notification), so no enum change and no misleading state.
- `calculation_inputs` rows are written only for multi-input formulas (schema §10.4); `direct_multiply`
  stores its single input in the `calculations` row itself.
- `engine_version` is a constant in the engine module, bumped by hand whenever the maths changes.
- The result is stored unrounded (`numeric`); rounding is a display concern.

## Out of scope

- `custom` formula type (schema §6.7 reserves it, MVP does not build it), the `subtract` path's second
  record source (arrives with Phase 13's water metric), scope dashboards (Phases 10–12), consolidation
  (Phase 15) and the drill-down UI (Phase 17).
