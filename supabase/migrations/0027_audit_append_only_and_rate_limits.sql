-- Phase 18: audit and security hardening (.grill/phase-18-audit-security-decisions.md, SECURITY_REVIEW.md).

-- The audit log is append-only at the database layer (schema §12.1, App Flow §2.2 Audit Trail): no role —
-- not even the server's — can change or remove an entry through normal SQL.
create or replace function public.prevent_audit_log_change() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_audit_log_change() from public, anon, authenticated;

create trigger trg_audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function public.prevent_audit_log_change();
create trigger trg_audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function public.prevent_audit_log_change();

-- Entries written in one transaction (verification → validation → calculation) shared now() and so listed
-- in random order; the wall-clock time keeps them in the order they happened.
alter table public.audit_logs alter column created_at set default clock_timestamp();

-- Rate limiting (SCHEMA_DEVIATIONS.md D19): one row per counted attempt in a named bucket — failed sign-ins
-- per account and per client address, upload preparations per user. Buckets hold SHA-256 hashes, never
-- emails or addresses. Server-only: RLS on, no policies, no grants to browser roles.
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket text not null,
  created_at timestamptz not null default now()
);
create index rate_limit_events_bucket_idx on public.rate_limit_events (bucket, created_at);
alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from anon, authenticated;

-- The limits are configuration, not code.
insert into public.org_settings (key, value, updated_by)
values ('rate_limits', '{"login_failures_per_account": 5, "login_failures_per_address": 50,
                        "login_window_minutes": 15, "uploads_per_user": 60, "upload_window_minutes": 10}'::jsonb,
        null)
on conflict (key) do nothing;
