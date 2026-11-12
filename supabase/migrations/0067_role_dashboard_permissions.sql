-- Migration 0067: role-wise dashboard, step 1 - permissions, the Auditor role, Core KPI flag
-- (.grill/role-dashboard-decisions.md; written 2026-11-12 on a machine with no database, so it has NOT been run:
-- see ROLE_DASHBOARD_VERIFY.md for what the person applying it must check).
--
-- Adds, and only adds: four permissions, one system role, two columns. No existing grant is removed.
-- Safe to run twice. Undo: delete the three inserted groups below and drop the two columns.

-------------------------------------------------------------------------------------------------
-- 1. Four permissions.
-------------------------------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('evidence.read',
   'Read only: open an approved record''s source document, extracted values, verification history and calculation trace.'),
  ('disclosure.finance',
   'Type and change the written BRSR answers that belong to finance and CSR (group-level assignment).'),
  ('disclosure.hr',
   'Type and change the written BRSR answers that belong to HR and the workforce (group-level assignment).'),
  ('financial_inputs.manage',
   'Enter the yearly financial inputs of the report: turnover, PPP rate, net worth, physical output (group-level assignment).')
on conflict (code) do nothing;

-- The Super Admin holds every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('evidence.read', 'disclosure.finance', 'disclosure.hr', 'financial_inputs.manage')
where r.code = 'admin'
on conflict do nothing;

-- Finance / CSR: the financial inputs and the finance and CSR answers (owner's decision, 2026-11-12).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('disclosure.finance', 'financial_inputs.manage')
where r.code = 'finance_csr'
on conflict do nothing;

-- HR: the workforce answers.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'disclosure.hr'
where r.code = 'hr'
on conflict do nothing;

-------------------------------------------------------------------------------------------------
-- 2. The Auditor (Assurance Reviewer): reads, never writes. No upload, verify, approve, report, user or
--    configuration permission, and no chatbot (a reviewer from outside the company does not send the
--    company's figures to an AI service unless an Admin grants it).
-------------------------------------------------------------------------------------------------
insert into public.roles (code, name, description, is_system_role)
values ('auditor', 'Assurance Reviewer',
        'Read only: approved figures with their source documents, the audit trail and the calculation traces, inside the org units it is assigned to. Cannot upload, verify, approve or change anything.',
        true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('audit.view', 'monitoring.view', 'evidence.read')
where r.code = 'auditor'
on conflict do nothing;

-------------------------------------------------------------------------------------------------
-- 3. BRSR questions: which are Core KPIs, and which permission may type the written answer.
--    is_core is seeded from SEBI's own Annexure I of circular SEBI/HO/CFD/CFD-SEC-2/P/CIR/2023/122
--    (12 July 2023); a Super Admin can change it. Later revisions of the annexure were not checked.
--    owning_permission is filled by migration 0068 once the owner approves the mapping.
-------------------------------------------------------------------------------------------------
alter table public.brsr_indicators
  add column if not exists is_core boolean not null default false,
  add column if not exists owning_permission text;

alter table public.brsr_indicators
  drop constraint if exists brsr_indicators_owning_permission,
  add constraint brsr_indicators_owning_permission
    check (owning_permission is null or owning_permission in ('disclosure.finance', 'disclosure.hr'));

update public.brsr_indicators
set is_core = true
where code in (
  'P6-E7',  -- GHG: Scope 1, Scope 2 and intensity
  'P6-E3',  -- water consumption and intensity
  'P6-E4',  -- water discharge by destination and level of treatment
  'P6-E1',  -- energy consumed, % renewable, intensity
  'P6-E9',  -- waste by category, recovered, disposed, intensity
  'P3-E1',  -- spending on well-being as % of revenue (part c)
  'P3-E11', -- permanent disabilities, LTIFR, fatalities
  'P5-E3',  -- gross wages paid to females as % of wages (part b)
  'P5-E7',  -- complaints on sexual harassment (POSH)
  'P8-E4',  -- input material from MSMEs / small producers and from within India
  'P8-E5',  -- wages paid in smaller towns as % of total wage cost
  'P9-E7',  -- data breaches involving customer data
  'P1-E8',  -- days of accounts payable
  'P1-E9'   -- concentration of purchases and sales; related-party transactions
);

comment on column public.brsr_indicators.is_core is
  'True for the questions SEBI''s BRSR Core (Annexure I, 12 July 2023) draws KPIs from. Editable by a Super Admin.';
comment on column public.brsr_indicators.owning_permission is
  'The permission that may type the written answer to this question besides a Super Admin; null = Super Admin only.';
