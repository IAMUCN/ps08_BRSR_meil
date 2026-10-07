-- Phase 9: calculation formulas are seeded configuration (migration 0016), factor values are not, and a
-- factor version already used by a calculation can never be mutated (schema §19.3).
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

select is(
  (select count(*)::int from public.esg_metrics m
    where m.deleted_at is null and m.requires_calculation
      and not exists (select 1 from public.calculation_formulas f
                       where f.metric_id = m.id and f.status = 'active')),
  0,
  'every calculable metric has an active formula');

-- Phase 13 added subtract and percentage; `custom` is reserved and never evaluated.
select is(
  (select count(*)::int from public.calculation_formulas where formula_type = 'custom'),
  0,
  'seeded formulas only use formula types the engine implements');

-- Factor values are never seeded by a migration: every version that exists was entered by a person and
-- carries the source they verified it against (PRD §20/§40).
select is(
  (select count(*)::int from public.conversion_factor_versions
    where created_by is null or coalesce(trim(source_reference), '') = ''),
  0,
  'every factor version names who entered it and the source it came from');

select ok(
  not has_table_privilege('authenticated', 'public.calculations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.conversion_factor_versions', 'UPDATE'),
  'clients cannot write calculations or factor versions');

-- A factor version, a record and a calculation that uses it.
create temporary table ids as
with u as (select id from public.users limit 1),
factor as (
  insert into public.conversion_factors (activity_type, name)
  values ('TEST_ACTIVITY', 'Test factor') returning id
),
version as (
  insert into public.conversion_factor_versions
    (conversion_factor_id, version_number, value, input_unit, output_unit, source_reference,
     effective_from, status, created_by)
  select factor.id, 1, 2.5, 'L', 'kgCO2e', 'Synthetic test value', date '2026-01-01', 'active', u.id
  from factor, u returning id
),
record as (
  insert into public.esg_records
    (org_unit_id, reporting_period_id, metric_id, submitted_by, activity_value_verified, activity_unit)
  select o.id, p.id, m.id, u.id, 100, 'L'
  from public.org_units o, public.reporting_periods p, public.esg_metrics m, u
  where m.code = 'DIESEL_CONSUMPTION' limit 1
  returning id
)
select version.id as version_id, record.id as record_id from version, record;

insert into public.calculations
  (esg_record_id, conversion_factor_version_id, input_value, input_unit, normalized_value,
   normalized_unit, factor_value_snapshot, result_value, result_unit, engine_version)
select record_id, version_id, 100, 'L', 100, 'L', 2.5, 250, 'kgCO2e', 'calc-test' from ids;

select throws_ok(
  $$update public.conversion_factor_versions set value = 9.9
     where id = (select version_id from ids)$$,
  'Cannot mutate a conversion_factor_version already referenced by a calculation — create a new version instead',
  'a referenced factor version cannot change its value');

select lives_ok(
  $$update public.conversion_factor_versions set status = 'superseded', notes = 'replaced'
     where id = (select version_id from ids)$$,
  'a referenced version can still be superseded — only value and units are frozen');

select throws_ok(
  $$insert into public.calculations
      (esg_record_id, input_value, input_unit, normalized_value, normalized_unit, result_value,
       result_unit, engine_version)
    select record_id, 1, 'L', 1, 'L', 1, 'kgCO2e', 'calc-test' from ids$$,
  '23505', null,
  'a record can only have one current calculation');

-- Migration 0036: stored calculations are append-only, for every role.
select throws_ok(
  $$delete from public.calculations where esg_record_id = (select record_id from ids)$$,
  '42501', null, 'a stored calculation cannot be deleted');
select throws_ok(
  $$update public.calculations set result_value = 1 where esg_record_id = (select record_id from ids)$$,
  '42501', null, 'nor can its result be changed');
select throws_ok($$truncate public.calculations cascade$$, '42501', null, 'nor the table emptied');
select lives_ok(
  $$update public.calculations set is_current = false where esg_record_id = (select record_id from ids)$$,
  'retiring a calculation when a newer one replaces it is the one change allowed');
insert into public.calculation_inputs (calculation_id, input_key, input_value, input_unit)
select c.id, 'quantity', 100, 'L' from public.calculations c, ids where c.esg_record_id = ids.record_id;
select throws_ok(
  $$delete from public.calculation_inputs
     where calculation_id in (select c.id from public.calculations c, ids where c.esg_record_id = ids.record_id)$$,
  '42501', null, 'the inputs a calculation used cannot be deleted either');
select has_column('public', 'audit_logs', 'ip_address', 'audit entries record where an action came from');

select * from finish();
rollback;
