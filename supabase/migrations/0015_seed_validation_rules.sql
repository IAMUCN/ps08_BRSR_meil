-- Phase 8: validation rule configuration (.grill/phase-8-validation-engine-decisions.md).
-- Each row is one configured check: rule_definition.check names a check kind implemented in
-- apps/web/lib/validation/checks.ts; the other keys are its parameters. metric_id null = every metric.
-- Structural checks that aren't configurable (required fields, project in scope, evidence attached and
-- readable) run as built-ins and are recorded with validation_rule_id null (schema §9.4).

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
values
  -- Logical: a zero or negative quantity is never real activity (PRD §29E).
  (null, 'logical', '{"check": "range", "field": "activity_value", "min_exclusive": 0}', 'hard_fail',
   'Quantity must be greater than zero.'),
  -- Period: the billing date or range must overlap the reporting period.
  (null, 'period', '{"check": "billing_period_overlap", "field": "billing_period"}', 'hard_fail',
   'Billing period must fall in the reporting period.'),
  -- Period: the same invoice number twice for one project, period and activity is reviewed, not rejected.
  (null, 'period', '{"check": "duplicate_invoice", "field": "invoice_number"}', 'flag',
   'Invoice number already recorded for this project, period and activity.'),
  -- Anomaly: compare with the project's own history (Master Approach §23 — a review flag, never a fail).
  (null, 'anomaly',
   '{"check": "history_ratio", "field": "activity_value", "max_ratio": 2, "min_periods": 3, "lookback_periods": 12}',
   'flag', 'Value far from this project''s usual level.');

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', v.units),
       'hard_fail', v.description
from (values
  ('DIESEL_CONSUMPTION',
   '["L", "Ltr", "Ltrs", "Litre", "Litres", "Liter", "Liters", "KL", "Kilolitre"]'::jsonb,
   'Unit must be a volume unit for diesel.'),
  ('GRID_ELECTRICITY', '["kWh", "Units"]'::jsonb,
   'Unit must be kWh (bills may print "Units").')
) as v (code, units, description)
join public.esg_metrics m on m.code = v.code;

-- One grid-electricity bill per project and month is expected; several diesel invoices are normal.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'period', '{"check": "duplicate_period"}', 'flag',
       'Another bill is already recorded for this project and period.'
from public.esg_metrics m where m.code = 'GRID_ELECTRICITY';
