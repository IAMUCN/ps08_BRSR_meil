-- Submission window guidance dates for reporting periods (supabase/SCHEMA_DEVIATIONS.md D10;
-- .grill/phase-4-admin-foundation-decisions.md). Master Approach §7C "Define submission windows".
-- Guidance only: uploads remain gated by status = 'open' (manual open/close).

alter table public.reporting_periods
  add column submission_opens_on date,
  add column submission_closes_on date,
  add constraint reporting_periods_submission_window_check
    check (
      submission_opens_on is null
      or submission_closes_on is null
      or submission_closes_on >= submission_opens_on
    );
