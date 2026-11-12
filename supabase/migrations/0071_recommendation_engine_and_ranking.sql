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

-- Permissions
insert into public.permissions (code, description) values
  ('recommendation.view', 'View prioritized decarbonization and operational recommendations with transparent ranking breakdown.'),
  ('recommendation.manage', 'Recalibrate recommendation ranking weights and update recommendation status.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('admin', 'corporate_esg') and p.code in ('recommendation.view', 'recommendation.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('project_manager', 'ehs', 'finance_csr') and p.code = 'recommendation.view'
on conflict do nothing;

-- RLS
alter table public.recommendations_reports enable row level security;
revoke all on public.recommendations_reports from anon;

do $$
begin
  if exists (select from pg_roles where rolname = 'chat_reader') then
    grant select on public.recommendations_reports to chat_reader;
    create policy chat_reader_select_rr on public.recommendations_reports for select to chat_reader using (true);
  end if;
exception when others then
  null;
end $$;
