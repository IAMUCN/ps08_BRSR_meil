-- Phase 17: report runs cover exactly one period or one financial year (D17), rendered reports live in a
-- private bucket nobody can reach directly, and runs are written only by the server.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Its own user, so the test also passes on a fresh database (CI), where nobody has been provisioned yet.
insert into auth.users (id, email) values ('00000017-0000-4000-8000-0000000000aa', 'phase17@fixture.test');
insert into public.users (id, display_name, email)
values ('00000017-0000-4000-8000-0000000000aa', 'Phase 17 fixture', 'phase17@fixture.test');

select throws_ok(
  $$insert into public.report_runs (requested_by, org_unit_id, report_type)
    select (select id from public.users limit 1), (select id from public.org_units limit 1), 'brsr'$$,
  '23514', null,
  'a report must cover a period or a financial year');

select throws_ok(
  $$insert into public.report_runs (requested_by, org_unit_id, reporting_period_id, financial_year, report_type)
    select (select id from public.users limit 1), (select id from public.org_units limit 1),
           (select id from public.reporting_periods limit 1), 2026, 'brsr'$$,
  '23514', null,
  'but never both');

select is((select public from storage.buckets where id = 'reports'), false,
  'the reports bucket is private');
select is((select allowed_mime_types from storage.buckets where id = 'reports'), array['application/pdf'],
  'and holds PDFs only');
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (qual ilike '%reports%' or with_check ilike '%reports%')),
  0,
  'no storage policy lets a browser session read or write reports directly');
select ok(
  not has_table_privilege('authenticated', 'public.report_runs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.report_runs', 'UPDATE'),
  'report runs are written only by the server');

-- D18: which value a mapping reports.
select throws_ok(
  $$update public.brsr_metric_mappings set reported_value = 'guess' where true$$,
  '23514', null,
  'a mapping reports the calculated result or the verified quantity, nothing else');
select is(
  (select x.reported_value from public.brsr_metric_mappings x
     join public.esg_metrics m on m.id = x.esg_metric_id
     join public.brsr_indicators i on i.id = x.brsr_indicator_id
    where m.code = 'WASTE_DISPOSED' and i.code = 'P6-E9'),
  'activity',
  'P6-E9 reports the waste quantity, not its emissions');

-- D25: indicator codes follow SEBI's July-2023 numbering.
select is(
  (select array_agg(code order by code) from public.brsr_indicators where deleted_at is null),
  array['A-20', 'A-24', 'P1-E2', 'P3-E8', 'P6-E3', 'P6-E7', 'P6-E9', 'P6-L2', 'P8-E4'],
  'the seeded indicators carry the July-2023 BRSR question numbers');

select * from finish();
rollback;
