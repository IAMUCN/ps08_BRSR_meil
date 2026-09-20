# Grill: Phase 11 — Scope 2

Date: 2026-09-20

## Intent

Purchased electricity works end to end on exactly the framework Phase 10 built: an electricity bill goes
upload → OCR → verification → validation → calculation → a Scope 2 total with the same drill-down
(`06_IMPLEMENTATION_PLAN.md` Phase 11, PRD §21). The plan is explicit that this phase should be
configuration plus a page — new query or engine code here would mean Phase 10 wasn't reusable (Rule 14).

## Constraints

- Grid and renewable electricity must be distinguishable when the evidence supports it (PRD §21,
  Master Approach §29).
- Factor values stay Admin-entered with a verified source (Phase 9).
- The Scope 2 dashboard is the same component as Scope 1 (UI brief's "same page template").

## Key decisions

- Decision: **Renewable Electricity is its own metric with its own factor**, alongside Grid Electricity,
  each with consumption, unit, billing period and an optional source classification. The factor is chosen
  by metric, exactly as it already is — no engine change, and no factor keyed to a value a person typed.
  The Renewable Energy Certificate is its own document type (Master Approach §29's evidence map).
  Alternative considered: one Electricity metric whose factor is selected from the verified
  grid/renewable classification; recording renewable as evidence only.
- Decision: **a conversion factor may be exactly zero.** Market-based renewable reporting uses
  0 kgCO2e/kWh, and the source reference is still required. Negative values stay refused. Without this the
  record would never calculate, or an Admin would have to invent a token number.
- Decision: **the scope dashboards break totals down by activity as well as by org unit** — diesel /
  petrol / CNG / LPG, grid / renewable — in the shared component, so Scope 1 gains it too and Scope 3's
  many categories are already served. Alternative considered: leaving it to Phase 16's Control Tower.
- Decision: **the user dashboard shows every scope the user's project has data for** (Scope 1 and Scope 2
  side by side, same approved / awaiting-approval split), rather than Scope 1 alone.
- Decision: **`/admin/scope-2` is the Phase 10 component with a different scope code**; the shared
  record-trace server action moves to `lib/scope/actions.ts` so both pages use one copy.
- Decision: **grid and renewable both allow kWh, Units and MWh** (the engine normalises MWh); the
  one-bill-per-period flag applies to both.

## Surfaced assumptions

- Grid Electricity's `source_classification` field stays optional and informational — it does not choose a
  factor; a bill that is actually renewable belongs under the Renewable Electricity activity.
- Renewable records still carry a factor and a calculation (usually zero), so the lineage chain and the
  BRSR mapping in Phase 14 have a row to point at, rather than a missing calculation.
- Phase 11 adds no new tRPC procedure and no new engine branch; the only new code is the page, the
  activity breakdown in the shared dashboard and the zero-factor allowance.

## Out of scope

- Market-based versus location-based reporting treatment (a BRSR mapping question, Phase 14), other
  purchased energy (steam, cooling — same pattern when needed), Scope 3 (Phase 12).
