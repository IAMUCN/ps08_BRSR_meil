# Grill: Phase 14 — BRSR mapping

Date: 2026-09-21

## Intent

Map every metric built in Phases 10–13 to its BRSR indicator through configuration, give the Admin a page to
maintain those mappings, and build the readiness tree (Section → Indicator → Metric → Calculation →
Evidence) that is the backbone of the signature drill-down (`06_IMPLEMENTATION_PLAN.md` Phase 14, PRD §27,
TRD §26, UI brief §21).

## Constraints

- Indicator codes and text must be verified against an authoritative BRSR source; placeholders are labelled.
- BRSR is configuration, never hard-coded questions in the UI (PRD §27).
- The tree is P0; the Readiness % score is P1 and the first thing to cut.

## Key decisions

- Decision: **the source is SEBI's BRSR format, Annexure I**, in `ps_documents/provided_docs`. Codes follow
  its numbering (A-18, P6-E3, P6-L4 …) and question text is quoted from it. **Only the nine indicators
  today's metrics feed are seeded**; the rest are added when a metric exists for them. Alternative
  considered: transcribing the whole catalogue (~100 questions, most with nothing to feed them).
- Decision: **CSR expenditure maps to Section A Q22 (CSR details) with a note** that BRSR asks for
  applicability, turnover and net worth, and the spend is supporting context. Alternatives: leave it
  unmapped as an explicit gap; P8 Leadership Q2 (aspirational districts only).
- Decision: **the readiness tree is a tab on `/admin/brsr-mapping`**, for a chosen period. An indicator is
  **Complete** when every applicable mapped metric has an approved record, **Partial** when some do, and
  **Missing evidence** when none do. Alternatives: a separate page; counting records awaiting approval.
- Decision: **`is_applicable` is added to the mapping table** (deviation D15) so an Admin can switch a
  mapping off without deleting it. **The Readiness % score is deferred** to the Control Tower (Phase 16).

## Surfaced assumptions

- Fuel and electricity map to P6-E6 (GHG) only. P6-E1 (energy in joules) and P6-L1 (renewable energy
  break-up) need an energy conversion that isn't built, so they are not claimed.
- Readiness looks at the whole organisation for the period; per-node readiness arrives with consolidation
  (Phase 15).
- Indicators themselves are seeded configuration; the page edits mappings, not the indicator catalogue.
- A mapping edit is audited like every other configuration change.

## Out of scope

- The Readiness % score, per-org readiness, the report renderer and report drill-down (Phase 17), and the
  rest of the BRSR catalogue.
