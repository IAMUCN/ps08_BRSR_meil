-- Migration 0055: What-If Scenario Simulations & Multi-Vector Decarbonization Modeling
-- Milestone 5: Renewable energy transition, fuel switching, water/waste circularity, and ICP financial impact.

create table if not exists public.what_if_scenario_simulations (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  scenario_name text not null,
  scenario_type text not null, -- 'RENEWABLE_ENERGY', 'EMISSIONS_REDUCTION', 'WATER_CONSERVATION', 'WASTE_CIRCULARITY', 'BLENDED_PATHWAY', 'CUSTOM_CATEGORY'
  parameters jsonb not null, -- { targetRenewableSharePct, fuelSwitchPct, waterRecycledPct, wasteDivertedPct, shadowPricePerTco2e, capexAmount }
  baseline_metrics jsonb not null, -- { electricityKwh, fuelDieselL, waterKl, wasteTonnes, scope1, scope2, scope3, totalTco2e }
  simulated_metrics jsonb not null, -- { projectedScopes, avoidedTco2e, overallReductionPercent, avoidedKwh, avoidedDieselL, waterSavedKl, wasteDivertedTonnes }
  financial_impact jsonb not null, -- { operationalAnnualSavings, carbonRiskAvoidedAnnual, totalAnnualBenefit, traditionalPaybackYears, carbonAdjustedPaybackYears, fiveYearNpv }
  disclaimer text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scenario_org_period 
  on public.what_if_scenario_simulations(org_unit_id, reporting_period_id);

create index if not exists idx_scenario_type 
  on public.what_if_scenario_simulations(scenario_type);

-- Enable Row Level Security (RLS)
alter table public.what_if_scenario_simulations enable row level security;

-- Policy: Select allowed for authenticated users
create policy what_if_scenario_select on public.what_if_scenario_simulations
  for select to authenticated using (true);

-- Policy: Insert allowed for authenticated users
create policy what_if_scenario_insert on public.what_if_scenario_simulations
  for insert to authenticated with check (true);

-- Policy: Update/Delete allowed for authenticated users
create policy what_if_scenario_modify on public.what_if_scenario_simulations
  for all to authenticated using (true) with check (true);

-- Revoke dangerous direct modifications from anon
revoke all on public.what_if_scenario_simulations from anon;
