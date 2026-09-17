-- Phase 6: the OCR confidence threshold is seeded configuration (migration 0014).
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

select is(
  (select (value #>> '{}')::numeric from public.org_settings where key = 'ocr_confidence_threshold'),
  80::numeric,
  'OCR confidence threshold is seeded at 80 percent');

select col_is_null('public', 'org_settings', 'updated_by',
  'org_settings.updated_by is nullable for system-seeded values');

select ok(not has_table_privilege('authenticated', 'public.org_settings', 'UPDATE'),
  'clients still cannot change settings directly');

select * from finish();
rollback;
