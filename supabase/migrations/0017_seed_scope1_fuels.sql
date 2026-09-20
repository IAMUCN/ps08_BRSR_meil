-- Phase 10: the rest of the Scope 1 fuels (.grill/phase-10-scope-1-decisions.md, PRD §20's configurable
-- list). Diesel was seeded in 0009; petrol, CNG and LPG follow the identical pattern — configuration only,
-- no code changes anywhere (the OCR worker's extraction profiles are keyed by field, not by metric).
-- Factor values are still never seeded: an Admin enters them with a verified source (Phase 9 decision).

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, m.code, m.name, m.unit, s.id, true, true, 'monthly', m.description
from public.esg_categories c
cross join (values
  ('PETROL_CONSUMPTION', 'Petrol Consumption', 'L',
   'Petrol consumed in owned/controlled vehicles and equipment.'),
  ('CNG_CONSUMPTION', 'CNG Consumption', 'kg',
   'Compressed natural gas consumed in owned/controlled vehicles and equipment.'),
  ('LPG_CONSUMPTION', 'LPG Consumption', 'kg',
   'Liquefied petroleum gas consumed in owned/controlled equipment and facilities.')
) as m (code, name, unit, description)
join public.scopes s on s.code = 'SCOPE_1'
where c.name = 'Fuel & Energy';

-- Same four fields as diesel; `is_critical` stays false (no field is forced to be acknowledged yet).
insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, true
from public.esg_metrics m
join (values
  ('quantity', 'Quantity', 'number'),
  ('unit', 'Unit', 'unit'),
  ('invoice_number', 'Invoice number', 'text'),
  ('billing_period', 'Billing period / invoice date', 'text')
) as f (field_key, field_label, data_type) on true
where m.code in ('PETROL_CONSUMPTION', 'CNG_CONSUMPTION', 'LPG_CONSUMPTION');

-- One shared evidence type for the fuels that don't have their own (diesel keeps DIESEL_INVOICE).
insert into public.document_types (code, name, description)
values ('FUEL_INVOICE', 'Fuel Invoice',
        'Invoice or delivery note evidencing purchase/consumption of petrol, CNG or LPG.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from public.document_types dt
join public.esg_metrics m on m.code in ('PETROL_CONSUMPTION', 'CNG_CONSUMPTION', 'LPG_CONSUMPTION')
where dt.code = 'FUEL_INVOICE';

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'direct_multiply',
       '{"inputs": ["activity_value"], "op": "multiply_by_factor"}'::jsonb,
       date '2000-01-01', 'active'
from public.esg_metrics m
where m.code in ('PETROL_CONSUMPTION', 'CNG_CONSUMPTION', 'LPG_CONSUMPTION');

-- Allowed units: petrol is measured by volume, CNG and LPG by weight.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       jsonb_build_object('check', 'allowed_units', 'field', 'unit', 'units', v.units),
       'hard_fail', v.description
from (values
  ('PETROL_CONSUMPTION',
   '["L", "Ltr", "Ltrs", "Litre", "Litres", "Liter", "Liters", "KL", "Kilolitre"]'::jsonb,
   'Unit must be a volume unit for petrol.'),
  ('CNG_CONSUMPTION', '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]'::jsonb,
   'Unit must be a weight unit for CNG.'),
  ('LPG_CONSUMPTION', '["kg", "Kg", "KG", "Kgs", "Kilogram", "Kilograms", "MT", "Tonne", "Tonnes"]'::jsonb,
   'Unit must be a weight unit for LPG.')
) as v (code, units, description)
join public.esg_metrics m on m.code = v.code;
