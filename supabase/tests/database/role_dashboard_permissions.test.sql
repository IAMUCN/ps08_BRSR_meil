-- Migrations 0067 and 0068: the role-wise dashboard's permissions, the Assurance Reviewer, the Core flag
-- (.grill/role-dashboard-decisions.md). Written without a database to run it on: verify before merging.
begin;
select plan(13);

create function pg_temp.perms(role_code text) returns text language sql as $$
  select coalesce(string_agg(p.code, ',' order by p.code), '')
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where r.code = role_code
$$;

-- The Assurance Reviewer reads and never writes.
select is((select is_system_role from public.roles where code = 'auditor'), true,
  'the Assurance Reviewer is a system role');
select is(pg_temp.perms('auditor'), 'audit.view,evidence.read,monitoring.view',
  'the Assurance Reviewer holds the audit trail, monitoring and evidence reads and nothing else');
select is(
  (select count(*)::int from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id
   where r.code = 'auditor'
     and p.code in ('document.upload', 'record.verify', 'approval.decide', 'validation.review',
                    'report.generate', 'user.manage', 'org.manage', 'role.manage', 'factor.manage',
                    'period.manage', 'settings.manage', 'brsr_mapping.manage', 'chat.use',
                    'carbon_credit.manage', 'icp.manage', 'user.bulk_import', 'org.bulk_import')),
  0, 'the Assurance Reviewer holds no permission that changes anything');

-- The four new permissions exist, and only the roles meant to hold them do.
select is((select count(*)::int from public.permissions
           where code in ('evidence.read', 'disclosure.finance', 'disclosure.hr', 'financial_inputs.manage')),
  4, 'the four new permissions exist');
select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'financial_inputs.manage'),
  'admin,finance_csr', 'only the Super Admin and Finance / CSR enter the yearly financial inputs');
select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'disclosure.hr'),
  'admin,hr', 'only the Super Admin and HR type the workforce answers');
select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'disclosure.finance'),
  'admin,finance_csr', 'only the Super Admin and Finance / CSR type the finance answers');
select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'evidence.read'),
  'admin,auditor', 'only the Super Admin and the Assurance Reviewer have the read-only evidence permission');

-- Core KPIs: exactly the fourteen questions of SEBI Annexure I.
select is((select count(*)::int from public.brsr_indicators where is_core), 14,
  'fourteen BRSR questions are flagged as Core');
select is(
  (select count(*)::int from public.brsr_indicators
   where is_core and code in ('P6-E7', 'P6-E3', 'P6-E4', 'P6-E1', 'P6-E9', 'P3-E1', 'P3-E11', 'P5-E3',
                              'P5-E7', 'P8-E4', 'P8-E5', 'P9-E7', 'P1-E8', 'P1-E9')),
  14, 'they are the ones in SEBI Annexure I');

-- Who may type which answer; the column only allows the two permissions.
select is((select owning_permission from public.brsr_indicators where code = 'P5-E7'), 'disclosure.hr',
  'the POSH complaints answer belongs to HR');
select is((select owning_permission from public.brsr_indicators where code = 'P1-E2'), 'disclosure.finance',
  'the fines and penalties answer belongs to Finance / CSR');
select throws_ok(
  $$update public.brsr_indicators set owning_permission = 'user.manage' where code = 'A-1'$$,
  '23514', null, 'a question cannot be handed to any other permission');

select * from finish();
rollback;
