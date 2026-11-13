-- The gaps against the L&T BRSR (2026-11-13): zero values flagged (0085), the fields SEBI's tables group by
-- are required (0086), SEBI's typed tables are stored server-side (0087).
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

select is(
  (select rule_definition from public.validation_rules
    where metric_id is null and rule_definition ->> 'check' = 'range'
      and rule_definition ->> 'field' = 'activity_value'),
  '{"check": "range", "field": "activity_value", "min": 0, "flag_zero": true}'::jsonb,
  'a zero activity value is accepted and flagged; only negatives fail');
select is(
  (select count(*)::int from public.validation_rules
    where rule_definition ->> 'check' = 'range' and rule_definition ? 'min_exclusive'
      and (rule_definition ->> 'min_exclusive')::numeric = 0),
  0, 'no rule refuses a zero any more');

select is(
  (select count(*)::int from public.metric_field_requirements r join public.esg_metrics m on m.id = r.metric_id
    where r.is_required and (
      (m.code = 'WATER_CONSUMPTION' and r.field_key = 'source_classification') or
      (m.code = 'WASTE_DISPOSED' and r.field_key in ('source_classification', 'waste_category')) or
      (m.code = 'MSME_PROCUREMENT' and r.field_key = 'india_spend'))),
  4, 'water source, waste category and route, and purchases within India are required');

select is((select relrowsecurity from pg_class where oid = 'public.brsr_table_answers'::regclass), true,
  'brsr_table_answers has RLS');
select is(
  (select count(*)::int from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'brsr_table_answers' and grantee in ('anon', 'authenticated')),
  0, 'the browser roles have no grant on the typed tables');

insert into auth.users (id, email, aud, role) values
  ('78111111-1111-4111-8111-111111111111', 'tables.test@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('78111111-1111-4111-8111-111111111111', 'Tables Test', 'tables.test@example.test');

select lives_ok(
  $$insert into public.brsr_table_answers (brsr_indicator_id, financial_year, cells, updated_by)
    select id, 2026, '{"main.board": {"total": 12, "female": 3}}', '78111111-1111-4111-8111-111111111111'
    from public.brsr_indicators where code = 'A-21'$$,
  'a typed table is stored');
select throws_ok(
  $$insert into public.brsr_table_answers (brsr_indicator_id, financial_year, cells, updated_by)
    select id, 2026, '{}', '78111111-1111-4111-8111-111111111111'
    from public.brsr_indicators where code = 'A-21'$$,
  '23505', null, 'one table per question and financial year');
select throws_ok(
  $$insert into public.brsr_table_answers (brsr_indicator_id, financial_year, cells, updated_by)
    select id, 2026, '[1, 2]', '78111111-1111-4111-8111-111111111111'
    from public.brsr_indicators where code = 'A-20'$$,
  '23514', null, 'cells are keyed by row');
select throws_ok(
  $$insert into public.brsr_table_answers (brsr_indicator_id, financial_year, cells, updated_by)
    select id, 1999, '{}', '78111111-1111-4111-8111-111111111111'
    from public.brsr_indicators where code = 'A-20'$$,
  '23514', null, 'the financial year is checked');
select is(
  (select count(*)::int from public.brsr_indicators
    where code in ('A-18','A-19','A-20','A-21','A-22','A-25','P1-E8','P1-E9','P3-E1','P3-E2','P3-E5','P3-E8',
                   'P3-E13','P5-E3','P5-E6','P5-E7','P8-E5') and deleted_at is null),
  17, 'every question with a typed table exists in the BRSR format');

select * from finish();
rollback;
