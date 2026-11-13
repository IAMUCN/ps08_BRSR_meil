-- Second audit (migration 0038, .grill/audit-2-decisions.md): the remaining Scope 1/2/3 activities, air
-- emissions, the waste category field, the two report columns and the evidence guard.
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select is(
  (select count(*)::int from public.esg_metrics m
    where m.code in ('PROCESS_CO2', 'PURCHASED_STEAM', 'PURCHASED_HEAT_COOLING', 'FREIGHT_IN_LDV',
                     'FREIGHT_IN_MDV', 'FREIGHT_IN_HDV', 'FREIGHT_OUT_LDV', 'FREIGHT_OUT_MDV',
                     'FREIGHT_OUT_HDV', 'COMMUTING_BUS')
      and m.requires_calculation
      and exists (select 1 from public.calculation_formulas f where f.metric_id = m.id and f.status = 'active')
      and exists (select 1 from public.validation_rules v where v.metric_id = m.id)
      and exists (select 1 from public.document_type_metric_mappings d where d.metric_id = m.id)
      -- Commuting asks for the distance and the passengers instead of passenger-km (migration 0077).
      and (select count(*) from public.metric_field_requirements r where r.metric_id = m.id)
          = case when m.code = 'COMMUTING_BUS' then 5 else 4 end),
  10,
  'each new activity has its fields, formula, units rule and document type');

select is(
  (select array_agg(s.code order by s.code) from public.esg_metrics m join public.scopes s on s.id = m.scope_id
    where m.code in ('PROCESS_CO2', 'PURCHASED_STEAM', 'FREIGHT_OUT_HDV', 'COMMUTING_BUS')),
  array['SCOPE_1', 'SCOPE_2', 'SCOPE_3_COMMUTING', 'SCOPE_3_DOWNSTREAM_TRANSPORT'],
  'process emissions are Scope 1, steam Scope 2, downstream freight and commuting their Scope 3 categories');

select is(
  (select count(*)::int from public.scopes s join public.scopes p on p.id = s.parent_scope_id
    where p.code = 'SCOPE_3' and s.is_active),
  6, 'six of ten Scope 3 categories are active');

select is(
  (select count(*)::int from public.esg_metrics m
    where m.code in ('NOX_EMISSIONS', 'SOX_EMISSIONS', 'PM_EMISSIONS')
      and not m.requires_calculation and not m.requires_conversion_factor and m.scope_id is null),
  3, 'air emissions are recorded amounts: no factor, no calculation, no scope');

select is(
  (select count(*)::int from public.brsr_metric_mappings x
     join public.brsr_indicators i on i.id = x.brsr_indicator_id where i.code = 'P6-E6'),
  3, 'and they report under P6-E6');

select is(
  (select count(*)::int from public.esg_metrics m
    where m.deleted_at is null
      and not exists (select 1 from public.brsr_metric_mappings x where x.esg_metric_id = m.id)),
  0, 'no metric is left without a BRSR mapping');

select is(
  (select array_agg(distinct m.emission_source order by m.emission_source)
     from public.esg_metrics m join public.scopes s on s.id = m.scope_id where s.code = 'SCOPE_1'),
  array['combustion', 'fugitive', 'process'],
  'every Scope 1 activity says how it emits');
select is(
  (select count(*)::int from public.esg_metrics m join public.scopes s on s.id = m.scope_id
    where s.code = 'SCOPE_1' and m.emission_source is null),
  0, 'none is left unclassified');

select is(
  (select is_required from public.metric_field_requirements r
     join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'WASTE_DISPOSED' and r.field_key = 'waste_category'),
  true, 'a waste certificate states its category: required since migration 0086 (SEBI P6-E9)');

select has_column('public', 'conversion_factor_versions', 'gases', 'a factor version states the gases it covers');

-- The evidence guard: a record cannot be confirmed without a document.
insert into auth.users (id, email) values ('00000038-0000-4000-8000-0000000000aa', 'audit2@fixture.test');
insert into public.users (id, display_name, email)
values ('00000038-0000-4000-8000-0000000000aa', 'Audit 2 fixture', 'audit2@fixture.test');
insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, submitted_by)
select '00000038-0000-4000-8000-0000000000b1', o.id, p.id, m.id, '00000038-0000-4000-8000-0000000000aa'
from public.org_units o, public.reporting_periods p, public.esg_metrics m
where o.parent_id is null and m.code = 'DIESEL_CONSUMPTION' limit 1;

select throws_ok(
  $$update public.esg_records set verification_status = 'user_verified'
     where id = '00000038-0000-4000-8000-0000000000b1'$$,
  '23514', null, 'a record with no document cannot be verified');

insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
  file_size_bytes, file_hash, uploaded_by)
select '00000038-0000-4000-8000-0000000000d1', r.org_unit_id, r.reporting_period_id, 'audit2/p', 'a.pdf',
       'application/pdf', 1, 'h', '00000038-0000-4000-8000-0000000000aa'
from public.esg_records r where r.id = '00000038-0000-4000-8000-0000000000b1';
insert into public.esg_record_documents (esg_record_id, document_id, added_by)
values ('00000038-0000-4000-8000-0000000000b1', '00000038-0000-4000-8000-0000000000d1',
        '00000038-0000-4000-8000-0000000000aa');

select lives_ok(
  $$update public.esg_records set verification_status = 'user_verified'
     where id = '00000038-0000-4000-8000-0000000000b1'$$,
  'with its document it can');

-- Migration 0039: indicative SDG tags on the indicators.
select is(
  (select sdg_goals from public.brsr_indicators where code = 'P6-E7'), array[7, 9, 13]::smallint[],
  'the greenhouse gas indicator is tagged with energy, industry and climate action');
select throws_ok(
  $$update public.brsr_indicators set sdg_goals = array[18]::smallint[] where code = 'P6-E7'$$,
  '23514', null, 'there are seventeen goals');

select * from finish();
rollback;
