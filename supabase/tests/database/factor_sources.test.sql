-- Conversion-factor sources, the approval step and carbon-credit links (migration 0060; feature_enhancement.md
-- Phase 6, D50).
begin;
select plan(14);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000060a1', 'factor.maker@db.test'),
  ('00000000-0000-4000-8000-0000000060a2', 'factor.checker@db.test');
insert into public.users (id, display_name, email) values
  ('00000000-0000-4000-8000-0000000060a1', 'Factor Maker', 'factor.maker@db.test'),
  ('00000000-0000-4000-8000-0000000060a2', 'Factor Checker', 'factor.checker@db.test');
insert into public.conversion_factors (id, activity_type, name)
values ('00000000-0000-4000-8000-0000000060f1', 'DB_TEST_FACTOR_SOURCES', 'Test factor');

select is(
  pg_temp.err($$insert into public.conversion_factor_versions
    (conversion_factor_id, version_number, value, input_unit, output_unit, source_reference, effective_from,
     status, created_by)
    values ('00000000-0000-4000-8000-0000000060f1', 1, 1, 'L', 'kgCO2e', 'test', '2026-04-01', 'active',
            '00000000-0000-4000-8000-0000000060a1')$$),
  'A conversion factor version needs an approval before it is used',
  'a version cannot be inserted in use without an approver');

insert into public.conversion_factor_versions
  (id, conversion_factor_id, version_number, value, input_unit, output_unit, source_reference, effective_from,
   status, created_by, source_url, financial_year)
values ('00000000-0000-4000-8000-0000000060b1', '00000000-0000-4000-8000-0000000060f1', 1, 2.5, 'L', 'kgCO2e',
        'test', '2026-04-01', 'draft', '00000000-0000-4000-8000-0000000060a1', 'https://cea.nic.in/x', '2026-27');

select is(
  pg_temp.err($$update public.conversion_factor_versions set status = 'active'
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'A conversion factor version needs an approval before it is used',
  'a draft cannot be switched on without an approver');
select matches(
  pg_temp.err($$update public.conversion_factor_versions
                set status = 'active', approved_by = created_by, approved_at = now()
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'check constraint',
  'the person who entered it cannot approve it unless it is marked as self-approved');
select matches(
  pg_temp.err($$update public.conversion_factor_versions
                set status = 'active', approved_by = '00000000-0000-4000-8000-0000000060a2',
                    approved_at = now(), self_approved = true
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'check constraint',
  'self-approved is only for the person who entered it');
select is(
  pg_temp.err($$update public.conversion_factor_versions
                set status = 'active', approved_by = '00000000-0000-4000-8000-0000000060a2', approved_at = now()
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  '',
  'another person approves it and it is in use');
select is(
  pg_temp.err($$update public.conversion_factor_versions set approved_by = '00000000-0000-4000-8000-0000000060a1'
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'An approval cannot be changed',
  'an approval cannot be rewritten afterwards');
select matches(
  pg_temp.err($$update public.conversion_factor_versions set source_url = 'http://cea.nic.in/x'
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'check constraint',
  'a source link must be https');
select matches(
  pg_temp.err($$update public.conversion_factor_versions set financial_year = '2026'
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'check constraint',
  'a financial year is written like 2026-27');
select matches(
  pg_temp.err($$update public.conversion_factor_versions set value_origin = 'scraped'
                where id = '00000000-0000-4000-8000-0000000060b1'$$),
  'check constraint',
  'a value is typed or fetched, nothing else');

select ok(
  (select jsonb_array_length(value -> 'hosts') >= 5 from public.org_settings where key = 'factor_source_hosts'),
  'the official source list is configured');

select ok((select relrowsecurity from pg_class where oid = 'public.carbon_credit_links'::regclass),
  'carbon_credit_links has RLS');
select ok(
  not has_table_privilege('authenticated', 'public.carbon_credit_links', 'SELECT')
    and not has_table_privilege('anon', 'public.carbon_credit_links', 'SELECT')
    and not has_table_privilege('authenticated', 'public.carbon_credit_links', 'INSERT'),
  'the browser roles cannot read or write carbon_credit_links');
select ok(
  (select count(*) >= 4 and bool_and(url like 'https://%') from public.carbon_credit_links),
  'the preset links are there, all https');
select matches(
  pg_temp.err($$insert into public.carbon_credit_links (name, url, description, kind)
                values ('Plain', 'http://example.org/', 'not https', 'registry')$$),
  'check constraint',
  'a carbon-credit link must be https');

select * from finish();
rollback;
