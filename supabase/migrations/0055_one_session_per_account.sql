-- One signed-in session per account (feature_enhancement.md requirements 18 and 32; SCHEMA_DEVIATIONS D45;
-- .grill/feature-enhancement-roadmap-decisions.md, decision 4).
--
-- An account may be signed in on one device at a time. When the password is accepted while another sign-in
-- of the same account is still alive, the app asks the new device first; on its confirmation the other
-- sign-in ends with the reason 'replaced', its Supabase Auth session is revoked (refresh tokens go with it),
-- and an audit entry names both devices. Without confirmation the new sign-in is revoked at once, so a
-- cancelled or abandoned prompt never leaves a second session behind.
--
-- A session that reaches the app without going through the sign-in form (one created straight against the
-- Supabase Auth API, or by an emailed link) is registered on its first request and replaces the others, so
-- the rule holds for every way in; only the form can ask first.
--
-- Additive: one more allowed reason, three nullable columns, three new functions. touch_session (0052) is
-- unchanged, so code built before this migration keeps its behaviour.
--
-- Undo (after the code that calls these functions is gone):
--   drop function public.touch_session_single(uuid, uuid, boolean);
--   drop function public.start_session(uuid, uuid, boolean, text, text, text);
--   drop function public.live_sessions(uuid, uuid);
--   update public.user_sessions set ended_reason = 'signed_out' where ended_reason = 'replaced';
--   alter table public.user_sessions drop column replaced_by, drop column ip_address, drop column user_agent;
--   then restore the 0052 check constraint.

alter table public.user_sessions drop constraint user_sessions_ended_reason_check;
alter table public.user_sessions add constraint user_sessions_ended_reason_check
  check (ended_reason in ('idle', 'absolute', 'signed_out', 'replaced'));

