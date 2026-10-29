-- Invitation links (migration 0051) and session time limits (migration 0052);
-- .grill/scoped-admin-onboarding-decisions.md.
begin;
select plan(31);

-- Runs a statement and returns the error it raised ('' when it went through).
create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

create function pg_temp.state(p_session uuid, p_user uuid, p_activity boolean) returns text
language sql as $$ select state from public.touch_session(p_session, p_user, p_activity) $$;

insert into auth.users (id, email) values
  ('51515151-0000-4000-8000-000000000001', 'invitee@invitations.test'),
  ('51515151-0000-4000-8000-000000000002', 'other@invitations.test');
insert into public.users (id, display_name, email) values
  ('51515151-0000-4000-8000-000000000001', 'Invitee', 'invitee@invitations.test'),
  ('51515151-0000-4000-8000-000000000002', 'Other', 'other@invitations.test');

-- --- Invitations: shape and access --------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.user_invitations'::regclass),
  'user_invitations has RLS');
select ok(
  not has_table_privilege('authenticated', 'public.user_invitations', 'SELECT')
    and not has_table_privilege('anon', 'public.user_invitations', 'SELECT')
    and not has_table_privilege('authenticated', 'public.user_invitations', 'INSERT'),
  'the browser roles cannot read or write invitations');
select is((select count(*)::int from pg_policies where tablename = 'user_invitations'), 0,
  'no policy opens invitations to anyone');
