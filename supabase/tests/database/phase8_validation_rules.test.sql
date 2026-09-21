-- Phase 8: validation rules are seeded configuration (migration 0015).
begin;
create extension if not exists pgtap with schema extensions;

select plan(5);

-- Four rules apply to every metric; the per-metric ones grow as fuels are added (Phase 10 onward).
select is(
  (select count(*)::int from public.validation_rules where is_active and metric_id is null),
  4,
  'the four global validation rules are seeded');

select results_eq(
  $$select distinct rule_definition->>'check' from public.validation_rules order by 1$$,
  array['allowed_units', 'billing_period_overlap', 'duplicate_invoice', 'duplicate_period',
        'history_ratio', 'not_greater_than', 'range'],
  'every rule names a check kind the engine implements');

select ok(
  not exists (select 1 from public.validation_rules where rule_type = 'anomaly' and severity <> 'flag'),
  'anomaly rules are review flags, never hard fails (Master Approach §23)');

select ok(
  exists (select 1 from public.validation_rules r join public.esg_metrics m on m.id = r.metric_id
          where m.code = 'GRID_ELECTRICITY' and r.rule_definition->>'check' = 'duplicate_period'),
  'duplicate-period flag applies to grid electricity');

select ok(
  not has_table_privilege('authenticated', 'public.validation_results', 'INSERT')
    and not has_table_privilege('authenticated', 'public.validation_rules', 'UPDATE'),
  'clients cannot write validation results or rules');

select * from finish();
rollback;
