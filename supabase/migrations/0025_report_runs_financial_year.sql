-- Phase 17: reporting (.grill/phase-17-reporting-decisions.md).

-- A BRSR report covers one period or one April–March financial year (SCHEMA_DEVIATIONS.md D17).
alter table public.report_runs alter column reporting_period_id drop not null;
alter table public.report_runs add column financial_year integer;
alter table public.report_runs add constraint report_runs_one_coverage
  check ((reporting_period_id is null) <> (financial_year is null));

-- Rendered reports: private, PDF only, read only through the server's Admin-checked route.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 20971520, array['application/pdf']);
