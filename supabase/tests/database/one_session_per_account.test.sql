-- One signed-in session per account (migration 0055; feature_enhancement.md requirements 18 and 32).
begin;
select plan(28);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

-- A Supabase Auth session as GoTrue would hold it; the app's own row is added by the functions.
create function pg_temp.auth_session(p_id uuid, p_user uuid) returns void language sql as $$
  insert into auth.sessions (id, user_id, created_at, updated_at) values (p_id, p_user, now(), now())
$$;

create function pg_temp.start(p_id uuid, p_user uuid, p_replace boolean) returns text language sql as $$
  select outcome from public.start_session(p_id, p_user, p_replace, 'Mozilla/5.0 Edg/130.0', '203.0.113.7')
$$;

insert into auth.users (id, email) values
  ('55555555-0000-4000-8000-000000000001', 'one@sessions.test'),
  ('55555555-0000-4000-8000-000000000002', 'two@sessions.test');
insert into public.users (id, display_name, email) values
  ('55555555-0000-4000-8000-000000000001', 'One', 'one@sessions.test'),
  ('55555555-0000-4000-8000-000000000002', 'Two', 'two@sessions.test');

-- --- Shape and access ---------------------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.start_session(uuid, uuid, boolean, text, text, text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.start_session(uuid, uuid, boolean, text, text, text)', 'EXECUTE'),
  'the browser roles cannot start or replace sessions');
select ok(
  not has_function_privilege('authenticated', 'public.touch_session_single(uuid, uuid, boolean)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.live_sessions(uuid, uuid)', 'EXECUTE'),
  'nor touch or list them');
