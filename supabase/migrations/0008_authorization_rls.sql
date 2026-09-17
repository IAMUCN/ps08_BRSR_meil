-- Authorization: helper functions, privileges, RLS policies, display-name view
-- (05_BACKEND_SCHEMA.md §16, with the approved deviations recorded in supabase/SCHEMA_DEVIATIONS.md).
--
-- Model:
--   * Reads: RLS-scoped per §16.3 (org scope + descendants, or Admin).
--   * Writes: clients (anon/authenticated) have NO insert/update/delete on any table. Every
--     lifecycle, configuration and upload mutation runs in a server-side tRPC procedure using the
--     service role, with its audit entry in the same transaction (D1-D3).
--   * Single exception: a user may mark their own notification read (D4).

------------------------------------------------------------------------------------------------
-- §16.2 helper functions
------------------------------------------------------------------------------------------------

-- Is the current user a global Admin?
create or replace function public.is_admin() returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id
    where uoa.user_id = (select auth.uid())
      and uoa.revoked_at is null
      and r.code = 'admin'
  );
$$;

-- All org_units the current user can see: assigned nodes plus every descendant.
-- `union` (not `union all`) so a malformed cyclic tree terminates instead of recursing forever.
create or replace function public.my_org_unit_ids() returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  with recursive scoped as (
    select ou.id
    from public.org_units ou
    join public.user_org_assignments uoa on uoa.org_unit_id = ou.id
    where uoa.user_id = (select auth.uid())
      and uoa.revoked_at is null
    union
    select child.id
    from public.org_units child
    join scoped s on child.parent_id = s.id
  )
  select id from scoped;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_org_unit_ids() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_org_unit_ids() to authenticated;

-- Trigger functions are never called directly by clients.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.prevent_referenced_factor_version_mutation()
  from public, anon, authenticated;

------------------------------------------------------------------------------------------------
-- Table privileges: no anonymous access, no direct client writes (D1-D3, D6)
------------------------------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;

-- Tables created by later migrations (run as postgres) start with the same posture.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger on tables from authenticated;

------------------------------------------------------------------------------------------------
-- Enable RLS on every table
------------------------------------------------------------------------------------------------

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.org_units enable row level security;
alter table public.users enable row level security;
alter table public.user_org_assignments enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.esg_categories enable row level security;
alter table public.scopes enable row level security;
alter table public.esg_metrics enable row level security;
alter table public.metric_field_requirements enable row level security;
alter table public.document_types enable row level security;
alter table public.document_type_metric_mappings enable row level security;
alter table public.validation_rules enable row level security;
alter table public.calculation_formulas enable row level security;
alter table public.conversion_factors enable row level security;
alter table public.conversion_factor_versions enable row level security;
alter table public.documents enable row level security;
alter table public.ocr_jobs enable row level security;
alter table public.ocr_extractions enable row level security;
alter table public.ocr_fields enable row level security;
alter table public.esg_records enable row level security;
alter table public.esg_record_documents enable row level security;
alter table public.verifications enable row level security;
alter table public.validation_results enable row level security;
alter table public.approvals enable row level security;
alter table public.calculations enable row level security;
alter table public.calculation_inputs enable row level security;
alter table public.brsr_sections enable row level security;
alter table public.brsr_indicators enable row level security;
alter table public.brsr_metric_mappings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.report_runs enable row level security;
alter table public.notifications enable row level security;
alter table public.org_settings enable row level security;

------------------------------------------------------------------------------------------------
-- Read policies — global reference/configuration data (readable by any signed-in user;
-- factors per §16.3 `factor_versions_select`)
------------------------------------------------------------------------------------------------

create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);
create policy reporting_periods_select on public.reporting_periods
  for select to authenticated using (true);
create policy esg_categories_select on public.esg_categories
  for select to authenticated using (true);
create policy scopes_select on public.scopes for select to authenticated using (true);
create policy esg_metrics_select on public.esg_metrics for select to authenticated using (true);
create policy metric_field_requirements_select on public.metric_field_requirements
  for select to authenticated using (true);
