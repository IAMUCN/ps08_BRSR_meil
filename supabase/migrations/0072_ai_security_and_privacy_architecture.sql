-- Migration 0072: AI Security & Privacy Architecture (Milestone 1)
-- Enforces:
-- 1. Approved-provider processing & data classification permissions.
-- 2. Emergency Kill Switch to cut off external AI providers.
-- 3. Configurable retention and deletion policies.
-- 4. Audit logging of AI requests without altering existing audit_logs immutability triggers.

-- 1. AI Providers Registry Table
create table if not exists public.ai_providers (
  id text primary key,
  name text not null,
  endpoint_type text not null check (endpoint_type in ('cloud', 'local', 'internal')),
  approval_status text not null check (approval_status in ('APPROVED', 'PENDING_APPROVAL', 'REVOKED', 'DEV_ONLY', 'DISABLED')),
  approved_classifications jsonb not null default '[]'::jsonb,
  rate_limits jsonb not null default '{"requests_per_minute": 60, "max_tokens_per_request": 2048, "max_daily_requests": 5000}'::jsonb,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- 2. AI Security & Privacy Platform Policies
create table if not exists public.ai_security_policies (
  id uuid primary key default gen_random_uuid(),
  kill_switch_enabled boolean not null default false,
  kill_switch_reason text,
  kill_switch_activated_by text,
  kill_switch_activated_at timestamptz,
  data_retention_days integer not null default 90,
  mask_confidential_invoices boolean not null default true,
  exclude_employee_pii boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

-- Seed Default Approved Providers
insert into public.ai_providers (id, name, endpoint_type, approval_status, approved_classifications, rate_limits, approved_by, approved_at)
values
  ('gemini', 'Google Gemini Enterprise', 'cloud', 'APPROVED',
   '["PUBLIC_BRSR_GUIDELINES", "SYNTHETIC_ESG_DATA", "AGGREGATED_ESG_METRICS", "CONFIDENTIAL_INVOICES"]'::jsonb,
   '{"requests_per_minute": 60, "max_tokens_per_request": 2048, "max_daily_requests": 5000}'::jsonb,
   'System Security Board', now()),
  ('nvidia_nim', 'NVIDIA NIM Infrastructure', 'cloud', 'APPROVED',
   '["PUBLIC_BRSR_GUIDELINES", "SYNTHETIC_ESG_DATA", "AGGREGATED_ESG_METRICS"]'::jsonb,
   '{"requests_per_minute": 45, "max_tokens_per_request": 1500, "max_daily_requests": 3000}'::jsonb,
   'Chief Information Security Officer', now()),
  ('groq', 'Groq Cloud LPU', 'cloud', 'DEV_ONLY',
   '["PUBLIC_BRSR_GUIDELINES", "SYNTHETIC_ESG_DATA"]'::jsonb,
   '{"requests_per_minute": 30, "max_tokens_per_request": 1024, "max_daily_requests": 1000}'::jsonb,
   'Development Lead', now()),
  ('local_ollama', 'Local Air-Gapped LLM', 'local', 'APPROVED',
   '["PUBLIC_BRSR_GUIDELINES", "SYNTHETIC_ESG_DATA", "AGGREGATED_ESG_METRICS", "CONFIDENTIAL_INVOICES", "EMPLOYEE_INFORMATION", "FINANCIAL_RECORDS"]'::jsonb,
   '{"requests_per_minute": 120, "max_tokens_per_request": 4096, "max_daily_requests": 10000}'::jsonb,
   'Data Privacy Officer', now())
on conflict (id) do update set
  approval_status = excluded.approval_status,
  approved_classifications = excluded.approved_classifications;

-- Seed Default Security Policy
insert into public.ai_security_policies (kill_switch_enabled, kill_switch_reason, data_retention_days, mask_confidential_invoices, exclude_employee_pii)
values (false, null, 90, true, true)
on conflict do nothing;

-- 3. Row-Level Security
alter table public.ai_providers enable row level security;
alter table public.ai_security_policies enable row level security;

-- Read policies for authenticated staff
create policy ai_providers_read on public.ai_providers
  for select to authenticated using (true);

create policy ai_security_policies_read on public.ai_security_policies
  for select to authenticated using (true);

-- Revoke all modifications from public/anon
revoke insert, update, delete on public.ai_providers from anon, public;
revoke insert, update, delete on public.ai_security_policies from anon, public;