select is(pg_temp.err($$insert into public.user_sessions (session_id, user_id, ended_at, ended_reason)
    values (gen_random_uuid(), '55555555-0000-4000-8000-000000000002', now(), 'replaced')$$),
  '', '''replaced'' is an allowed ending');
select matches(pg_temp.err($$insert into public.user_sessions (session_id, user_id, ended_at, ended_reason)
    values (gen_random_uuid(), '55555555-0000-4000-8000-000000000002', now(), 'kicked')$$),
  'user_sessions_ended_reason_check', 'an unknown ending is refused');

-- --- First sign-in: nothing to ask --------------------------------------------------------------------------
select pg_temp.auth_session('55555555-1111-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001');
select is(pg_temp.start('55555555-1111-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001', false),
  'started', 'a first sign-in starts');
select is((select user_agent || ' ' || ip_address from public.user_sessions
    where session_id = '55555555-1111-4000-8000-00000000000a'),
  'Mozilla/5.0 Edg/130.0 203.0.113.7', 'the device is recorded');

-- --- Second device, not confirmed: asked, nothing changes, the new Supabase session is revoked -------------
select pg_temp.auth_session('55555555-1111-4000-8000-00000000000b', '55555555-0000-4000-8000-000000000001');
select is(pg_temp.start('55555555-1111-4000-8000-00000000000b', '55555555-0000-4000-8000-000000000001', false),
  'conflict', 'a second device is asked first');
select is(
  (select others -> 0 ->> 'session_id' from public.start_session(
    '55555555-1111-4000-8000-00000000000c', '55555555-0000-4000-8000-000000000001', false, null, null)),
  '55555555-1111-4000-8000-00000000000a', 'the question names the device signed in');
select ok(not exists (select 1 from auth.sessions where id = '55555555-1111-4000-8000-00000000000b'),
  'the unconfirmed sign-in is revoked in Supabase Auth');
select ok(not exists (select 1 from public.user_sessions where session_id = '55555555-1111-4000-8000-00000000000b'),
  'and never started');
select is((select ended_at from public.user_sessions where session_id = '55555555-1111-4000-8000-00000000000a'),
  null, 'the first device is untouched');

-- --- Second device, confirmed: the first ends as replaced, is revoked, audited ------------------------------
select pg_temp.auth_session('55555555-1111-4000-8000-00000000000d', '55555555-0000-4000-8000-000000000001');
select is(pg_temp.start('55555555-1111-4000-8000-00000000000d', '55555555-0000-4000-8000-000000000001', true),
  'started', 'a confirmed takeover starts the new sign-in');
select is(
  (select ended_reason || ' by ' || replaced_by from public.user_sessions
    where session_id = '55555555-1111-4000-8000-00000000000a'),
  'replaced by 55555555-1111-4000-8000-00000000000d', 'the first device''s sign-in ended as replaced');
select ok(not exists (select 1 from auth.sessions where id = '55555555-1111-4000-8000-00000000000a'),
  'and its Supabase Auth session is gone (refresh tokens with it)');
select is(
  (select state from public.touch_session_single(
    '55555555-1111-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001', true)),
  'expired', 'the first device is turned away on its next request');
select is(
  (select count(*)::int from public.audit_logs
    where event_type = 'auth.session_replaced' and entity_id = '55555555-0000-4000-8000-000000000001'
      and old_value -> 'sessions' -> 0 ->> 'session_id' = '55555555-1111-4000-8000-00000000000a'
      and new_value ->> 'session_id' = '55555555-1111-4000-8000-00000000000d'
      and new_value ->> 'via' = 'sign_in' and ip_address = '203.0.113.7'),
  1, 'one audit entry names both devices');
select is(
  (select state from public.touch_session_single(
    '55555555-1111-4000-8000-00000000000d', '55555555-0000-4000-8000-000000000001', true)),
  'active', 'the new device works');

-- --- A session that skipped the form replaces the others on its first request -------------------------------
select pg_temp.auth_session('55555555-1111-4000-8000-00000000000e', '55555555-0000-4000-8000-000000000001');
select is(
  (select jsonb_array_length(replaced) from public.touch_session_single(
    '55555555-1111-4000-8000-00000000000e', '55555555-0000-4000-8000-000000000001', false)),
  1, 'an unregistered session reports the sign-in it replaced');
select is(
  (select ended_reason from public.user_sessions where session_id = '55555555-1111-4000-8000-00000000000d'),
  'replaced', 'so two sessions are never alive at once');
select is(
  (select new_value ->> 'via' from public.audit_logs
    where event_type = 'auth.session_replaced'
      and new_value ->> 'session_id' = '55555555-1111-4000-8000-00000000000e'),
  'first_request', 'audited as such');
select is(
  (select jsonb_array_length(replaced) from public.touch_session_single(
    '55555555-1111-4000-8000-00000000000e', '55555555-0000-4000-8000-000000000001', false)),
  0, 'a known session replaces nothing');

-- --- What does not count as alive ---------------------------------------------------------------------------
delete from auth.sessions where id = '55555555-1111-4000-8000-00000000000e';
select is((select count(*)::int from public.live_sessions('55555555-0000-4000-8000-000000000001', null)), 0,
  'a sign-in revoked in Supabase Auth (a password change, say) is not alive');
select pg_temp.auth_session('55555555-1111-4000-8000-0000000000f1', '55555555-0000-4000-8000-000000000001');
insert into public.user_sessions (session_id, user_id, started_at, last_activity_at)
values ('55555555-1111-4000-8000-0000000000f1', '55555555-0000-4000-8000-000000000001',
  now() - interval '5 hours', now() - interval '4 hours');
select is((select count(*)::int from public.live_sessions('55555555-0000-4000-8000-000000000001', null)), 0,
  'nor one past its idle limit');
select pg_temp.auth_session('55555555-1111-4000-8000-0000000000f2', '55555555-0000-4000-8000-000000000001');
select is(pg_temp.start('55555555-1111-4000-8000-0000000000f2', '55555555-0000-4000-8000-000000000001', false),
  'started', 'so it does not trigger the question');

-- --- Other people, and session ids that are not the caller's -----------------------------------------------
select pg_temp.auth_session('55555555-2222-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000002');
select is(pg_temp.start('55555555-2222-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000002', false),
  'started', 'another person''s sign-in is not affected by the first person''s');
select is(pg_temp.start('55555555-1111-4000-8000-0000000000f2', '55555555-0000-4000-8000-000000000002', true),
  'refused', 'a session id that belongs to someone else is refused');
select is(pg_temp.start('55555555-1111-4000-8000-00000000000a', '55555555-0000-4000-8000-000000000001', true),
  'refused', 'an ended sign-in cannot be started again');
select matches(
  pg_temp.err($$select * from public.start_session(gen_random_uuid(), '55555555-0000-4000-8000-000000000001',
    true, null, null, 'anything')$$),
  'unknown p_via', 'only the two known ways in are accepted');

select * from finish();
rollback;
