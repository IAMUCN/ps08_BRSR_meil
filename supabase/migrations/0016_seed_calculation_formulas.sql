-- Phase 9: the formula each metric is calculated with (.grill/phase-9-calculation-engine-decisions.md).
-- Configuration, not code: formula_type names the maths implemented in apps/web/lib/calculation/engine.ts
-- and formula_definition names its inputs. Conversion factor *values* are deliberately not seeded — they
-- are regulatory data an Admin enters with a source reference at /admin/conversion-factors (PRD §20/§40,
-- "[VERIFY AGAINST AUTHORITATIVE SOURCE]"), and calculation stays blocked until they exist.

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'direct_multiply',
       '{"inputs": ["activity_value"], "op": "multiply_by_factor"}'::jsonb,
       date '2000-01-01', 'active'
from public.esg_metrics m
where m.code in ('DIESEL_CONSUMPTION', 'GRID_ELECTRICITY');

-- The factor each metric resolves to is matched on conversion_factors.activity_type = esg_metrics.code,
-- so an Admin adding a factor for a new metric needs no code change.
