-- Reference/configuration data required in every environment (06_IMPLEMENTATION_PLAN.md Phase 2).
-- Local-development fixtures (test hierarchy below the root, an open reporting period) live in
-- supabase/seed.sql instead, so they are never pushed to a hosted project by `db push`.

------------------------------------------------------------------------------------------------
-- Roles (05_BACKEND_SCHEMA.md §3.2) — the 7 system roles
------------------------------------------------------------------------------------------------
insert into public.roles (code, name, description, is_system_role) values
  ('admin', 'Admin', 'Full system control.', true),
  ('hr', 'HR', 'Employee/workforce-related source documents and BRSR HR indicators.', true),
  ('project_manager', 'Project Manager',
   'Project-level Scope 1, Scope 2 and applicable Scope 3 evidence.', true),
  ('ehs', 'EHS / Environment',
   'Water, waste, air emissions, safety and environmental certification evidence.', true),
  ('finance_csr', 'Finance / CSR',
   'CSR expenditure, beneficiary, fines/penalties and related financial evidence.', true),
  ('procurement', 'Procurement',
   'Procurement/vendor evidence, including local/MSME/women-led/SHG/SC-ST classifications.', true),
  ('corporate_esg', 'Corporate ESG / Sustainability',
   'Cross-entity monitoring, consolidation review, approval and reporting readiness oversight.',
   true);

------------------------------------------------------------------------------------------------
-- Permission catalogue (approved 2026-09-17; .grill/phase-2-database-decisions.md)
------------------------------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('org.manage', 'Create/edit/deactivate organization hierarchy nodes.'),
  ('user.manage', 'Create/edit/activate/deactivate users and their role/org-scope assignments.'),
  ('role.manage', 'Create roles and edit role permission sets.'),
  ('period.manage', 'Create, open and close reporting periods.'),
  ('settings.manage', 'Edit platform settings (OCR confidence threshold, retention policy).'),
  ('factor.manage', 'Add and version conversion/emission factors.'),
  ('brsr_mapping.manage', 'Maintain ESG metric to BRSR indicator mappings.'),
  ('validation.review', 'Review flagged/failed validation results; accept anomalies or return records.'),
  ('approval.decide', 'Approve or return validated records.'),
  ('report.generate', 'Generate consolidated ESG/BRSR reports.'),
  ('audit.view', 'View the audit trail.'),
  ('monitoring.view', 'View cross-project submission/readiness monitoring.'),
  ('document.upload', 'Upload evidence documents within assigned scope and role categories.'),
  ('record.verify', 'Verify, edit and confirm OCR-extracted values within assigned scope.');

-- Admin: every permission
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin';

-- Corporate ESG / Sustainability: approval + monitoring + upload/verify
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p
  on p.code in ('approval.decide', 'monitoring.view', 'document.upload', 'record.verify')
where r.code = 'corporate_esg';

-- Functional contributor roles: upload + verify
-- (which categories each may upload into is controlled by esg_categories.owning_role_id)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('document.upload', 'record.verify')
where r.code in ('hr', 'project_manager', 'ehs', 'finance_csr', 'procurement');

------------------------------------------------------------------------------------------------
-- Scopes (§7.1) — Scope 3 child categories are added in Phase 12
------------------------------------------------------------------------------------------------
insert into public.scopes (code, name, is_active, sort_order) values
  ('SCOPE_1', 'Scope 1', true, 1),
  ('SCOPE_2', 'Scope 2', true, 2),
  ('SCOPE_3', 'Scope 3', true, 3);

------------------------------------------------------------------------------------------------
-- Organization root (§4.1) — single-organization deployment for MEIL (§1)
------------------------------------------------------------------------------------------------
insert into public.org_units (parent_id, unit_type, name, code)
values (null, 'group', 'MEIL', 'MEIL');

------------------------------------------------------------------------------------------------
-- Minimum ESG configuration for the Phase 5-11 critical path: Diesel (Scope 1) and
-- Grid Electricity (Scope 2). Field requirements, formulas and factor values are seeded in
-- Phases 10-11 (factor values [VERIFY AGAINST AUTHORITATIVE SOURCE]).
------------------------------------------------------------------------------------------------
insert into public.esg_categories (name, owning_role_id, description)
select 'Fuel & Energy', r.id,
       'Project-level fuel and purchased electricity evidence (Scope 1 and Scope 2).'
from public.roles r
where r.code = 'project_manager';

insert into public.esg_metrics (
  category_id, code, name, unit, scope_id,
  requires_conversion_factor, requires_calculation, frequency, description
)
select c.id, m.code, m.name, m.unit, s.id, true, true, 'monthly', m.description
from public.esg_categories c
cross join (values
  ('DIESEL_CONSUMPTION', 'Diesel Consumption', 'L', 'SCOPE_1',
   'Diesel consumed in owned/controlled equipment, vehicles, generators and machinery.'),
  ('GRID_ELECTRICITY', 'Grid Electricity Consumption', 'kWh', 'SCOPE_2',
   'Purchased grid electricity.')
) as m (code, name, unit, scope_code, description)
join public.scopes s on s.code = m.scope_code
where c.name = 'Fuel & Energy';

insert into public.document_types (code, name, description) values
  ('DIESEL_INVOICE', 'Diesel Invoice', 'Fuel invoice evidencing diesel purchase/consumption.'),
  ('ELECTRICITY_BILL', 'Electricity Bill', 'Utility bill evidencing grid electricity consumption.');

-- Master Approach §13 document-to-metric mapping
insert into public.document_type_metric_mappings (document_type_id, metric_id)
select dt.id, em.id
from (values
  ('DIESEL_INVOICE', 'DIESEL_CONSUMPTION'),
  ('ELECTRICITY_BILL', 'GRID_ELECTRICITY')
) as map (document_type_code, metric_code)
join public.document_types dt on dt.code = map.document_type_code
join public.esg_metrics em on em.code = map.metric_code;