-- Recorded when the app itself starts the session (sign-in form), so a takeover can name both devices.
-- Sessions registered on a first request (0052's way) leave them empty.
alter table public.user_sessions
  add column user_agent text check (char_length(user_agent) <= 512),
  add column ip_address text check (char_length(ip_address) <= 64),
  -- The sign-in that took this one's place.
  add column replaced_by uuid;

-- The person's sign-ins that are still alive: not ended, inside both time limits, and still known to
-- Supabase Auth (a session revoked there — by a password change, say — is not alive, whatever this table
-- says). Newest activity first.
create function public.live_sessions(p_user_id uuid, p_except uuid)
returns table (
  session_id uuid,
  started_at timestamptz,
  last_activity_at timestamptz,
  user_agent text,
  ip_address text
)
language sql
stable
set search_path = ''
as $$
  select s.session_id, s.started_at, s.last_activity_at, s.user_agent, s.ip_address
  from public.user_sessions s
  cross join public.session_limits() lim
  where s.user_id = p_user_id
    and s.session_id is distinct from p_except
    and s.ended_at is null
    and clock_timestamp() < s.started_at + make_interval(mins => lim.absolute_minutes)
    and clock_timestamp() < s.last_activity_at + make_interval(mins => lim.idle_minutes)
    and exists (
      select 1 from auth.sessions a
      where a.id = s.session_id and (a.not_after is null or a.not_after > clock_timestamp()))
  order by s.last_activity_at desc
$$;

-- Starts the app's clock for a new sign-in.
--   p_replace false: if another sign-in is alive, nothing is started, the new Supabase session is revoked,
--                    and 'conflict' is returned with the other sign-ins (for the question on screen).
--   p_replace true:  the other sign-ins end as 'replaced' and are revoked; the new one starts; audited.
-- 'refused' when the session id is already known for someone else, or has already ended.
-- p_via says how the session arrived: 'sign_in' (the form) or 'first_request' (touch_session_single).
create function public.start_session(
  p_session_id uuid,
  p_user_id uuid,
  p_replace boolean,
  p_user_agent text,
  p_ip_address text,
  p_via text default 'sign_in'
)
returns table (outcome text, others jsonb)
language plpgsql
set search_path = ''
as $$
declare
  moment timestamptz := clock_timestamp();
  alive jsonb;
  ids uuid[];
begin
  if p_via not in ('sign_in', 'first_request') then
    raise exception 'start_session: unknown p_via %', p_via using errcode = '22023';
  end if;

  -- Two devices signing in to one account at the same moment are taken one after the other.
  perform pg_advisory_xact_lock(hashtextextended('user_sessions:' || p_user_id::text, 0));

  if exists (
    select 1 from public.user_sessions
    where session_id = p_session_id and (user_id <> p_user_id or ended_at is not null)
  ) then
    return query select 'refused'::text, '[]'::jsonb;
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb), coalesce(array_agg(l.session_id), '{}')
  into alive, ids
  from public.live_sessions(p_user_id, p_session_id) l;

  if cardinality(ids) > 0 and not p_replace then
    -- Revoke the new sign-in here, not only from the app: a lost sign-out must not leave it alive.
    delete from auth.sessions where id = p_session_id and user_id = p_user_id;
    return query select 'conflict'::text, alive;
    return;
  end if;

  insert into public.user_sessions (session_id, user_id, started_at, last_activity_at, user_agent, ip_address)
  values (
    p_session_id, p_user_id, moment, moment, left(p_user_agent, 512), left(p_ip_address, 64))
  on conflict (session_id) do update
    set user_agent = coalesce(public.user_sessions.user_agent, excluded.user_agent),
        ip_address = coalesce(public.user_sessions.ip_address, excluded.ip_address);

  if cardinality(ids) > 0 then
    update public.user_sessions
    set ended_at = moment, ended_reason = 'replaced', replaced_by = p_session_id
    where session_id = any (ids);
    -- Supabase Auth's own session: its refresh tokens are removed with it (foreign key, on delete cascade).
    delete from auth.sessions where id = any (ids) and user_id = p_user_id;

    insert into public.audit_logs
      (event_type, entity_type, entity_id, user_id, old_value, new_value, reason,
       ip_address, user_agent, session_id)
    values (
      'auth.session_replaced', 'user', p_user_id, p_user_id,
      jsonb_build_object('sessions', alive),
      jsonb_build_object(
        'session_id', p_session_id, 'user_agent', left(p_user_agent, 512),
        'ip_address', left(p_ip_address, 64), 'via', p_via),
      case p_via
        when 'sign_in' then 'Signed in on another device and confirmed signing out the previous one.'
        else 'A new session reached the app while another was signed in; the previous one was ended.'
      end,
      left(p_ip_address, 64), left(p_user_agent, 512), p_session_id::text);
  end if;

  return query select 'started'::text, alive;
end;
$$;

-- touch_session (0052) for the code from this migration on. A session seen for the first time is started
-- through start_session (replacing any other), so a sign-in that skipped the form cannot sit beside another.
-- Returns what touch_session returns, plus the sign-ins it replaced ('[]' when none).
create function public.touch_session_single(p_session_id uuid, p_user_id uuid, p_activity boolean)
returns table (state text, idle_expires_at timestamptz, absolute_expires_at timestamptz, replaced jsonb)
language plpgsql
set search_path = ''
as $$
declare
  started record;
  ended jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from public.user_sessions where session_id = p_session_id) then
    select * into started
    from public.start_session(p_session_id, p_user_id, true, null, null, 'first_request');
    if started.outcome = 'started' then
      ended := started.others;
    end if;
  end if;
  return query
  select t.state, t.idle_expires_at, t.absolute_expires_at, ended
  from public.touch_session(p_session_id, p_user_id, p_activity) t;
end;
$$;

revoke all on function public.live_sessions(uuid, uuid) from public, anon, authenticated;
revoke all on function public.start_session(uuid, uuid, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.touch_session_single(uuid, uuid, boolean) from public, anon, authenticated;
