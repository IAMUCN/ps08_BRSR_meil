-- Migration 0041 (.grill/safety-and-water-discharge-decisions.md, D33): safety incidents and water
-- discharge answered from records.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select is(
  (select count(*)::int from public.esg_metrics m
    join public.esg_categories c on c.id = m.category_id
    join public.roles r on r.id = c.owning_role_id
    where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS') and r.code = 'ehs'
      and m.requires_calculation and not m.requires_conversion_factor
      and (select count(*) from public.metric_field_requirements f
            where f.metric_id = m.id and f.is_required) = 6
      and exists (select 1 from public.document_type_metric_mappings d
                   join public.document_types t on t.id = d.document_type_id
                  where d.metric_id = m.id and t.code = 'SAFETY_INCIDENT_STATEMENT')),
  2,
  'safety incidents for employees and for workers belong to EHS, each with its six fields and document type');

select is(
  (select array_agg(distinct f.formula_definition->>'scale') from public.calculation_formulas f
    join public.esg_metrics m on m.id = f.metric_id
    where m.code in ('SAFETY_EMPLOYEES', 'SAFETY_WORKERS') and f.status = 'active'
      and f.formula_type = 'percentage'
      and f.formula_definition->>'part' = 'lost_time_injuries'
      and f.formula_definition->>'whole' = 'person_hours'),
  array['1000000'],
  'the result is lost time injuries per one million person-hours');

select is(
  (select array_agg(v.severity::text order by v.severity::text) from public.validation_rules v
    join public.esg_metrics m on m.id = v.metric_id
    where m.code = 'SAFETY_WORKERS' and v.rule_definition->>'check' = 'not_greater_than'),
  array['flag', 'hard_fail'],
  'lost time injuries above recordable injuries fail; fatalities above them are flagged');

select is(
  (select array_agg(f.field_key order by f.field_key) from public.metric_field_requirements f
    join public.esg_metrics m on m.id = f.metric_id
    where m.code = 'WATER_CONSUMPTION' and not f.is_required
      and f.field_key in ('discharge_destination', 'discharge_treatment')),
  array['discharge_destination', 'discharge_treatment'],
  'a water record may say where the discharge went and whether it was treated');

select is(
  (select array_agg(i.code order by i.code) from public.brsr_indicators i
    where i.code in ('P3-E11', 'P6-E4') and i.answer_kind = 'data'),
  array['P3-E11', 'P6-E4'],
  'both questions are answered from records now');

select is(
  (select array_agg(m.code order by m.code) from public.brsr_metric_mappings x
    join public.esg_metrics m on m.id = x.esg_metric_id
    join public.brsr_indicators i on i.id = x.brsr_indicator_id
    where i.code in ('P3-E11', 'P6-E4') and x.is_applicable),
  array['SAFETY_EMPLOYEES', 'SAFETY_WORKERS', 'WATER_CONSUMPTION'],
  'each has its activities mapped, so a report never fails on them');

select is(
  (select count(*)::int from public.esg_metrics m
    where m.deleted_at is null
      and not exists (select 1 from public.brsr_metric_mappings x where x.esg_metric_id = m.id)),
  0,
  'no activity is left without a BRSR question');

select * from finish();
rollback;
