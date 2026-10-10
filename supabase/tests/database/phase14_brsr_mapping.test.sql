-- Phase 14: BRSR mapping is configuration (migration 0022) — sections and indicators seeded from SEBI's
-- Annexure I, every metric from Phases 10–13 maps to at least one indicator, and the browser can't write.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select results_eq(
  $$select code from public.brsr_sections order by code$$,
  array['A', 'B', 'C'],
  'the three BRSR sections are seeded');

select is(
  (select count(*)::int from public.esg_metrics m
    where m.deleted_at is null
      and not exists (select 1 from public.brsr_metric_mappings x
                       where x.esg_metric_id = m.id and x.is_applicable)),
  0,
  'no orphaned metrics: every metric feeds at least one applicable BRSR indicator');

select is(
  (select count(*)::int from public.brsr_indicators i
     join public.brsr_sections s on s.id = i.section_id
    where (s.code = 'C') <> (i.indicator_type is not null)),
  0,
  'Section C indicators are essential or leadership; Sections A and B carry no type');

select is(
  (select count(*)::int from public.brsr_indicators
    where coalesce(trim(description), '') = '' or coalesce(trim(question_text), '') = ''),
  0,
  'every indicator names where in the BRSR format it comes from');

select ok(
  not has_table_privilege('authenticated', 'public.brsr_metric_mappings', 'INSERT')
    and not has_table_privilege('authenticated', 'public.brsr_metric_mappings', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.brsr_metric_mappings', 'DELETE'),
  'mappings change only through the server (audited), never from the browser');

select throws_ok(
  $$insert into public.brsr_metric_mappings (esg_metric_id, brsr_indicator_id)
    select esg_metric_id, brsr_indicator_id from public.brsr_metric_mappings limit 1$$,
  '23505', null,
  'a metric maps to an indicator at most once');

select * from finish();
rollback;
