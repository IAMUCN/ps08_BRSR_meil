-- Phase 2B: the OCR worker reads which fields to extract from metric_field_requirements (migration 0013).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select results_eq(
  $$select r.field_key from public.metric_field_requirements r
    join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'DIESEL_CONSUMPTION' and r.is_required order by r.field_key$$,
  array['billing_period', 'invoice_number', 'quantity', 'unit'],
  'Diesel Consumption requires quantity, unit, invoice number and billing period');

select results_eq(
  $$select r.field_key || ':' || r.is_required from public.metric_field_requirements r
    join public.esg_metrics m on m.id = r.metric_id
    where m.code = 'GRID_ELECTRICITY' order by r.field_key$$,
  array['billing_period:true', 'consumption:true', 'invoice_number:false', 'source_classification:false',
        'unit:true'],
  'Grid Electricity requires consumption, unit and billing period; bill number (0057) and source are optional');

select is(
  (select count(*)::int from public.metric_field_requirements where is_critical),
  0,
  'criticality is left to Phases 10-11');

select * from finish();
rollback;
