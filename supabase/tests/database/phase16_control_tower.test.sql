-- Phase 16: Control Tower configuration (migration 0024) and the database half of self-approval prevention —
-- no browser session can write an approval, a decision or an expectation directly; only the server can,
-- after its own checks (the application half is exercised by the API test).
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

select has_table('public', 'submission_expectations', 'expected submissions are configuration');
select ok((select relrowsecurity from pg_class where oid = 'public.submission_expectations'::regclass),
  'expected submissions are under row-level security');
select ok(
  not has_table_privilege('authenticated', 'public.submission_expectations', 'INSERT')
    and not has_table_privilege('authenticated', 'public.submission_expectations', 'DELETE'),
  'expectations change only through the server (audited)');

select ok(
  not has_table_privilege('authenticated', 'public.approvals', 'INSERT')
    and not has_table_privilege('authenticated', 'public.approvals', 'UPDATE'),
  'no browser session can record an approval decision — including its own record''s');
select ok(
  not has_column_privilege('authenticated', 'public.esg_records', 'approval_status', 'UPDATE'),
  'nor set a record''s approval status directly');

select is(
  (select jsonb_typeof(value) from public.org_settings where key = 'brsr_readiness_weights'),
  'object',
  'BRSR Readiness % weights are configuration, not code');

select * from finish();
rollback;
