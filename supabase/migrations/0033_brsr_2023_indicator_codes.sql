-- Audit fix P0-3 (AUDIT_FIXES.md, SCHEMA_DEVIATIONS.md D25): migration 0022 numbered the indicators from
-- SEBI's May-2021 BRSR format. The format in force (SEBI, July 2023) inserted questions, so five of the nine
-- seeded indicators moved; the question wording did not change. Rows are renumbered in place — ids, mappings
-- and the snapshots of reports already generated keep pointing at the same indicator.
--   Section A: employees 18 → 20, CSR 22 → 24.
--   Principle 6 Essential: GHG 6 → 7, waste 8 → 9 (water discharge became its own question 4).
--   Principle 6 Leadership: Scope 3 4 → 2.
-- Unchanged: P1-E2, P3-E8, P6-E3, P8-E4.
update public.brsr_indicators i
set code = v.new_code, description = v.description
from (values
  ('A-18', 'A-20', 'Section A, IV Employees, question 20 — counts by gender (Total, Male, Female).'),
  ('A-22', 'A-24', 'Section A, VI CSR Details, question 24.'),
  ('P6-E6', 'P6-E7', 'Principle 6, Essential Indicator 7 — in metric tonnes of CO2 equivalent.'),
  ('P6-E8', 'P6-E9', 'Principle 6, Essential Indicator 9.'),
  ('P6-L4', 'P6-L2', 'Principle 6, Leadership Indicator 2.')
) as v (old_code, new_code, description)
where i.code = v.old_code;
