-- Phase 2 migration-and-seed smoke test (06_IMPLEMENTATION_PLAN.md Phase 2 test requirements),
-- plus the approved access model in supabase/SCHEMA_DEVIATIONS.md. Run: `pnpm db:test`.
-- Everything runs in one transaction and is rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(37);

------------------------------------------------------------------------------------------------
-- Schema shape and security posture
------------------------------------------------------------------------------------------------

select tables_are('public', array[
  'roles', 'permissions', 'role_permissions', 'org_units', 'users', 'user_org_assignments',
  'reporting_periods', 'esg_categories', 'scopes', 'esg_metrics', 'metric_field_requirements',
  'document_types', 'document_type_metric_mappings', 'validation_rules', 'calculation_formulas',
  'conversion_factors', 'conversion_factor_versions', 'documents', 'ocr_jobs', 'ocr_extractions',
  'ocr_fields', 'esg_records', 'esg_record_documents', 'verifications', 'validation_results',
  'approvals', 'calculations', 'calculation_inputs', 'brsr_sections', 'brsr_indicators',
  'brsr_disclosures',
  'brsr_metric_mappings', 'audit_logs', 'report_runs', 'notifications', 'org_settings',
  -- Added by documented deviations (supabase/SCHEMA_DEVIATIONS.md D16, D19, D22, D24, D29, D34, D36, D37, D42, D43, D48, D49, D50, D51, D56), not by drift.
  'rate_limit_events', 'submission_expectations', 'password_reset_otps', 'document_bundle_parts',
  'org_levels', 'chat_conversations', 'chat_messages', 'org_unit_parents',
  'carbon_credits', 'carbon_credit_transactions', 'internal_carbon_prices', 'capex_carbon_evaluations',
  'user_invitations', 'user_sessions', 'report_forwards', 'reminder_sends',
  'carbon_credit_links', 'emission_alerts', 'emission_alert_sends', 'demo_requests',
  -- Added by documented deviations for Decision Intelligence (D57-D65, migrations 0067-0075)
  'decision_rules', 'decision_rule_evaluations', 'decarbonization_suggestions', 'decarbonization_roadmaps',
  'risk_evaluation_reports', 'recommendations_reports', 'ai_providers', 'ai_security_policies',
  'rag_knowledge_chunks', 'predictive_forecast_snapshots', 'what_if_scenario_simulations'
], 'public schema has the 35 tables from 05_BACKEND_SCHEMA.md plus documented deviations only');

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0, 'RLS is enabled on every public table');

select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as priv
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and has_table_privilege('authenticated', c.oid, priv)),
  0, 'authenticated has no table-level write privilege on any table or view');

select is(
  (select count(*)::int
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and has_table_privilege('anon', c.oid, 'SELECT')),
  0, 'anon cannot read any table or view');

select ok(has_column_privilege('authenticated', 'public.notifications', 'is_read', 'UPDATE'),
  'authenticated may update notifications.is_read');
select ok(not has_column_privilege('authenticated', 'public.notifications', 'title', 'UPDATE'),
  'authenticated may not update any other notifications column');
select ok(has_table_privilege('authenticated', 'public.user_display_names', 'SELECT'),
  'authenticated can read user_display_names');
select ok(not has_column_privilege('authenticated', 'public.user_display_names', 'display_name', 'UPDATE'),
  'authenticated cannot write through user_display_names');

------------------------------------------------------------------------------------------------
-- Seed data
------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.roles where is_system_role), 8, '8 system roles');
select is((select count(*)::int from public.permissions), 20, '20 permissions');
select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
           where r.code = 'admin'), 20, 'admin holds every permission');
select set_eq(
  $$select p.code from public.role_permissions rp join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id where r.code = 'corporate_esg'$$,
  array['approval.decide', 'monitoring.view', 'document.upload', 'record.verify', 'chat.use', 'carbon_credit.view', 'carbon_credit.manage', 'icp.manage', 'validation.review', 'report.generate'],
  'corporate_esg permissions match the approved catalogue');
-- Seeded grants must still be there; an Admin may add more at runtime (Roles & Permissions, Phase 4),
-- so this is a subset check rather than an exact match.
select is(
  (select count(*)::int from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id
   where r.code = 'project_manager' and p.code in ('document.upload', 'record.verify')),
  2,
  'project_manager keeps its seeded permissions');
-- Phase 2 seeds the three top-level scopes; Phase 12 adds Scope 3's categories as child rows.
select set_eq($$select code from public.scopes where parent_scope_id is null$$,
  array['SCOPE_1', 'SCOPE_2', 'SCOPE_3'],
  'scopes seeded as Scope 1, 2 and the Scope 3 parent');
