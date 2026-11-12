-- Default permissions of the seeded roles after migration 0048 (.grill/role-permissions-decisions.md).
begin;
select plan(9);

create function pg_temp.perms(role_code text) returns text language sql as $$
  select coalesce(string_agg(p.code, ',' order by p.code), '')
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where r.code = role_code
$$;

select is((select count(*)::int from public.permissions), 20, 'the catalogue still has 20 permissions');
select is(
  (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.code = 'admin'), 20, 'Admin holds every permission');
select is(pg_temp.perms('corporate_esg'),
  'approval.decide,carbon_credit.manage,carbon_credit.view,chat.use,document.upload,icp.manage,monitoring.view,record.verify,report.generate,validation.review',
  'Corporate ESG: review, approve, monitor, report, carbon credits');
select is(pg_temp.perms('project_manager'), 'carbon_credit.view,chat.use,document.upload,record.verify',
  'Project Manager: upload, verify, and the carbon credits of the own project');
select is(pg_temp.perms('ehs'), 'chat.use,document.upload,record.verify', 'EHS: upload and verify');
select is(pg_temp.perms('procurement'), 'chat.use,document.upload,record.verify',
  'Procurement: upload and verify');
select is(pg_temp.perms('hr'), 'chat.use,document.upload,record.verify,user.bulk_import',
  'HR: upload, verify and bulk import of employees');
select is(pg_temp.perms('finance_csr'),
  'carbon_credit.view,chat.use,document.upload,icp.manage,record.verify',
  'Finance / CSR: upload, verify, carbon price');
-- Organisation-wide configuration stays with the Admin role.
select is(
  (select count(*)::int from public.role_permissions rp
   join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
   where r.code in ('corporate_esg', 'project_manager', 'ehs', 'procurement', 'hr', 'finance_csr')
     and p.code in ('audit.view', 'brsr_mapping.manage', 'factor.manage', 'org.manage', 'period.manage',
                    'role.manage', 'settings.manage', 'user.manage')),
  0, 'no seeded role but Admin holds organisation-wide configuration');

select * from finish();
rollback;
