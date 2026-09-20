-- Phase 11: Scope 2 (.grill/phase-11-scope-2-decisions.md, PRD §21). Grid electricity was seeded in 0009;
-- renewable electricity is its own metric with its own Admin-entered factor, so grid and renewable stay
-- distinguishable without the calculation engine choosing a factor from a value a person typed.

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, 'RENEWABLE_ELECTRICITY', 'Renewable Electricity', 'kWh', s.id, true, true, 'monthly',
       'Purchased or self-generated renewable electricity evidenced by a certificate or generation statement.'
from public.esg_categories c
join public.scopes s on s.code = 'SCOPE_2'
where c.name = 'Fuel & Energy';

insert into public.metric_field_requirements (metric_id, field_key, field_label, data_type, is_required)
select m.id, f.field_key, f.field_label, f.data_type::public.field_data_type, f.is_required
from public.esg_metrics m
join (values
  ('consumption', 'Consumption', 'number', true),
  ('unit', 'Unit', 'unit', true),
  ('billing_period', 'Billing period', 'text', true),
  -- Which renewable source (solar, wind, REC): recorded for the reviewer, never used to pick a factor.
  ('source_classification', 'Source classification', 'text', false)
) as f (field_key, field_label, data_type, is_required) on true
where m.code = 'RENEWABLE_ELECTRICITY';

insert into public.document_types (code, name, description)
values ('RENEWABLE_CERTIFICATE', 'Renewable Energy Certificate',
        'Renewable energy certificate or generation statement evidencing renewable electricity.');

insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, m.id
from public.document_types dt, public.esg_metrics m
where dt.code = 'RENEWABLE_CERTIFICATE' and m.code = 'RENEWABLE_ELECTRICITY';

insert into public.calculation_formulas
  (metric_id, version, formula_type, formula_definition, effective_from, status)
select m.id, 1, 'direct_multiply',
       '{"inputs": ["activity_value"], "op": "multiply_by_factor"}'::jsonb,
       date '2000-01-01', 'active'
from public.esg_metrics m
where m.code = 'RENEWABLE_ELECTRICITY';

insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'logical',
       '{"check": "allowed_units", "field": "unit", "units": ["kWh", "Units", "MWh"]}'::jsonb,
       'hard_fail', 'Unit must be an energy unit for renewable electricity.'
from public.esg_metrics m where m.code = 'RENEWABLE_ELECTRICITY';

-- One certificate or statement per project and month, like the grid bill.
insert into public.validation_rules (metric_id, rule_type, rule_definition, severity, description)
select m.id, 'period', '{"check": "duplicate_period"}', 'flag',
       'Another renewable record is already in this project and period.'
from public.esg_metrics m where m.code = 'RENEWABLE_ELECTRICITY';

-- Bills sometimes print MWh; the engine normalises it, so validation accepts it for grid too.
update public.validation_rules
set rule_definition = jsonb_set(rule_definition, '{units}', '["kWh", "Units", "MWh"]'::jsonb)
where rule_definition->>'check' = 'allowed_units'
  and metric_id = (select id from public.esg_metrics where code = 'GRID_ELECTRICITY');
