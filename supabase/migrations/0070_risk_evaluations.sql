-- Migration 0069: Risk Engine Evaluations & Audit Reports
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

-- RLS
alter table public.risk_evaluation_reports enable row level security;
revoke all on public.risk_evaluation_reports from anon, authenticated;
grant select on public.risk_evaluation_reports to authenticated;

create policy risk_evaluation_reports_read on public.risk_evaluation_reports for select to authenticated using (true);
