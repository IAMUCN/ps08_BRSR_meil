-- Canonical ESG record, evidence links, lifecycle history and calculations
-- (05_BACKEND_SCHEMA.md §9, §10.3-§10.4).

-- §9.1 — one table for emission and non-emission metrics (scope/calculation nullable)
create table public.esg_records (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units (id),
  reporting_period_id uuid not null references public.reporting_periods (id),
  metric_id uuid not null references public.esg_metrics (id),
  scope_id uuid references public.scopes (id),
  activity_value_raw numeric,
  activity_value_verified numeric,
  activity_unit text,
  activity_value_normalized numeric,
  normalized_unit text,
  submitted_by uuid not null references public.users (id),
  verified_by uuid references public.users (id),
  verification_status public.record_verification_status not null default 'draft',
  validation_status public.record_validation_status not null default 'pending',
  approval_status public.record_approval_status not null default 'not_submitted',
  calculation_status public.record_calculation_status not null default 'not_applicable',
  data_quality_state public.data_quality_state not null default 'incomplete',
  is_duplicate_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint esg_records_verified_non_negative
    check (activity_value_verified is null or activity_value_verified >= 0)
);

create index esg_records_org_unit_id_idx on public.esg_records (org_unit_id);
create index esg_records_reporting_period_id_idx on public.esg_records (reporting_period_id);
create index esg_records_metric_id_idx on public.esg_records (metric_id);
create index esg_records_scope_id_idx on public.esg_records (scope_id);
create index esg_records_submitted_by_idx on public.esg_records (submitted_by);
create index esg_records_validation_status_idx on public.esg_records (validation_status);
create index esg_records_approval_status_idx on public.esg_records (approval_status);
create index esg_records_created_at_idx on public.esg_records (created_at);
-- §18 composite indexes
create index esg_records_org_period_metric_idx
  on public.esg_records (org_unit_id, reporting_period_id, metric_id);
create index esg_records_org_period_validation_idx
  on public.esg_records (org_unit_id, reporting_period_id, validation_status);
create index esg_records_org_period_approval_idx
  on public.esg_records (org_unit_id, reporting_period_id, approval_status);

-- §9.2 — many-to-many evidence link (MVP exercises one document -> one record only)
create table public.esg_record_documents (
  esg_record_id uuid not null references public.esg_records (id),
  document_id uuid not null references public.documents (id),
  is_primary boolean not null default false,
  added_by uuid not null references public.users (id),
  added_at timestamptz not null default now(),
  primary key (esg_record_id, document_id)
);

create unique index esg_record_documents_single_primary
  on public.esg_record_documents (esg_record_id)
  where is_primary;

-- §9.3 — verification event, append-only
create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  esg_record_id uuid not null references public.esg_records (id),
  -- null for a flagged manual-exception entry
  ocr_extraction_id uuid references public.ocr_extractions (id),
  verified_by uuid not null references public.users (id),
  verified_at timestamptz not null default now(),
  is_manual_exception boolean not null default false,
  notes text
);

create index verifications_esg_record_id_idx on public.verifications (esg_record_id);

-- §9.4 — one row per rule evaluation, append-only
create table public.validation_results (
  id uuid primary key default gen_random_uuid(),
  esg_record_id uuid not null references public.esg_records (id),
  -- null for a built-in structural check not backed by a configurable rule row
  validation_rule_id uuid references public.validation_rules (id),
  rule_type public.validation_rule_type not null,
  result public.validation_result not null,
  message text,
  evaluated_at timestamptz not null default now()
);

create index validation_results_esg_record_id_idx on public.validation_results (esg_record_id);
create index validation_results_result_idx on public.validation_results (result);

-- §9.5 — append-only approval history; esg_records.approval_status is the current state.
-- Self-approval (submitter or verifier) is enforced by the server-side approval procedure
-- (supabase/SCHEMA_DEVIATIONS.md D1); clients cannot write this table.
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  esg_record_id uuid not null references public.esg_records (id),
  action public.approval_action not null,
  -- null only for the system `submitted` transition
  decided_by uuid references public.users (id),
  decided_at timestamptz not null default now(),
  reason text
);

create index approvals_esg_record_id_idx on public.approvals (esg_record_id);
create index approvals_decided_by_idx on public.approvals (decided_by);

-- §10.3 — append-only calculation trace
create table public.calculations (
  id uuid primary key default gen_random_uuid(),
  esg_record_id uuid not null references public.esg_records (id),
  conversion_factor_version_id uuid references public.conversion_factor_versions (id),
  calculation_formula_id uuid references public.calculation_formulas (id),
  input_value numeric not null,
  input_unit text not null,
  normalized_value numeric not null,
  normalized_unit text not null,
  factor_value_snapshot numeric,
  result_value numeric not null,
  result_unit text not null,
  scope_id uuid references public.scopes (id),
  engine_version text not null,
  calculated_at timestamptz not null default now(),
  is_current boolean not null default true
);

create unique index calculations_single_current
  on public.calculations (esg_record_id)
  where is_current;
create index calculations_esg_record_id_idx on public.calculations (esg_record_id);
create index calculations_is_current_idx on public.calculations (is_current);
create index calculations_scope_id_idx on public.calculations (scope_id);

-- §10.4 — named inputs for multi-input formulas (e.g. withdrawal - discharge)
create table public.calculation_inputs (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references public.calculations (id),
  input_key text not null,
  input_value numeric not null,
  input_unit text not null,
  source_esg_record_id uuid references public.esg_records (id)
);
