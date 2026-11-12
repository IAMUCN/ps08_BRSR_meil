-- Migration 0074: Predictive Intelligence, Consumption Forecasts & GBDT Model Snapshots
-- Milestone 4: Time-series forecasting, Gradient Boosting evaluations, and pre-submission anomaly tracking.

create table if not exists public.predictive_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units(id) on delete cascade,
  reporting_period_id uuid not null references public.reporting_periods(id) on delete cascade,
  metric_type text not null, -- 'ELECTRICITY_KWH', 'FUEL_DIESEL_L', 'WATER_KL', 'WASTE_TONNES', 'EMISSIONS_SCOPE_1', 'EMISSIONS_SCOPE_2', 'EMISSIONS_TOTAL'
  champion_model text not null, -- 'xgboost_gbdt', 'lightgbm_gbdt', 'exponential_smoothing', 'linear_trend'
  horizon_periods int not null default 3,
  evaluation_metrics jsonb not null, -- { r2, rmse, mae, mape, aic }
  model_tournament jsonb not null, -- array of candidate model scores
  historical_data jsonb not null, -- raw time-series observations
  predictions jsonb not null, -- forecasted points with 80% & 95% confidence intervals
  anomaly_flags jsonb not null default '[]'::jsonb, -- detected anomalies in series
  predictive_insights jsonb not null default '[]'::jsonb, -- threshold breach warnings
  disclaimer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_predictive_snapshot unique (org_unit_id, reporting_period_id, metric_type)
);

create index if not exists idx_predictive_org_metric 
  on public.predictive_forecast_snapshots(org_unit_id, metric_type);

create index if not exists idx_predictive_period 
  on public.predictive_forecast_snapshots(reporting_period_id);

-- Enable Row Level Security (RLS)
alter table public.predictive_forecast_snapshots enable row level security;

-- Policy: Select allowed for authenticated users
create policy predictive_forecast_select on public.predictive_forecast_snapshots
  for select to authenticated using (true);

-- Revoke modifications from anon and authenticated
revoke all on public.predictive_forecast_snapshots from anon, authenticated;
grant select on public.predictive_forecast_snapshots to authenticated;
