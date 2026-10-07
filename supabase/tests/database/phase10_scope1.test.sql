-- Phase 10: the Scope 1 fuels are configuration (migration 0017) — metric, fields, formula, allowed units
-- and an evidence type each, with no code anywhere knowing their names.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select set_eq(
  $$select m.code from public.esg_metrics m join public.scopes s on s.id = m.scope_id
    where s.code = 'SCOPE_1' and m.deleted_at is null$$,
  array['DIESEL_CONSUMPTION', 'PETROL_CONSUMPTION', 'CNG_CONSUMPTION', 'LPG_CONSUMPTION',
        -- migration 0035: coal by grade, LNG, PNG, and fugitive top-ups by gas
        'COAL_ANTHRACITE', 'COAL_BITUMINOUS', 'COAL_SUB_BITUMINOUS', 'COAL_LIGNITE', 'LNG_CONSUMPTION',
        'PNG_CONSUMPTION', 'REFRIGERANT_R22', 'REFRIGERANT_R32', 'REFRIGERANT_R410A', 'REFRIGERANT_R134A',
        'SF6_TOPUP'],
  'the Scope 1 activities are the fuels, coal by grade and refrigerant top-ups by gas');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_1'
     and (not m.requires_calculation or not m.requires_conversion_factor)),
  0,
  'every Scope 1 fuel is calculated from a conversion factor');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_1'
     and not exists (select 1 from public.calculation_formulas f
                      where f.metric_id = m.id and f.status = 'active')),
  0,
  'every Scope 1 fuel has an active formula');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_1'
     and (select count(*) from public.metric_field_requirements r
           where r.metric_id = m.id and r.is_required) < 4),
  0,
  'every Scope 1 fuel asks for quantity, unit, invoice number and billing period');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_1'
     and not exists (select 1 from public.validation_rules v
                      where v.metric_id = m.id
                        and v.rule_definition->>'check' = 'allowed_units')),
  0,
  'every Scope 1 fuel restricts the units it accepts');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_1'
     and not exists (select 1 from public.document_type_metric_mappings map
                      where map.metric_id = m.id)),
  0,
  'every Scope 1 fuel has an evidence document type');

select * from finish();
rollback;
