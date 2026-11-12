-- Invitation links (.grill/scoped-admin-onboarding-decisions.md, stage 2; SCHEMA_DEVIATIONS D42).
--
-- A new account no longer gets an emailed temporary password. The person receives a link that carries a
-- random token; the app keeps only the token's SHA-256 here. Opening the link changes nothing. The token is
-- used up in the same transaction that sets the person's own password, so it works once.
--
--   open      consumed_at is null and revoked_at is null and expires_at > now()
--   expired   the same, past expires_at
--   used      consumed_at is set
--   revoked   revoked_at is set (an administrator revoked it, or a newer link replaced it)
--
-- At most one link per account is neither used nor revoked: issuing a new one revokes the earlier one first.
--
-- Undo: drop the table (its trigger goes with it), drop the function, delete the setting.

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  -- SHA-256 of the token, in hex. The token itself is never stored.
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Who issued it; kept as "nobody" when that account is removed later.
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint user_invitations_one_ending check (consumed_at is null or revoked_at is null)
);

create unique index user_invitations_one_outstanding
  on public.user_invitations (user_id)
  where consumed_at is null and revoked_at is null;
create index user_invitations_user_id_idx on public.user_invitations (user_id);

-- Server-only, like password_reset_otps (migration 0030): RLS on, no policies, no browser grants.
alter table public.user_invitations enable row level security;
revoke all on public.user_invitations from anon, authenticated;

-- A link that was used or revoked stays that way, and a link is never pointed at another account or given
-- a later expiry, whoever writes to the table.
create function public.guard_user_invitation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.consumed_at is not null or old.revoked_at is not null then
    raise exception 'A used or revoked invitation cannot be changed.' using errcode = '23514';
  end if;
  if new.user_id is distinct from old.user_id
     or new.token_hash is distinct from old.token_hash
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'An invitation''s account, token and expiry cannot be changed.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_user_invitations_guard
  before update on public.user_invitations
  for each row execute function public.guard_user_invitation();

revoke all on function public.guard_user_invitation() from public, anon, authenticated;

-- How long a link stays valid, in hours (the owner chose 24). Read by the app; between 1 and 168.
insert into public.org_settings (key, value)
values ('invitation_valid_hours', '24'::jsonb)
on conflict (key) do nothing;