select is((select (value #>> '{}')::int from public.org_settings where key = 'invitation_valid_hours'),
  24, 'a link is valid for 24 hours, as a setting');

select matches(
  pg_temp.err($$insert into public.user_invitations (user_id, token_hash, expires_at)
    values ('51515151-0000-4000-8000-000000000001', 'the-token-itself', now() + interval '1 day')$$),
  'token_hash', 'only a SHA-256 can be stored, never a token');

insert into public.user_invitations (id, user_id, token_hash, expires_at) values
  ('51515151-1111-4000-8000-000000000001', '51515151-0000-4000-8000-000000000001',
   repeat('a', 64), now() + interval '1 day');

select matches(
  pg_temp.err($$insert into public.user_invitations (user_id, token_hash, expires_at)
    values ('51515151-0000-4000-8000-000000000001', repeat('b', 64), now() + interval '1 day')$$),
  'user_invitations_one_outstanding', 'an account has at most one link that is neither used nor revoked');
select matches(
  pg_temp.err($$insert into public.user_invitations (user_id, token_hash, expires_at)
    values ('51515151-0000-4000-8000-000000000002', repeat('a', 64), now() + interval '1 day')$$),
  'token_hash', 'two links never share a token');

-- --- Invitations: a link cannot be redirected, stretched or brought back -----------------------------------
select matches(
  pg_temp.err($$update public.user_invitations set user_id = '51515151-0000-4000-8000-000000000002'
    where id = '51515151-1111-4000-8000-000000000001'$$),
  'cannot be changed', 'a link cannot be pointed at another account');
select matches(
  pg_temp.err($$update public.user_invitations set expires_at = now() + interval '1 year'
    where id = '51515151-1111-4000-8000-000000000001'$$),
  'cannot be changed', 'a link cannot be given a later expiry');
select matches(
  pg_temp.err($$update public.user_invitations set consumed_at = now(), revoked_at = now()
    where id = '51515151-1111-4000-8000-000000000001'$$),
  'user_invitations_one_ending', 'a link is used or revoked, never both');

-- The claim the app makes: one statement, only while the link is open.
create function pg_temp.claim(hash text) returns int language plpgsql as $$
declare n int;
begin
  update public.user_invitations i set consumed_at = now()
  from public.users u
  where i.token_hash = hash and i.consumed_at is null and i.revoked_at is null
    and i.expires_at > now() and u.id = i.user_id and u.is_active and u.deleted_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

select is(pg_temp.claim(repeat('c', 64)), 0, 'an unknown token claims nothing');
select is(pg_temp.claim(repeat('a', 64)), 1, 'an open link is claimed once');
select is(pg_temp.claim(repeat('a', 64)), 0, 'and not a second time');
select matches(
  pg_temp.err($$update public.user_invitations set consumed_at = null
    where id = '51515151-1111-4000-8000-000000000001'$$),
  'used or revoked', 'a used link cannot be made unused');

-- Expired, revoked, deactivated.
insert into public.user_invitations (user_id, token_hash, expires_at, created_at) values
  ('51515151-0000-4000-8000-000000000002', repeat('d', 64), now() - interval '1 minute',
   now() - interval '25 hours');
select is(pg_temp.claim(repeat('d', 64)), 0, 'an expired link claims nothing');
update public.user_invitations set revoked_at = now() where token_hash = repeat('d', 64);
insert into public.user_invitations (user_id, token_hash, expires_at) values
  ('51515151-0000-4000-8000-000000000002', repeat('e', 64), now() + interval '1 day');
select is((select count(*)::int from public.user_invitations
           where user_id = '51515151-0000-4000-8000-000000000002'), 2,
  'after a revocation the account can be sent a new link');
update public.users set is_active = false where id = '51515151-0000-4000-8000-000000000002';
select is(pg_temp.claim(repeat('e', 64)), 0, 'a deactivated account cannot use its link');
update public.users set is_active = true where id = '51515151-0000-4000-8000-000000000002';
update public.user_invitations set revoked_at = now() where token_hash = repeat('e', 64);
select is(pg_temp.claim(repeat('e', 64)), 0, 'a revoked link claims nothing');

-- --- Sessions: shape and access -----------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.user_sessions'::regclass)
  and not has_table_privilege('authenticated', 'public.user_sessions', 'SELECT')
  and not has_table_privilege('anon', 'public.user_sessions', 'SELECT'),
  'user_sessions has RLS and no browser access');
select ok(
  not has_function_privilege('authenticated', 'public.touch_session(uuid, uuid, boolean)', 'execute')
    and not has_function_privilege('anon', 'public.touch_session(uuid, uuid, boolean)', 'execute'),
  'the browser roles cannot call touch_session (nobody extends a session through the API)');
select is((select row(idle_minutes, absolute_minutes)::text from public.session_limits()), '(180,720)',
  'the limits are 3 hours idle and 12 hours in all');

-- --- Sessions: the clock ------------------------------------------------------------------------------------
select is(pg_temp.state('52525252-0000-4000-8000-000000000001',
  '51515151-0000-4000-8000-000000000001', false), 'active', 'a session seen for the first time is active');

-- A request that is not activity never moves the idle clock.
update public.user_sessions set last_activity_at = now() - interval '2 hours'
where session_id = '52525252-0000-4000-8000-000000000001';
select pg_temp.state('52525252-0000-4000-8000-000000000001',
  '51515151-0000-4000-8000-000000000001', false);
select ok((select last_activity_at < now() - interval '119 minutes' from public.user_sessions
           where session_id = '52525252-0000-4000-8000-000000000001'),
  'a background request leaves the idle clock where it was');
select pg_temp.state('52525252-0000-4000-8000-000000000001',
  '51515151-0000-4000-8000-000000000001', true);
select ok((select last_activity_at > now() - interval '1 minute' from public.user_sessions
           where session_id = '52525252-0000-4000-8000-000000000001'),
  'activity starts the idle clock again');

-- Idle for longer than the limit.
update public.user_sessions set last_activity_at = now() - interval '181 minutes'
where session_id = '52525252-0000-4000-8000-000000000001';
select is(pg_temp.state('52525252-0000-4000-8000-000000000001',
  '51515151-0000-4000-8000-000000000001', true), 'expired',
  'after 3 hours without activity the session is over, even for a request that is activity');
select is((select ended_reason from public.user_sessions
           where session_id = '52525252-0000-4000-8000-000000000001'), 'idle', 'and says why');
select is(pg_temp.state('52525252-0000-4000-8000-000000000001',
  '51515151-0000-4000-8000-000000000001', true), 'expired', 'an ended session never comes back');

-- Busy all day: the absolute limit ends it anyway.
select pg_temp.state('52525252-0000-4000-8000-000000000002',
  '51515151-0000-4000-8000-000000000001', true);
update public.user_sessions set started_at = now() - interval '721 minutes'
where session_id = '52525252-0000-4000-8000-000000000002';
select is(pg_temp.state('52525252-0000-4000-8000-000000000002',
  '51515151-0000-4000-8000-000000000001', true), 'expired',
  '12 hours after sign-in the session is over however busy it was');
select is((select ended_reason from public.user_sessions
           where session_id = '52525252-0000-4000-8000-000000000002'), 'absolute', 'and says why');

-- Somebody else's session id is of no use.
select pg_temp.state('52525252-0000-4000-8000-000000000003',
  '51515151-0000-4000-8000-000000000001', true);
select is(pg_temp.state('52525252-0000-4000-8000-000000000003',
  '51515151-0000-4000-8000-000000000002', true), 'expired',
  'a session belongs to the person it started with');

-- A senseless setting falls back to the defaults, never to "no limit".
update public.org_settings set value = '{"idle_minutes": 0, "absolute_minutes": "never"}'::jsonb
where key = 'session_limits';
select is((select row(idle_minutes, absolute_minutes)::text from public.session_limits()), '(180,720)',
  'a broken setting means the default limits, not no limits');

select * from finish();
rollback;
