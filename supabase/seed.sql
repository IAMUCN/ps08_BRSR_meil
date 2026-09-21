-- Local development fixtures only — applied by `supabase db reset` (config.toml [db.seed]),
-- never by `supabase db push`. Synthetic data; no real MEIL records (real documents only after Phase 18).

-- Minimal test hierarchy under the MEIL root (Master Approach §45 demo):
-- MEIL (group) -> Subsidiary A -> Project X -> Project X Site 1
with subsidiary as (
  insert into public.org_units (parent_id, unit_type, name, code)
  select id, 'subsidiary', 'Subsidiary A', 'SUB-A'
  from public.org_units
  where code = 'MEIL'
  returning id
),
project as (
  insert into public.org_units (parent_id, unit_type, name, code)
  select id, 'project', 'Project X', 'PRJ-X'
  from subsidiary
  returning id
)
insert into public.org_units (parent_id, unit_type, name, code)
select id, 'site', 'Project X Site 1', 'PRJ-X-S1'
from project;

-- One open monthly reporting period (uploads are blocked unless a period is open)
insert into public.reporting_periods (label, period_type, start_date, end_date, status, opened_at)
values ('September 2026', 'monthly', '2026-09-01', '2026-09-30', 'open', now());

-- A second project with nothing submitted, so "projects with missing submissions" has something to show.
insert into public.org_units (parent_id, unit_type, name, code)
select id, 'project', 'Project W', 'PRJ-W' from public.org_units where code = 'SUB-A';

-- Expected submissions (Phase 16, D16): what each project must file every period of the metric's frequency.
insert into public.submission_expectations (org_unit_id, metric_id)
select o.id, m.id
from (values
  ('PRJ-X', 'DIESEL_CONSUMPTION'), ('PRJ-X', 'GRID_ELECTRICITY'), ('PRJ-X', 'WATER_CONSUMPTION'),
  ('PRJ-X', 'WASTE_DISPOSED'), ('PRJ-X', 'BUSINESS_TRAVEL_SPEND'), ('PRJ-X', 'WORKFORCE_GENDER'),
  ('PRJ-W', 'DIESEL_CONSUMPTION'), ('PRJ-W', 'GRID_ELECTRICITY')
) as e (org_code, metric_code)
join public.org_units o on o.code = e.org_code
join public.esg_metrics m on m.code = e.metric_code;
