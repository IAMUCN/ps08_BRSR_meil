-- OTP-based password reset (bulk-import-decisions.md): the hosted project's own email only reaches the
-- Supabase team, so "forgot password" can't rely on Supabase Auth's reset-link email either — it sends a
-- short numeric code through Brevo instead and verifies it here. Invite/first-password-set is untouched
-- (still Supabase's own invite email, still /reset-password via /auth/confirm).
create table public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);
create index password_reset_otps_user_id_idx on public.password_reset_otps (user_id);

-- Server-only, like rate_limit_events (migration 0027): RLS on, no policies, no browser grants.
alter table public.password_reset_otps enable row level security;
revoke all on public.password_reset_otps from anon, authenticated;
