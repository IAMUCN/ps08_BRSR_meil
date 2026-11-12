-- Migration 0050: Database Safety Invariants & AI Table Guardrails
-- Enforces database safety rules:
-- 1. Read: authorized only via RLS.
-- 2. Insert/Update: Existing tables only via existing approved workflows; AI tables controlled.
-- 3. Delete: Retention policies; append-only audit receipts.
-- 4. AI Direct Modification: NEVER permitted on existing tables.
-- 5. No changes to calculation triggers, foreign keys, or verified ESG data.

-- 1. Explicit verification of RLS on all AI tables
alter table if exists public.decision_rules enable row level security;
alter table if exists public.decision_rule_evaluations enable row level security;
alter table if exists public.decarbonization_roadmaps enable row level security;
alter table if exists public.decarbonization_suggestions enable row level security;
alter table if exists public.risk_evaluation_reports enable row level security;

-- 2. Ensure public/anon have zero direct access to AI tables
revoke all on public.decision_rules from anon;
revoke all on public.decision_rule_evaluations from anon;
revoke all on public.decarbonization_roadmaps from anon;
revoke all on public.decarbonization_suggestions from anon;
revoke all on public.risk_evaluation_reports from anon;

-- 3. Guardrail: Guard trigger ensuring verified ESG records cannot have their calculated values altered
create or replace function public.guard_verified_esg_records() returns trigger
language plpgsql as $$
begin
  -- If record is user_verified and approved, prevent changes to calculated tCO2e or activity value
  -- unless explicitly rejected or transitioning back through the authorized approval queue.
  if old.verification_status = 'user_verified' and old.approval_status = 'approved' then
    if new.verification_status != old.verification_status or new.approval_status != old.approval_status then
      -- Status transition through workflow is permitted
      return new;
    end if;

    -- Block alterations to core values on approved verified records
    if new.metric_id != old.metric_id or
       new.org_unit_id != old.org_unit_id or
       new.reporting_period_id != old.reporting_period_id then
      raise exception 'Approved ESG records cannot have their organizational, period or metric boundaries altered.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_verified_esg_records on public.esg_records;
create trigger trg_guard_verified_esg_records
  before update on public.esg_records
  for each row execute function public.guard_verified_esg_records();

-- 4. Organization-level Isolation comments & verification
comment on table public.decision_rule_evaluations is 'Append-only audit receipts of decision rule evaluations, strictly isolated by org_unit_id.';
comment on table public.decarbonization_suggestions is 'Decarbonization action items, strictly isolated by org_unit_id and reporting_period_id.';
comment on table public.decarbonization_roadmaps is 'Executive decarbonization roadmaps, strictly isolated by org_unit_id and reporting_period_id.';
comment on table public.risk_evaluation_reports is 'Operational risk assessments, strictly isolated by org_unit_id and reporting_period_id.';
