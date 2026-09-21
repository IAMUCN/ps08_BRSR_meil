-- Phase 16: Control Tower configuration (.grill/phase-16-control-tower-decisions.md).

-- Which metrics an org unit is expected to submit each period (SCHEMA_DEVIATIONS.md D16). The denominator of
-- Submission Completion % and Scope 1/2/3 Completion %, and the source of "projects with missing
-- submissions". An expectation applies to periods whose type matches the metric's frequency.
create table public.submission_expectations (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units (id),
  metric_id uuid not null references public.esg_metrics (id),
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  unique (org_unit_id, metric_id)
);
create index submission_expectations_metric_idx on public.submission_expectations (metric_id);

alter table public.submission_expectations enable row level security;
-- Readable where the org unit is readable; written only by the server (default privileges revoke writes).
create policy submission_expectations_select on public.submission_expectations
  for select to authenticated using (public.is_admin() or org_unit_id in (select public.my_org_unit_ids()));

-- BRSR Readiness % (Master Approach §34): a configurable internal indicator, never an official score.
-- Equal weights by default; an Admin can change them.
insert into public.org_settings (key, value, updated_by)
values ('brsr_readiness_weights',
        '{"submission": 1, "evidence": 1, "validation": 1, "approval": 1, "indicators": 1}'::jsonb, null)
on conflict (key) do nothing;
