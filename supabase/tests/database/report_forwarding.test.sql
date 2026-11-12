-- Forwarding a report for verification (migration 0058; feature_enhancement.md Phase 4).
begin;
select plan(7);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.report_forwards'::regclass),
  'report_forwards has RLS');
select ok(
  not has_table_privilege('authenticated', 'public.report_forwards', 'SELECT')
    and not has_table_privilege('anon', 'public.report_forwards', 'SELECT')
    and not has_table_privilege('authenticated', 'public.report_forwards', 'INSERT'),
  'the browser roles cannot read or write it');

-- A report run to forward, on whatever unit, period and user exist locally.
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000058u1', 'forward_test@meil.test')
on conflict (id) do nothing;

insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-0000000058u1', 'Forward User', 'forward_test@meil.test')
on conflict (id) do nothing;

insert into public.report_runs (id, requested_by, org_unit_id, reporting_period_id, report_type, status)
select '58585858-0000-4000-8000-000000000001', u.id, o.id, p.id, 'brsr'::public.report_type, 'completed'
from public.users u, public.org_units o, public.reporting_periods p limit 1;

insert into public.report_forwards (id, report_run_id, from_org_unit_id, to_org_unit_id, forwarded_by)
select '58585858-1111-4000-8000-000000000001', r.id, r.org_unit_id, null, r.requested_by
from public.report_runs r where r.id = '58585858-0000-4000-8000-000000000001';

select matches(
  pg_temp.err($$insert into public.report_forwards (report_run_id, from_org_unit_id, to_org_unit_id, forwarded_by)
    select r.id, r.org_unit_id, null, r.requested_by from public.report_runs r
    where r.id = '58585858-0000-4000-8000-000000000001'$$),
  'report_forwards_one_pending', 'one open step per report and receiver');
select matches(
  pg_temp.err($$update public.report_forwards set status = 'returned', decided_by = forwarded_by,
                 decided_at = now() where id = '58585858-1111-4000-8000-000000000001'$$),
  'report_forwards_return_reason', 'a return needs a reason');
select matches(
  pg_temp.err($$update public.report_forwards set status = 'verified'
                 where id = '58585858-1111-4000-8000-000000000001'$$),
  'report_forwards_decided', 'a decision records who and when');
select is(
  pg_temp.err($$update public.report_forwards set status = 'verified', decided_by = forwarded_by,
                 decided_at = now() where id = '58585858-1111-4000-8000-000000000001'$$),
  '', 'a verification with who and when is accepted');
select is(
  pg_temp.err($$insert into public.report_forwards (report_run_id, from_org_unit_id, to_org_unit_id, forwarded_by)
    select r.id, r.org_unit_id, null, r.requested_by from public.report_runs r
    where r.id = '58585858-0000-4000-8000-000000000001'$$),
  '', 'once decided, the report can be forwarded there again');

select * from finish();
rollback;
