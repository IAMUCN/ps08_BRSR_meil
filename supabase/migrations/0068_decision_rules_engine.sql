-- Migration 0067: Configurable, Versioned Decision Rules Engine & Audit Evaluations
-- Detects growth thresholds, intensity spikes, and data quality gaps without establishing regulatory non-compliance.

-- 1. Decision Rules Configuration Table (Versioned)
create table if not exists public.decision_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text not null,
  category text not null check (category in ('ENERGY', 'EMISSIONS', 'WATER', 'WASTE', 'INTENSITY', 'DATA_QUALITY')),
  version int not null default 1,
  status text not null default 'ACTIVE' check (status in ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'DISABLED')),
  severity text not null default 'WARNING' check (severity in ('INFO', 'WARNING', 'ACTION_REQUIRED', 'CRITICAL_REVIEW')),
  target_feature text not null,
  operator text not null check (operator in ('>', '>=', '<', '<=', '==', '!=', 'OUTSIDE_RANGE')),
  threshold_value numeric(14, 4) not null,
  threshold_upper numeric(14, 4),
  advisory_message_template text not null,
  disclaimer text not null default 'This detects an operational growth threshold or metric condition. It does not establish regulatory non-compliance.',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_decision_rules_code_version unique (code, version)
);

create index if not exists decision_rules_status_idx on public.decision_rules (status);
create index if not exists decision_rules_category_idx on public.decision_rules (category);

-- 2. Decision Rule Evaluations Audit Log (Append-Only)
create table if not exists public.decision_rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.decision_rules(id) on delete restrict,
  rule_code text not null,
  rule_version int not null,
  org_unit_id uuid not null references public.org_units(id),
  reporting_period_id uuid not null references public.reporting_periods(id),
  triggered boolean not null,
  observed_feature_value numeric(14, 4),
  threshold_value numeric(14, 4) not null,
  severity text not null,
  advisory_message text not null,
  contributing_record_ids uuid[] default '{}',
  feature_snapshot jsonb,
  evaluated_at timestamptz not null default clock_timestamp()
);

create index if not exists decision_eval_org_unit_idx on public.decision_rule_evaluations (org_unit_id);
create index if not exists decision_eval_period_idx on public.decision_rule_evaluations (reporting_period_id);
create index if not exists decision_eval_rule_idx on public.decision_rule_evaluations (rule_code, rule_version);

-- 3. Append-only enforcement for evaluations
create or replace function public.prevent_decision_evaluations_change() returns trigger
language plpgsql
set search_path = '' as $$
begin
  raise exception 'decision_rule_evaluations is append-only: % is not allowed', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_decision_evaluations_change() from public, anon, authenticated;

drop trigger if exists trg_decision_rule_evaluations_append_only on public.decision_rule_evaluations;
create trigger trg_decision_rule_evaluations_append_only
  before update or delete on public.decision_rule_evaluations
  for each row execute function public.prevent_decision_evaluations_change();

drop trigger if exists trg_decision_rule_evaluations_no_truncate on public.decision_rule_evaluations;
create trigger trg_decision_rule_evaluations_no_truncate
  before truncate on public.decision_rule_evaluations
  for each statement execute function public.prevent_decision_evaluations_change();

-- 4. RLS Configuration
alter table public.decision_rules enable row level security;
alter table public.decision_rule_evaluations enable row level security;

revoke all on public.decision_rules, public.decision_rule_evaluations from anon, authenticated;
grant select on public.decision_rules, public.decision_rule_evaluations to authenticated;

create policy decision_rules_read on public.decision_rules for select to authenticated using (true);
create policy decision_rule_evaluations_read on public.decision_rule_evaluations for select to authenticated using (true);

-- 6. Seed Baseline Version 1 Operational Rules
insert into public.decision_rules (
  code, name, description, category, version, status, severity,
  target_feature, operator, threshold_value, advisory_message_template
) values
  (
    'RULE_ELEC_GROWTH_THRESHOLD',
    'Electricity Growth Threshold Guard',
    'Detects rapid escalation in electricity consumption (> 15% increase vs preceding period).',
    'ENERGY',
    1,
    'ACTIVE',
    'WARNING',
    'electricity_growth',
    '>',
    0.1500,
    'Electricity consumption increased by {actual_pct}, exceeding the configured growth threshold of {threshold_pct}. Investigate peak loads or auxiliary generator usage.'
  ),
  (
    'RULE_WATER_SURGE_THRESHOLD',
    'Water Consumption Surge Guard',
    'Detects surge in net water consumption (> 20% increase vs preceding period).',
    'WATER',
    1,
    'ACTIVE',
    'CRITICAL_REVIEW',
    'water_consumption_growth',
    '>',
    0.2000,
    'Net water consumption increased by {actual_pct}, exceeding the configured surge threshold of {threshold_pct}. Inspect meter calibration or potential pipeline losses.'
  ),
  (
    'RULE_RENEWABLE_TARGET',
    'Renewable Electricity Share Minimum Target',
    'Flags facilities where renewable energy comprises less than 10% of total electrical consumption.',
    'ENERGY',
    1,
    'ACTIVE',
    'ACTION_REQUIRED',
    'renewable_share',
    '<',
    0.1000,
    'Renewable electricity share is {actual_pct}, which is below the organizational target threshold of {threshold_pct}. Explore green tariff power or rooftop solar.'
  ),
  (
    'RULE_EMISSIONS_SURGE',
    'Total Emissions Escalation Threshold',
    'Detects growth in aggregate carbon emissions exceeding 10% over the previous period.',
    'EMISSIONS',
    1,
    'ACTIVE',
    'WARNING',
    'emissions_growth',
    '>',
    0.1000,
    'Total emissions grew by {actual_pct}, exceeding the threshold of {threshold_pct}. Review Scope 1 heavy equipment activity.'
  ),
  (
    'RULE_INTENSITY_SPIKE',
    'Production Carbon Intensity Spike',
    'Detects an increase in emissions per unit of production (> 10% increase).',
    'INTENSITY',
    1,
    'ACTIVE',
    'ACTION_REQUIRED',
    'production_intensity_growth',
    '>',
    0.1000,
    'Emissions intensity per production unit increased by {actual_pct}, exceeding the threshold of {threshold_pct}. Operational efficiency review recommended.'
  ),
  (
    'RULE_MISSING_EVIDENCE_GUARD',
    'Documentary Evidence Incomplete Guard',
    'Flags verified records that lack uploaded source documentary evidence (bills/invoices).',
    'DATA_QUALITY',
    1,
    'ACTIVE',
    'CRITICAL_REVIEW',
    'missing_evidence_count',
    '>',
    0.0000,
    'Found {actual} record(s) lacking documentary evidence. Attach source invoices to maintain audit readiness.'
  ),
  (
    'RULE_DATA_QUALITY_GUARD',
    'Overall Data Quality Score Minimum',
    'Alerts when composite data quality index falls below 75 points.',
    'DATA_QUALITY',
    1,
    'ACTIVE',
    'WARNING',
    'data_quality_score',
    '<',
    75.0000,
    'Composite data quality score is {actual}/100, which is below the target minimum threshold of {threshold}. Resolve pending verifications and flagged OCR fields.'
  )
on conflict (code, version) do nothing;
