-- Phase 11: Scope 2 is configuration too (migration 0018) — grid and renewable electricity are separate
-- activities, each with its own fields, formula, units rule and evidence type.
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

select set_eq(
  $$select m.code from public.esg_metrics m join public.scopes s on s.id = m.scope_id
    where s.code = 'SCOPE_2' and m.deleted_at is null$$,
  array['GRID_ELECTRICITY', 'RENEWABLE_ELECTRICITY', 'PURCHASED_STEAM', 'PURCHASED_HEAT_COOLING'],
  'Scope 2 covers grid and renewable electricity, and purchased steam, heat and cooling (migration 0038)');

select is(
  (select count(*)::int from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
   where s.code = 'SCOPE_2'
     and (not m.requires_calculation
          or not exists (select 1 from public.calculation_formulas f
                          where f.metric_id = m.id and f.status = 'active')
          or not exists (select 1 from public.document_type_metric_mappings map
                          where map.metric_id = m.id))),
  0,
  'each Scope 2 activity is calculated, has an active formula and an evidence type');

select is(
  (select count(*)::int from public.metric_field_requirements r
    join public.esg_metrics m on m.id = r.metric_id
   where m.code = 'RENEWABLE_ELECTRICITY' and r.field_key = 'source_classification'
     and r.is_required),
  0,
  'source classification is recorded but never required');

select results_eq(
  $$select v.rule_definition->'units' from public.validation_rules v
     join public.esg_metrics m on m.id = v.metric_id
    where m.code = 'GRID_ELECTRICITY' and v.rule_definition->>'check' = 'allowed_units'$$,
  array['["kWh", "Units", "MWh"]'::jsonb],
  'electricity accepts the spellings bills actually print');

-- A factor of zero is legitimate (market-based renewable electricity); a negative one is not.
select ok(
  (select count(*) from public.conversion_factor_versions where value < 0) = 0,
  'no conversion factor has a negative value');

select * from finish();
rollback;
