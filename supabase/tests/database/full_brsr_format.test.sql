-- Migration 0040 (.grill/full-brsr-report-decisions.md, D32): every question of SEBI's BRSR format, and
-- the typed answers.
begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

select is(
  (select array_agg(n order by code) from (
     select s.code, count(*)::int as n from public.brsr_indicators i
     join public.brsr_sections s on s.id = i.section_id where i.deleted_at is null group by s.code) x),
  array[26, 12, 108],
  'Section A has 26 questions, Section B 12, Section C 108');

select is(
  (select array_agg(n order by principle) from (
     select principle, count(*)::int as n from public.brsr_indicators
     where principle is not null group by principle) x),
  array[11, 9, 21, 5, 16, 21, 3, 11, 11],
  'the nine principles hold their essential and leadership questions');

select is(
  (select array_agg(code order by code) from public.brsr_indicators where answer_kind = 'data'),
  array['A-20', 'A-24', 'P1-E2', 'P3-E11', 'P3-E8', 'P6-E3', 'P6-E4', 'P6-E6', 'P6-E7', 'P6-E9', 'P6-L2', 'P8-E4'],
  'the indicators the app measures are data indicators');

select is(
  (select count(*)::int from public.brsr_metric_mappings x
    join public.brsr_indicators i on i.id = x.brsr_indicator_id where i.code = 'P6-E7') > 0,
  true,
  'an existing indicator kept its metric mappings');

select is(
  (select array_agg(i.code order by i.sort_order) from public.brsr_indicators i
    where i.principle = 6 and i.code in ('P6-E1', 'P6-E13', 'P6-L1', 'P6-E2')),
  array['P6-E1', 'P6-E2', 'P6-E13', 'P6-L1'],
  'questions sort in SEBI''s order: by number, essential before leadership');

-- The report refuses to generate when a required *data* indicator has no mapping; a written question
-- must never trip that.
select is(
  (select count(*)::int from public.brsr_indicators i
    join public.brsr_sections s on s.id = i.section_id
    where i.deleted_at is null and i.answer_kind = 'data'
      and (s.code in ('A', 'B') or i.indicator_type = 'essential')
      and not exists (select 1 from public.brsr_metric_mappings x
                       where x.brsr_indicator_id = i.id and x.is_applicable)),
  0,
  'no required data indicator is left without a mapping');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000f040', 'brsr40@test.local');
insert into public.users (id, email, display_name)
values ('00000000-0000-0000-0000-00000000f040', 'brsr40@test.local', 'BRSR 40');

select lives_ok(
  $$insert into public.brsr_disclosures (brsr_indicator_id, financial_year, answer, updated_by)
    select id, 2026, 'L99999MH1946PLC004768', '00000000-0000-0000-0000-00000000f040'
    from public.brsr_indicators where code = 'A-1'$$,
  'an answer is stored for a question and a financial year');
select throws_ok(
  $$insert into public.brsr_disclosures (brsr_indicator_id, financial_year, answer, updated_by)
    select id, 2026, 'again', '00000000-0000-0000-0000-00000000f040'
    from public.brsr_indicators where code = 'A-1'$$,
  '23505', null, 'one answer per question per year');
select throws_ok(
  $$insert into public.brsr_disclosures (brsr_indicator_id, financial_year, answer, updated_by)
    select id, 2027, '   ', '00000000-0000-0000-0000-00000000f040'
    from public.brsr_indicators where code = 'A-1'$$,
  '23514', null, 'a blank answer is not an answer');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'brsr_disclosures'
      and grantee in ('anon', 'authenticated')),
  0,
  'the browser roles have no access to the answers');

select * from finish();
rollback;
