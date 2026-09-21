-- Phase 18: the audit log is append-only for every role, including the server's (migration 0027), rate-limit
-- counters are server-only, and the log is readable by Admins alone (SECURITY_REVIEW.md).
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into public.audit_logs (id, event_type, entity_type, entity_id)
values ('18181818-1818-4818-8818-181818181818', 'test.event', 'test', gen_random_uuid());

-- As the server's own role (the owner — RLS and grants don't stop it; the trigger does).
select throws_ok(
  $$update public.audit_logs set reason = 'rewritten' where id = '18181818-1818-4818-8818-181818181818'$$,
  '42501', null, 'no one can change an audit entry, not even the server');
select throws_ok(
  $$delete from public.audit_logs where id = '18181818-1818-4818-8818-181818181818'$$,
  '42501', null, 'no one can remove an audit entry');
select throws_ok(
  $$truncate public.audit_logs$$,
  '42501', null, 'the audit log cannot be truncated');
select lives_ok(
  $$insert into public.audit_logs (event_type, entity_type, entity_id)
    values ('test.event', 'test', gen_random_uuid())$$,
  'appending still works');

insert into public.audit_logs (event_type, entity_type, entity_id)
values ('test.first', 'test', gen_random_uuid()), ('test.second', 'test', gen_random_uuid());
select ok(
  (select created_at from public.audit_logs where event_type = 'test.first')
    < (select created_at from public.audit_logs where event_type = 'test.second'),
  'entries written in one transaction keep the order they happened');

select ok((select relrowsecurity from pg_class where oid = 'public.rate_limit_events'::regclass),
  'rate-limit counters are under row-level security');
select ok(
  not has_table_privilege('authenticated', 'public.rate_limit_events', 'SELECT')
    and not has_table_privilege('authenticated', 'public.rate_limit_events', 'DELETE')
    and not has_table_privilege('anon', 'public.rate_limit_events', 'INSERT'),
  'no browser session can read, clear or add rate-limit counters');
select is(
  (select (value->>'login_failures_per_account')::int from public.org_settings where key = 'rate_limits'),
  5, 'rate limits are configuration, not code');

-- A signed-in non-admin (a fresh user with no role) and an anonymous visitor see no audit entry.
insert into auth.users (id, email) values ('18181818-0000-4000-8000-000000000001', 'phase18@example.test');
insert into public.users (id, email, display_name)
values ('18181818-0000-4000-8000-000000000001', 'phase18@example.test', 'Phase 18 user');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "18181818-0000-4000-8000-000000000001", "role": "authenticated"}', true);
select is((select count(*)::int from public.audit_logs), 0, 'a non-admin reads no audit entries');
select throws_ok(
  $$update public.audit_logs set reason = 'x'$$,
  '42501', null, 'nor can a browser session change one');

reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.audit_logs$$,
  '42501', null, 'an anonymous visitor cannot read the audit log at all');

reset role;
select * from finish();
rollback;
