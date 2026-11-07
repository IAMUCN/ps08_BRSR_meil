-- Forwarding a report for verification up the organisation (feature_enhancement.md Phase 4, requirement 9;
-- SCHEMA_DEVIATIONS D48; .grill/feature-enhancement-roadmap-decisions.md, "Phase 4 decisions").
--
-- One row per step: a report forwarded from a unit to the Administrators of the next unit up that has any
-- (`to_org_unit_id`), or to the Super Admins when no unit above has an Administrator (`to_org_unit_id` null).
-- The receiver verifies it (and may forward it on: a new row from their unit, `previous_forward_id` pointing
-- back) or returns it with a reason. Who may forward and decide is checked by the server
-- (lib/trpc/routers/report-forwarding.ts); every step writes an audit entry in the same transaction.
--
-- Additive: one table, server-only. Undo: drop table public.report_forwards.

create table public.report_forwards (
  id uuid primary key default gen_random_uuid(),
  report_run_id uuid not null references public.report_runs (id),
  -- The unit the report leaves from: the report's own unit first, then the unit that verified it.
  from_org_unit_id uuid not null references public.org_units (id),
  -- Whose Administrators decide; null = the Super Admins.
  to_org_unit_id uuid references public.org_units (id),
  forwarded_by uuid not null references public.users (id),
  note text check (char_length(note) <= 1000),
  previous_forward_id uuid references public.report_forwards (id),
  status text not null default 'pending' check (status in ('pending', 'verified', 'returned')),
  decided_by uuid references public.users (id),
  decided_at timestamptz,
  decision_reason text check (char_length(decision_reason) <= 1000),
  created_at timestamptz not null default now(),
  constraint report_forwards_decided check (
    (status = 'pending') = (decided_by is null and decided_at is null)),
  constraint report_forwards_return_reason check (status <> 'returned' or decision_reason is not null)
);

-- One open step per report and receiver.
create unique index report_forwards_one_pending
  on public.report_forwards (report_run_id, coalesce(to_org_unit_id, '00000000-0000-0000-0000-000000000000'))
  where status = 'pending';
create index report_forwards_report_idx on public.report_forwards (report_run_id);
create index report_forwards_to_idx on public.report_forwards (to_org_unit_id) where status = 'pending';

-- Server-only: RLS on, no policies, no browser grants.
alter table public.report_forwards enable row level security;
revoke all on public.report_forwards from anon, authenticated;
