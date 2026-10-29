-- Phase 3 / D9: a deactivated user with an unexpired session token reads nothing via RLS.
begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'pm.x@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test', 'authenticated', 'authenticated');

insert into public.users (id, display_name, email) values
  ('11111111-1111-4111-8111-111111111111', 'PM Project X', 'pm.x@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'Test Admin', 'admin@example.test');

-- Whoever already holds the Super Admin role in this database is set aside first: at most two may hold it
-- (migration 0050), and this fixture adds one. Rolled back with the rest of the test.
update public.user_org_assignments uoa set revoked_at = now()
from public.roles r where r.id = uoa.role_id and r.code = 'admin' and uoa.revoked_at is null;
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select a.user_id::uuid, ou.id, r.id, '33333333-3333-4333-8333-333333333333'
from (values
  ('33333333-3333-4333-8333-333333333333', 'MEIL', 'admin'),
  ('11111111-1111-4111-8111-111111111111', 'PRJ-X', 'project_manager')
) as a (user_id, org_code, role_code)
join public.org_units ou on ou.code = a.org_code
join public.roles r on r.code = a.role_code;

insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by)
select ou.id, rp.id, m.id, m.scope_id, '11111111-1111-4111-8111-111111111111'
from public.org_units ou, public.reporting_periods rp, public.esg_metrics m
where ou.code = 'PRJ-X' and rp.status = 'open' and m.code = 'DIESEL_CONSUMPTION';

set local role authenticated;

-- Active PM sees their record
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.esg_records
           where submitted_by = '11111111-1111-4111-8111-111111111111'), 1, 'active PM sees their record');

-- Active Admin is Admin
select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
select ok(public.is_admin(), 'active Admin is recognised as Admin');

-- Deactivate both (as postgres), keep the same "live" tokens
reset role;
update public.users set is_active = false
where id in ('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333');
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.esg_records), 0,
  'deactivated PM with a live token sees no records');
select is((select count(*)::int from public.org_units), 0,
  'deactivated PM with a live token sees no org units');

select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);
select ok(not public.is_admin(), 'deactivated Admin is no longer Admin');
select is((select count(*)::int from public.esg_records), 0,
  'deactivated Admin with a live token sees no records');

select * from finish();
rollback;