create policy document_types_select on public.document_types
  for select to authenticated using (true);
create policy document_type_metric_mappings_select on public.document_type_metric_mappings
  for select to authenticated using (true);
create policy validation_rules_select on public.validation_rules
  for select to authenticated using (true);
create policy calculation_formulas_select on public.calculation_formulas
  for select to authenticated using (true);
create policy conversion_factors_select on public.conversion_factors
  for select to authenticated using (true);
create policy factor_versions_select on public.conversion_factor_versions
  for select to authenticated using (true);
create policy brsr_sections_select on public.brsr_sections
  for select to authenticated using (true);
create policy brsr_indicators_select on public.brsr_indicators
  for select to authenticated using (true);
create policy brsr_metric_mappings_select on public.brsr_metric_mappings
  for select to authenticated using (true);
create policy org_settings_select on public.org_settings for select to authenticated using (true);

------------------------------------------------------------------------------------------------
-- Read policies — identity and organization
------------------------------------------------------------------------------------------------

-- §3.1: readable by the user themself and by Admin
create policy users_select on public.users for select to authenticated
  using (id = (select auth.uid()) or public.is_admin());

-- own assignments, or Admin
create policy user_org_assignments_select on public.user_org_assignments for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- §4.1: nodes within assigned scope + descendants, or Admin
create policy org_units_select on public.org_units for select to authenticated
  using (public.is_admin() or id in (select public.my_org_unit_ids()));

------------------------------------------------------------------------------------------------
-- Read policies — org-scoped evidence and lifecycle data (§16.3 pattern)
------------------------------------------------------------------------------------------------

create policy documents_select on public.documents for select to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_org_unit_ids()));

create policy ocr_jobs_select on public.ocr_jobs for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = ocr_jobs.document_id
        and d.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy ocr_extractions_select on public.ocr_extractions for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.documents d
      where d.id = ocr_extractions.document_id
        and d.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy ocr_fields_select on public.ocr_fields for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.ocr_extractions oe
      join public.documents d on d.id = oe.document_id
      where oe.id = ocr_fields.ocr_extraction_id
        and d.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy esg_records_select on public.esg_records for select to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_org_unit_ids()));

create policy esg_record_documents_select on public.esg_record_documents
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.esg_records er
      where er.id = esg_record_documents.esg_record_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy verifications_select on public.verifications for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.esg_records er
      where er.id = verifications.esg_record_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy validation_results_select on public.validation_results for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.esg_records er
      where er.id = validation_results.esg_record_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy approvals_select on public.approvals for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.esg_records er
      where er.id = approvals.esg_record_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy calculations_select on public.calculations for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.esg_records er
      where er.id = calculations.esg_record_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy calculation_inputs_select on public.calculation_inputs for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.calculations c
      join public.esg_records er on er.id = c.esg_record_id
      where c.id = calculation_inputs.calculation_id
        and er.org_unit_id in (select public.my_org_unit_ids())
    )
  );

create policy report_runs_select on public.report_runs for select to authenticated
  using (public.is_admin() or org_unit_id in (select public.my_org_unit_ids()));

-- §16.3: audit log readable by Admin only
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.is_admin());

------------------------------------------------------------------------------------------------
-- Notifications (D4): read own (Admin sees organization-level pending tasks);
-- the only client write in the database is marking one's own notification read.
------------------------------------------------------------------------------------------------

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant update (is_read) on public.notifications to authenticated;

------------------------------------------------------------------------------------------------
-- D5: narrow display-name view for "Submitted by / Verified by" (fills the undefined §14.5).
-- Unscoped by decision; exposes only id + display_name. Runs with the owner's rights, so the
-- underlying users table keeps its self-or-Admin policy. Simple views are auto-updatable, so
-- every write privilege is explicitly withheld.
------------------------------------------------------------------------------------------------

create view public.user_display_names as
  select id, display_name from public.users;

revoke all on public.user_display_names from public, anon, authenticated;
grant select on public.user_display_names to authenticated;
