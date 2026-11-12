-- Migration 0071: Recommendation Engine & Weighted Ranking System
-- Implements transparent Score = 0.35*I + 0.25*U + 0.20*F + 0.20*D ranking without invented financial savings.

create table if not exists public.recommendations_reports (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  total_count int not null default 0,
  weights_used jsonb not null default '{"impact": 0.35, "urgency": 0.25, "feasibility": 0.20, "confidence": 0.20}'::jsonb,
  recommendations_data jsonb not null,
  features_snapshot jsonb not null,
  calibration_disclaimer text not null default 'These are proposed starting weights, not scientifically validated ESG standards. Calibrate them with domain experts and user feedback.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_recommendations_org_period unique (org_unit_id, reporting_period_id)
);

create index if not exists rec_reports_org_period_idx on public.recommendations_reports (org_unit_id, reporting_period_id);

-- RLS
alter table public.recommendations_reports enable row level security;
revoke all on public.recommendations_reports from anon, authenticated;
grant select on public.recommendations_reports to authenticated;

create policy recommendations_reports_read on public.recommendations_reports for select to authenticated using (true);
