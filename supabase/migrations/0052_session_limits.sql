-- Session time limits (.grill/scoped-admin-onboarding-decisions.md, stage 3; SCHEMA_DEVIATIONS D43).
--
-- A sign-in ends by itself after `idle_minutes` without activity (180) and `absolute_minutes` after it
-- started (4320), whichever comes first. Supabase Auth's own session would otherwise live for as long as its
-- refresh token keeps being used. The app enforces the limits itself, on every request, from this table:
-- one row per sign-in, keyed by the `session_id` claim of the Supabase access token.
--
-- "Activity" is reported by the page when the person really does something (a key, a click, a scroll).
-- Requests the page makes by itself (the notification bell, a list that refreshes) only ask whether the
-- session is still alive; they never extend it.
--
-- Undo: drop the function and the table, delete the setting.

create table public.user_sessions (
  -- The Supabase Auth session (auth.sessions.id); no foreign key, the auth schema is not ours.
  session_id uuid primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_reason text check (ended_reason in ('idle', 'absolute', 'signed_out')),
  constraint user_sessions_ended_with_reason check ((ended_at is null) = (ended_reason is null))
);
create index user_sessions_user_id_idx on public.user_sessions (user_id);

-- Server-only: RLS on, no policies, no browser grants.
alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from anon, authenticated;

insert into public.org_settings (key, value)
values ('session_limits', '{"idle_minutes": 180, "absolute_minutes": 4320}'::jsonb)
on conflict (key) do nothing;

-- The limits in force. A missing or senseless setting falls back to the defaults rather than to "no limit".
create function public.session_limits(out idle_minutes int, out absolute_minutes int)
language plpgsql
stable
set search_path = ''
as $$
declare
  setting jsonb;
begin
  select value into setting from public.org_settings where key = 'session_limits';
  begin
    idle_minutes := (setting ->> 'idle_minutes')::int;
    absolute_minutes := (setting ->> 'absolute_minutes')::int;
  exception when others then
    idle_minutes := null;
    absolute_minutes := null;
  end;
  if idle_minutes is null or idle_minutes < 1 or idle_minutes > 1440 then
    idle_minutes := 180;
  end if;
  if absolute_minutes is null or absolute_minutes < idle_minutes or absolute_minutes > 10080 then
    absolute_minutes := greatest(4320, idle_minutes);
  end if;
end;
$$;

-- Called on every request with the session and the person the verified token names.
--   p_activity false: only checks (and registers a session seen for the first time).
--   p_activity true:  the person did something; moves last_activity_at forward.
-- Returns 'active' with the two moments the session will end at, or 'expired'. A session that has ended
-- stays ended: nothing brings it back, so the person signs in again.
create function public.touch_session(p_session_id uuid, p_user_id uuid, p_activity boolean)
returns table (state text, idle_expires_at timestamptz, absolute_expires_at timestamptz)
language plpgsql
set search_path = ''
as $$
declare
  lim record;
  s public.user_sessions;
  moment timestamptz := clock_timestamp();
begin
  select * into lim from public.session_limits();

  insert into public.user_sessions (session_id, user_id, started_at, last_activity_at)
  values (p_session_id, p_user_id, moment, moment)
  on conflict (session_id) do nothing;

  select * into s from public.user_sessions where session_id = p_session_id for update;

  -- A session id can only ever belong to the person it started with.
  if s.user_id <> p_user_id or s.ended_at is not null then
    return query select 'expired'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if moment >= s.started_at + make_interval(mins => lim.absolute_minutes) then
    update public.user_sessions set ended_at = moment, ended_reason = 'absolute'
    where session_id = p_session_id;
    return query select 'expired'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if moment >= s.last_activity_at + make_interval(mins => lim.idle_minutes) then
    update public.user_sessions set ended_at = moment, ended_reason = 'idle'
    where session_id = p_session_id;
    return query select 'expired'::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if p_activity then
    update public.user_sessions set last_activity_at = moment where session_id = p_session_id;
    s.last_activity_at := moment;
  end if;

  return query select
    'active'::text,
    s.last_activity_at + make_interval(mins => lim.idle_minutes),
    s.started_at + make_interval(mins => lim.absolute_minutes);
end;
$$;

revoke all on function public.session_limits() from public, anon, authenticated;
revoke all on function public.touch_session(uuid, uuid, boolean) from public, anon, authenticated;
