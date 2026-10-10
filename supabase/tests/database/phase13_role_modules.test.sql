-- Phase 13: the role-specific modules are configuration (migrations 0020–0021) — each module's evidence
-- belongs to its role, derived metrics name their inputs as verified fields, and nothing needs a factor.
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

select results_eq(
  $$select r.code::text from public.esg_categories c join public.roles r on r.id = c.owning_role_id
    where c.name in ('Workforce', 'Water', 'Procurement', 'CSR & Compliance') order by r.code$$,
  array['ehs', 'finance_csr', 'hr', 'procurement'],
  'each module belongs to the role that owns its evidence');

select is(
  (select count(*)::int from public.esg_metrics m
     join public.esg_categories c on c.id = m.category_id
    where c.name in ('Workforce', 'Water', 'Procurement', 'CSR & Compliance')
      and (m.requires_conversion_factor or m.scope_id is not null)),
  0,
  'module metrics are not emissions: no factor, no scope');

-- Every field a multi-input formula names is a required number on that metric — or verification could
-- confirm a record the engine then cannot calculate.
select is(
  (select count(*)::int
     from public.calculation_formulas f
     cross join lateral (
       select jsonb_array_elements_text(f.formula_definition->'inputs') as k
        where f.formula_type = 'subtract'
       union all
       select f.formula_definition->>k2 from (values ('part'), ('whole')) v (k2)
        where f.formula_type = 'percentage'
     ) keys
    where f.status = 'active'
      and not exists (select 1 from public.metric_field_requirements r
                       where r.metric_id = f.metric_id and r.field_key = keys.k
                         and r.data_type = 'number' and r.is_required)),
  0,
  'every formula input is a required number field of its metric');

select results_eq(
  $$select m.code, f.formula_type::text from public.calculation_formulas f
      join public.esg_metrics m on m.id = f.metric_id
     where m.code in ('WORKFORCE_GENDER', 'WATER_CONSUMPTION', 'MSME_PROCUREMENT') order by m.code$$,
  $$values ('MSME_PROCUREMENT', 'percentage'), ('WATER_CONSUMPTION', 'subtract'),
           ('WORKFORCE_GENDER', 'percentage')$$,
  'HR and procurement derive percentages; water is withdrawal − discharge');

select is(
  (select count(*)::int from public.esg_metrics
    where code in ('CSR_EXPENDITURE', 'FINES_PENALTIES') and requires_calculation),
  0,
  'CSR expenditure and fines are recorded amounts, not calculations');

select is(
  (select count(*)::int from public.validation_rules
    where rule_definition->>'check' = 'not_greater_than'
      and metric_id in (select id from public.esg_metrics
                         where code in ('WORKFORCE_GENDER', 'WORKFORCE_TRAINING', 'MSME_PROCUREMENT'))
      and severity = 'hard_fail'),
  4,
  'a part can never exceed its whole for headcount, training and MSME share');

select is(
  (select count(*)::int from public.esg_metrics m
     join public.esg_categories c on c.id = m.category_id
    where c.name in ('Workforce', 'Water', 'Procurement', 'CSR & Compliance')
      and not exists (select 1 from public.document_type_metric_mappings map
                       where map.metric_id = m.id)),
  0,
  'every module metric has an evidence type');

select * from finish();
rollback;
