-- BRSR mapping, audit log, report runs, notifications and settings
-- (05_BACKEND_SCHEMA.md §11, §12, §13, §14).

-- §11.1 — codes [VERIFY AGAINST AUTHORITATIVE BRSR SOURCE] before populating
create table public.brsr_sections (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

-- §11.2
create table public.brsr_indicators (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.brsr_sections (id),
  code text not null unique,
  question_text text not null,
  -- Section C only
  indicator_type public.brsr_indicator_type,
  description text,
  deleted_at timestamptz
);

-- §11.3 — many-to-many metric <-> indicator
create table public.brsr_metric_mappings (
  id uuid primary key default gen_random_uuid(),
  esg_metric_id uuid not null references public.esg_metrics (id),
  brsr_indicator_id uuid not null references public.brsr_indicators (id),
  mapping_notes text,
  unique (esg_metric_id, brsr_indicator_id)
);

-- §12.1 — append-only; entity_id is intentionally polymorphic (no FK)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  -- null for system-initiated events (e.g. OCR worker completion)
  user_id uuid references public.users (id),
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_user_id_idx on public.audit_logs (user_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at);

-- §13.1 — every report is a one-shot run.
-- snapshot_data must list contributing esg_record_ids per BRSR indicator/metric
-- (answers Master §30 "Included_In_Report").
create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.users (id),
  org_unit_id uuid not null references public.org_units (id),
  reporting_period_id uuid not null references public.reporting_periods (id),
  report_type public.report_type not null,
  status public.report_run_status not null default 'pending',
  storage_path text,
  snapshot_data jsonb,
  error_message text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

create index report_runs_org_period_idx on public.report_runs (org_unit_id, reporting_period_id);
create index report_runs_status_idx on public.report_runs (status);
create index report_runs_requested_by_idx on public.report_runs (requested_by);

-- §14.1 — related_entity_id is polymorphic (deep-link target only)
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  type text not null,
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  deep_link_path text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_is_read_idx on public.notifications (user_id, is_read);
create index notifications_created_at_idx on public.notifications (created_at);

-- §14.2 — key-value platform settings
create table public.org_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_by uuid not null references public.users (id),
  updated_at timestamptz not null default now()
);