select is((select count(*)::int from public.org_units where parent_id is null and unit_type = 'group'),
  1, 'single root group');
-- Diesel and grid electricity are the Phase 2 seeds; later phases add more fuels.
select is((select count(*)::int from public.document_type_metric_mappings map
             join public.esg_metrics m on m.id = map.metric_id
            where m.code in ('DIESEL_CONSUMPTION', 'GRID_ELECTRICITY')), 2,
  'diesel and grid electricity document-to-metric mappings');
select is((select count(*)::int from public.reporting_periods where status = 'open'), 1,
  'one open reporting period (seed.sql)');

------------------------------------------------------------------------------------------------
-- Fixtures (as postgres): Admin C at MEIL, PM A at Project X, PM B at Project Y
------------------------------------------------------------------------------------------------

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-4111-8111-111111111111', 'pm.x@example.test', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'pm.y@example.test', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'admin@example.test', 'authenticated', 'authenticated');

insert into public.users (id, display_name, email) values
  ('11111111-1111-4111-8111-111111111111', 'PM Project X', 'pm.x@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'PM Project Y', 'pm.y@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'Test Admin', 'admin@example.test');

insert into public.org_units (parent_id, unit_type, name, code)
select id, 'project', 'Project Y', 'PRJ-Y' from public.org_units where code = 'SUB-A';

-- Whoever already holds the Super Admin role in this database is set aside first: at most two may hold it
-- (migration 0050), and this fixture adds one. Rolled back with the rest of the test.
update public.user_org_assignments uoa set revoked_at = now()
from public.roles r where r.id = uoa.role_id and r.code = 'admin' and uoa.revoked_at is null;
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select a.user_id::uuid, ou.id, r.id, '33333333-3333-4333-8333-333333333333'
from (values
  ('33333333-3333-4333-8333-333333333333', 'MEIL', 'admin'),
  ('11111111-1111-4111-8111-111111111111', 'PRJ-X', 'project_manager'),
  ('22222222-2222-4222-8222-222222222222', 'PRJ-Y', 'project_manager')
) as a (user_id, org_code, role_code)
join public.org_units ou on ou.code = a.org_code
join public.roles r on r.code = a.role_code;

insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name,
  mime_type, file_size_bytes, file_hash, uploaded_by)
select '44444444-4444-4444-8444-444444444444', ou.id, rp.id, 'evidence/test/original.pdf',
  'diesel_invoice_synthetic.pdf', 'application/pdf', 1024, 'synthetic-hash',
  '11111111-1111-4111-8111-111111111111'
from public.org_units ou, public.reporting_periods rp
where ou.code = 'PRJ-X' and rp.status = 'open';

insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by)
select '55555555-5555-4555-8555-555555555555', ou.id, rp.id, m.id, m.scope_id,
  '11111111-1111-4111-8111-111111111111'
from public.org_units ou, public.reporting_periods rp, public.esg_metrics m
where ou.code = 'PRJ-X' and rp.status = 'open' and m.code = 'DIESEL_CONSUMPTION';

insert into public.notifications (id, user_id, type, title, message, deep_link_path) values
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111',
   'verification_needed', 'Synthetic', 'Synthetic', '/app/verify/44444444-4444-4444-8444-444444444444');

------------------------------------------------------------------------------------------------
-- Database constraints and triggers
------------------------------------------------------------------------------------------------

-- Several periods may be open at once since migration 0056 (a month's bills arrive after it ends).
select lives_ok(
  $$insert into public.reporting_periods (label, start_date, end_date, status)
    values ('October 2026', '2026-10-01', '2026-10-31', 'open')$$,
  'a second open reporting period is allowed (migration 0056)');

insert into public.conversion_factors (id, activity_type, name)
values ('77777777-7777-4777-8777-777777777777', 'DIESEL', 'Synthetic diesel factor');
insert into public.conversion_factor_versions (id, conversion_factor_id, version_number, value,
  input_unit, output_unit, source_reference, effective_from, status, created_by,
  approved_by, approved_at, self_approved)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 1, 1.0,
  'L', 'kgCO2e', 'SYNTHETIC TEST VALUE — not a real factor', '2026-01-01', 'active',
  '33333333-3333-4333-8333-333333333333',
  '33333333-3333-4333-8333-333333333333', now(), true);
insert into public.calculations (esg_record_id, conversion_factor_version_id, input_value, input_unit,
  normalized_value, normalized_unit, factor_value_snapshot, result_value, result_unit, engine_version)
