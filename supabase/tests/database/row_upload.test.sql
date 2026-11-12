-- D59: upload by rows. What a person typed is kept apart from the OCR reading, server-only, and never
-- changes; drafts are server-only; travel is distance x passengers.
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

select is((select relrowsecurity from pg_class where oid = 'public.upload_declarations'::regclass), true,
  'upload_declarations has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.upload_drafts'::regclass), true,
  'upload_drafts has RLS');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name in ('upload_declarations', 'upload_drafts')
     and grantee in ('anon', 'authenticated')),
  0, 'the browser roles have no grant on the typed values or the drafts');
select has_column('public', 'esg_records', 'upload_declaration_id', 'a record points at what was typed for it');

insert into auth.users (id, email, aud, role) values
  ('77111111-1111-4111-8111-111111111111', 'rows.test@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('77111111-1111-4111-8111-111111111111', 'Rows Test', 'rows.test@example.test');
insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
  file_size_bytes, file_hash, uploaded_by, is_bundle)
select '77222222-2222-4222-8222-222222222222', ou.id, rp.id, 'p', 'rows.pdf', 'application/pdf', 1, 'h',
  '77111111-1111-4111-8111-111111111111', true
from public.org_units ou, public.reporting_periods rp
where ou.code = 'PRJ-X' and rp.status = 'open' limit 1;

create temp table t_row as
select m.id as metric_id, rp.id as period_id
from public.esg_metrics m, public.reporting_periods rp
where m.code = 'DIESEL_CONSUMPTION' and rp.status = 'open' limit 1;

select lives_ok(
  $$insert into public.upload_declarations
      (id, bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by)
    select '77333333-3333-4333-8333-333333333333', '77222222-2222-4222-8222-222222222222', 1,
           metric_id, period_id, 'bill', '{"quantity": "850", "unit": "L"}',
           '77111111-1111-4111-8111-111111111111'
    from t_row$$,
  'a typed row is stored');
select throws_ok(
  $$insert into public.upload_declarations
      (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by)
    select '77222222-2222-4222-8222-222222222222', 2, metric_id, period_id, 'other', '{}',
           '77111111-1111-4111-8111-111111111111' from t_row$$,
  '23514', null, 'only the three row modes are accepted');
select throws_ok(
  $$insert into public.upload_declarations
      (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by)
    select '77222222-2222-4222-8222-222222222222', 2, metric_id, period_id, 'bill', '["850"]',
           '77111111-1111-4111-8111-111111111111' from t_row$$,
  '23514', null, 'typed values are keyed by field');
select throws_ok(
  $$insert into public.upload_declarations
      (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by)
    select '77222222-2222-4222-8222-222222222222', 1, metric_id, period_id, 'bill', '{}',
           '77111111-1111-4111-8111-111111111111' from t_row$$,
  '23505', null, 'one row per position in an upload');
select throws_ok(
  $$update public.upload_declarations set declared_values = '{"quantity": "85"}'
    where id = '77333333-3333-4333-8333-333333333333'$$,
  '42501', null, 'a typed value cannot be changed afterwards');
select throws_ok(
  $$delete from public.upload_declarations where id = '77333333-3333-4333-8333-333333333333'$$,
  '42501', null, 'a typed row cannot be deleted');

-- 0079: the pages of a bill typed for a file of several.
select throws_ok(
  $$insert into public.upload_declarations
      (bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by,
       page_from, page_to)
    select '77222222-2222-4222-8222-222222222222', 3, metric_id, period_id, 'bill', '{}',
           '77111111-1111-4111-8111-111111111111', 3, 2 from t_row$$,
  '23514', null, 'the last page cannot come before the first');
select lives_ok(
  $$insert into public.upload_declarations
      (id, bundle_document_id, position, metric_id, reporting_period_id, mode, declared_values, declared_by,
       page_from, page_to)
    select '77444444-4444-4444-8444-444444444444', '77222222-2222-4222-8222-222222222222', 3, metric_id,
           period_id, 'bill', '{"quantity": "600", "unit": "L"}', '77111111-1111-4111-8111-111111111111', 2, 3
    from t_row$$,
  'a bill with its pages is stored');
select throws_ok(
  $$update public.upload_declarations set page_to = 4 where id = '77444444-4444-4444-8444-444444444444'$$,
  '42501', null, 'its pages cannot be changed afterwards');

select lives_ok(
  $$insert into public.upload_drafts (user_id, rows)
    values ('77111111-1111-4111-8111-111111111111', '[{"metricId": "x"}]')$$,
  'a draft is stored');
select throws_ok(
  $$insert into public.upload_drafts (user_id, rows)
    values ('77111111-1111-4111-8111-111111111111', '[]')$$,
  '23505', null, 'one draft per person');
select throws_ok(
  $$update public.upload_drafts set rows = '{}' where user_id = '77111111-1111-4111-8111-111111111111'$$,
  '23514', null, 'a draft holds a list of rows');

-- Travel as distance x passengers.
select is(
  (select count(*)::int from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
   where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS')
     and r.field_key in ('distance', 'passengers') and r.is_required and r.data_type = 'number'),
  8, 'the four travel activities ask for the distance and the passengers');
select is(
  (select count(*)::int from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
   where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS')
     and r.field_key = 'quantity'),
  0, 'passenger-km is no longer typed as one number');
select is(
  (select count(*)::int from public.calculation_formulas f join public.esg_metrics m on m.id = f.metric_id
   where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS')
     and f.status = 'active' and f.formula_type = 'direct_multiply'
     and f.formula_definition -> 'inputs' = '["distance", "passengers"]'::jsonb),
  4, 'each travel activity has one active distance x passengers formula');
select is(
  (select count(*)::int from public.calculation_formulas f join public.esg_metrics m on m.id = f.metric_id
   where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'COMMUTING_BUS')
     and f.status = 'active'),
  4, 'and no other active formula');
select is(
  (select count(*)::int from public.calculation_formulas f join public.esg_metrics m on m.id = f.metric_id
   where m.code = 'BUSINESS_TRAVEL_SPEND' and f.status = 'active'
     and not (f.formula_definition ? 'inputs' and f.formula_definition -> 'inputs' = '["distance", "passengers"]'::jsonb)),
  1, 'travel by spend is unchanged');

select * from finish();
rollback;
