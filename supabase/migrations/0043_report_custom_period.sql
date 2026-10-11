-- A BRSR report may also cover a custom range of reporting periods (owner's request, 2026-10-11;
-- SCHEMA_DEVIATIONS.md D35): every reporting period that lies wholly between two dates.
alter table public.report_runs add column period_from date;
alter table public.report_runs add column period_to date;

alter table public.report_runs drop constraint report_runs_one_coverage;
alter table public.report_runs add constraint report_runs_one_coverage check (
  (period_from is null) = (period_to is null)
  and (period_from is null or period_from <= period_to)
  and num_nonnulls(reporting_period_id, financial_year, period_from) = 1
);
