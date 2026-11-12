-- Migration 0048: Decarbonization Suggestions & Strategic Roadmap Engine
-- Operational and engineering decision-support initiatives linked to verified features & decision rules.

-- 1. Decarbonization Suggestions Table
create table if not exists public.decarbonization_suggestions (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  suggestion_id text not null,
  title text not null,
  summary text not null,
  category text not null check (
    category in (
      'RENEWABLE_POWER',
      'ENERGY_EFFICIENCY',
      'FLEET_AND_FUELS',
      'PROCESS_AND_MATERIALS',
      'WATER_CONSERVATION',
      'CIRCULAR_WASTE',
      'GOVERNANCE_DATA_QUALITY'
    )
  ),
  priority text not null check (priority in ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
  triggered_by_rule_code text,
  target_feature text not null,
  observed_value numeric(14, 4),
  threshold_value numeric(14, 4),
  potential_reduction_tco2e numeric(14, 4) not null default 0,
  potential_reduction_pct numeric(8, 4) not null default 0,
  investment_tier text not null check (
    investment_tier in ('NO_COST', 'LOW_OPEX', 'MODERATE_CAPEX', 'MAJOR_CAPEX')
  ),
  payback_years numeric(6, 2),
  carbon_adjusted_payback_years numeric(6, 2),
  payback_horizon text not null default 'MEDIUM_TERM' check (
    payback_horizon in ('IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM')
  ),
  action_steps jsonb not null default '[]'::jsonb,
  technical_prerequisites jsonb not null default '[]'::jsonb,
  regulatory_disclaimer text not null default 'This recommendation is generated for operational planning and decarbonization strategy. It does not establish regulatory non-compliance.',
  status text not null default 'OPEN' check (
    status in ('OPEN', 'IN_REVIEW', 'ACCEPTED', 'IMPLEMENTED', 'DISMISSED')
  ),
  assigned_to uuid references public.users(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_org_period_suggestion unique (org_unit_id, reporting_period_id, suggestion_id)
);

create index if not exists suggestions_org_period_idx on public.decarbonization_suggestions (org_unit_id, reporting_period_id);
create index if not exists suggestions_category_idx on public.decarbonization_suggestions (category);
create index if not exists suggestions_priority_idx on public.decarbonization_suggestions (priority);
create index if not exists suggestions_status_idx on public.decarbonization_suggestions (status);

-- 2. Decarbonization Roadmaps Snapshot Table
create table if not exists public.decarbonization_roadmaps (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  total_potential_reduction_tco2e numeric(14, 4) not null default 0,
  overall_reduction_pct numeric(8, 4) not null default 0,
  total_suggestions int not null default 0,
  executive_summary text not null,
  ai_rationale text,
  ai_enriched boolean not null default false,
  model_used text,
  features_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_org_period_roadmap unique (org_unit_id, reporting_period_id)
);

create index if not exists roadmaps_org_period_idx on public.decarbonization_roadmaps (org_unit_id, reporting_period_id);

-- 3. Permissions
insert into public.permissions (code, description) values
  ('suggestion.view', 'View decarbonization suggestions, carbon abatement roadmaps, and payback analytics.'),
  ('suggestion.manage', 'Generate, accept, assign, and update decarbonization action items.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('admin', 'corporate_esg') and p.code in ('suggestion.view', 'suggestion.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code in ('project_manager', 'ehs', 'finance_csr') and p.code = 'suggestion.view'
on conflict do nothing;

-- 4. RLS Configuration
alter table public.decarbonization_suggestions enable row level security;
alter table public.decarbonization_roadmaps enable row level security;

revoke all on public.decarbonization_suggestions, public.decarbonization_roadmaps from anon, authenticated;

do $$
begin
  if exists (select from pg_roles where rolname = 'chat_reader') then
    grant select on public.decarbonization_suggestions, public.decarbonization_roadmaps to chat_reader;
    create policy chat_reader_select_ds on public.decarbonization_suggestions for select to chat_reader using (true);
    create policy chat_reader_select_dr on public.decarbonization_roadmaps for select to chat_reader using (true);
  end if;
exception when others then
  null;
end $$;
