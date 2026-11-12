-- Migration 0049: Risk Engine Evaluations & Audit Reports
-- Reuses existing validation anomalies, duplicate checks, BRSR readiness, and submission monitoring.

create table if not exists public.risk_evaluation_reports (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  overall_risk_level text not null check (
    overall_risk_level in ('PASS', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
  ),
  overall_risk_score int not null default 0,
  high_or_critical_count int not null default 0,
  executive_summary text not null,
  disclaimer text not null default 'This assesses operational and reporting compliance risks. It supports internal audit and does not establish regulatory penalties.',
  category_assessments jsonb not null,
  features_snapshot jsonb not null,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint uq_risk_evaluation_org_period unique (org_unit_id, reporting_period_id)
);

create index if not exists risk_eval_org_period_idx on public.risk_evaluation_reports (org_unit_id, reporting_period_id);
create index if not exists risk_eval_level_idx on public.risk_evaluation_reports (overall_risk_level);

-- Permissions
insert into public.permissions (code, description) values
  ('risk.view', 'View operational, submission, duplicate invoice, and reporting compliance risk assessments.'),
  ('risk.manage', 'Execute and configure operational risk assessments across reporting facilities.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('admin', 'corporate_esg') and p.code in ('risk.view', 'risk.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('project_manager', 'ehs', 'finance_csr') and p.code = 'risk.view'
on conflict do nothing;

-- RLS
alter table public.risk_evaluation_reports enable row level security;
revoke all on public.risk_evaluation_reports from anon, authenticated;

do $$
begin
  if exists (select from pg_roles where rolname = 'chat_reader') then
    grant select on public.risk_evaluation_reports to chat_reader;
    create policy chat_reader_select_re on public.risk_evaluation_reports for select to chat_reader using (true);
  end if;
exception when others then
  null;
end $$;