values ('55555555-5555-4555-8555-555555555555', '88888888-8888-4888-8888-888888888888', 1, 'L',
  1, 'L', 1.0, 1, 'kgCO2e', 'test');

select throws_ok(
  $$update public.conversion_factor_versions set value = 2.0
    where id = '88888888-8888-4888-8888-888888888888'$$,
  'P0001', null, 'a factor version referenced by a calculation cannot be mutated');

------------------------------------------------------------------------------------------------
-- As PM A (scoped to Project X)
------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-4111-8111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from public.esg_records where id = '55555555-5555-4555-8555-555555555555'), 1, 'PM A sees the Project X record');
select is((select count(*)::int from public.documents where id = '44444444-4444-4444-8444-444444444444'), 1, 'PM A sees the Project X document');
select is((select count(*)::int from public.org_units where code in ('PRJ-X', 'PRJ-X-S1'))
          + (select count(*)::int from public.org_units where code in ('MEIL', 'SUB-A', 'PRJ-Y')) * 100,
  2, 'PM A sees Project X and its site, but not the group, subsidiary or Project Y');
select is((select count(*)::int from public.users), 1, 'PM A sees only their own users row');
select is((select count(*)::int from public.user_display_names
           where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
                        '33333333-3333-4333-8333-333333333333')), 3,
  'PM A can resolve display names of users the users table hides (unscoped view)');

select throws_ok(
  $$insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, submitted_by)
    select org_unit_id, reporting_period_id, metric_id, submitted_by from public.esg_records$$,
  '42501', null, 'PM A cannot insert esg_records directly');
select throws_ok(
  $$update public.esg_records set approval_status = 'approved', validation_status = 'validated'
    where id = '55555555-5555-4555-8555-555555555555'$$,
  '42501', null, 'PM A cannot set lifecycle status directly (self-approval hole closed)');
select throws_ok(
  $$insert into public.approvals (esg_record_id, action, decided_by)
    values ('55555555-5555-4555-8555-555555555555', 'approved',
            '33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'PM A cannot insert approvals or impersonate an approver');
select throws_ok(
  $$insert into public.audit_logs (event_type, entity_type, entity_id)
    values ('test', 'esg_record', '55555555-5555-4555-8555-555555555555')$$,
  '42501', null, 'PM A cannot write audit_logs');
select throws_ok(
  $$insert into public.documents (org_unit_id, reporting_period_id, storage_path, file_name,
      mime_type, file_size_bytes, file_hash, uploaded_by)
    select org_unit_id, reporting_period_id, 'x', 'x', 'application/pdf', 1, 'x', uploaded_by
    from public.documents$$,
  '42501', null, 'PM A cannot insert documents directly (server-issued uploads only)');
select lives_ok(
  $$update public.notifications set is_read = true
    where id = '66666666-6666-4666-8666-666666666666'$$,
  'PM A can mark their own notification read');
select throws_ok(
  $$update public.notifications set title = 'changed'
    where id = '66666666-6666-4666-8666-666666666666'$$,
  '42501', null, 'PM A cannot change any other notification column');

------------------------------------------------------------------------------------------------
-- As PM B (scoped to Project Y)
------------------------------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "22222222-2222-4222-8222-222222222222", "role": "authenticated"}', true);

select is((select count(*)::int from public.esg_records where id = '55555555-5555-4555-8555-555555555555'), 0, 'PM B cannot see Project X records');
select is((select count(*)::int from public.documents where id = '44444444-4444-4444-8444-444444444444'), 0, 'PM B cannot see Project X documents');

with updated as (
  update public.notifications set is_read = false
  where id = '66666666-6666-4666-8666-666666666666'
  returning 1
)
select is(count(*)::int, 0, 'PM B cannot mark another user''s notification') from updated;

------------------------------------------------------------------------------------------------
-- As Admin C
------------------------------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub": "33333333-3333-4333-8333-333333333333", "role": "authenticated"}', true);

select is((select count(*)::int from public.esg_records where id = '55555555-5555-4555-8555-555555555555'), 1, 'Admin sees records across the organization');
select is((select count(*)::int from public.org_units where code in ('MEIL', 'SUB-A', 'PRJ-X', 'PRJ-X-S1', 'PRJ-Y')), 5,
  'Admin sees the whole hierarchy');
select throws_ok(
  $$insert into public.conversion_factors (activity_type, name) values ('PETROL', 'x')$$,
  '42501', null, 'Admin cannot write configuration directly (server-only config writes)');

select * from finish();
rollback;
