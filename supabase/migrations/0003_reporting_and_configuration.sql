-- Reporting periods, scopes, ESG configuration and conversion factors
-- (05_BACKEND_SCHEMA.md §5, §6, §7, §10.1-§10.2).

-- §5.1 — global calendar of periods
create table public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  period_type public.reporting_period_type not null default 'monthly',
  start_date date not null,
  end_date date not null,
  status public.reporting_period_status not null default 'draft',
  opened_at timestamptz,
  closed_at timestamptz,
  constraint reporting_periods_dates_check check (end_date > start_date)
);

-- DB-level backstop for "at most one open period"; also serves the hot-path open-period lookup.
create unique index reporting_periods_single_open
  on public.reporting_periods (status)
  where status = 'open';

-- §6.1
create table public.esg_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- null = visible to every role's Upload category list
  owning_role_id uuid references public.roles (id),
  description text
);

-- §7.1 — configurable lookup so Scope 3 categories are data, not schema
create table public.scopes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  parent_scope_id uuid references public.scopes (id),
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

-- §6.2
create table public.esg_metrics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.esg_categories (id),
  code text not null unique,
  name text not null,
  unit text not null,
  scope_id uuid references public.scopes (id),
  requires_conversion_factor boolean not null default false,
  requires_calculation boolean not null default false,
  frequency public.metric_frequency not null default 'monthly',
  description text,
  deleted_at timestamptz
);

create index esg_metrics_category_id_idx on public.esg_metrics (category_id);
create index esg_metrics_scope_id_idx on public.esg_metrics (scope_id);

-- §6.3
create table public.metric_field_requirements (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.esg_metrics (id),
  field_key text not null,
  field_label text not null,
  data_type public.field_data_type not null,
  is_required boolean not null default true,
  -- critical fields always require explicit acknowledgment before Confirm, regardless of confidence
  is_critical boolean not null default false,
  unique (metric_id, field_key)
);

-- §6.4
create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  accepted_mime_types text[] not null default '{application/pdf,image/jpeg,image/png}',
  description text
);

-- §6.5
create table public.document_type_metric_mappings (
  document_type_id uuid not null references public.document_types (id),
  metric_id uuid not null references public.esg_metrics (id),
  primary key (document_type_id, metric_id)
);

-- §6.6
create table public.validation_rules (
  id uuid primary key default gen_random_uuid(),
  -- null = applies globally across all metrics
  metric_id uuid references public.esg_metrics (id),
  rule_type public.validation_rule_type not null,
  rule_definition jsonb not null,
  severity public.validation_severity not null default 'hard_fail',
  description text,
  is_active boolean not null default true
);

create index validation_rules_metric_id_idx on public.validation_rules (metric_id);
create index validation_rules_rule_type_idx on public.validation_rules (rule_type);

-- §6.7
create table public.calculation_formulas (
  id uuid primary key default gen_random_uuid(),
  metric_id uuid not null references public.esg_metrics (id),
  version integer not null default 1,
  formula_type public.formula_type not null default 'direct_multiply',
  formula_definition jsonb not null,
  effective_from date not null,
  effective_to date,
  status public.formula_status not null default 'draft',
  unique (metric_id, version)
);

create index calculation_formulas_metric_id_status_idx
  on public.calculation_formulas (metric_id, status);

-- §10.1 — stable factor identity across versions
create table public.conversion_factors (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- §10.2 — versioned, effective-dated values; calculations reference these rows, never §10.1 directly
create table public.conversion_factor_versions (
  id uuid primary key default gen_random_uuid(),
  conversion_factor_id uuid not null references public.conversion_factors (id),
  version_number integer not null,
  value numeric not null,
  input_unit text not null,
  output_unit text not null,
  source_reference text not null,
  geography text,
  effective_from date not null,
  effective_to date,
  status public.factor_version_status not null default 'draft',
  notes text,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  unique (conversion_factor_id, version_number),
  constraint conversion_factor_versions_effective_dates_check
    check (effective_to is null or effective_to > effective_from)
);

create index conversion_factor_versions_factor_status_idx
  on public.conversion_factor_versions (conversion_factor_id, status);
create index conversion_factor_versions_effective_idx
  on public.conversion_factor_versions (effective_from, effective_to);
