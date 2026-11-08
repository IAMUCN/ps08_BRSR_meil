-- Report templates (feature_enhancement.md Phase 8.1, requirement 31; SCHEMA_DEVIATIONS D52;
-- .grill/feature-enhancement-roadmap-decisions.md, "Phase 8 decisions").
--
--   * `report_runs.template`: which layout a run printed — 'brsr' (SEBI's full BRSR format, what every run until
--     now was), 'brsr_core' (the BRSR Core KPIs), 'ghg' (greenhouse gas inventory), 'summary' (executive
--     summary). Every template prints the same frozen snapshot of approved figures; only the layout differs.
--   * `report_runs.workbook_path`: the Excel workbook stored beside the PDF (the GHG inventory has one).
--   * The private `reports` bucket also takes .xlsx files (it took PDFs only); still private, still served only
--     through the server route that checks the session, the permission and the org scope.
--
-- Additive: existing runs read as 'brsr' with no workbook. Undo:
--   alter table public.report_runs drop column workbook_path, drop column template;
--   update storage.buckets set allowed_mime_types = array['application/pdf'] where id = 'reports'.

alter table public.report_runs
  add column template text not null default 'brsr'
    check (template in ('brsr', 'brsr_core', 'ghg', 'summary')),
  add column workbook_path text check (workbook_path is null or workbook_path ~ '^[0-9a-f-]{36}\.xlsx$');

update storage.buckets
set allowed_mime_types = array['application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
where id = 'reports';
