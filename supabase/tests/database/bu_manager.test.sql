-- BU Manager role (migration 0088): same powers as an Administrator, assignable at a business unit only.
begin;
select plan(7);

select is((select is_system_role from public.roles where code = 'bu_manager'), true, 'BU Manager is a system role');
select is(
  (select string_agg(p.code, ',' order by p.code) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
   where r.code = 'bu_manager'),
  (select string_agg(p.code, ',' order by p.code) from public.roles r
   join public.role_permissions rp on rp.role_id = r.id join public.permissions p on p.id = rp.permission_id
   where r.code = 'org_admin'),
  'BU Manager holds what an Administrator holds');

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin execute statement; return ''; exception when others then return sqlerrm; end; $$;

insert into auth.users (id, email) values ('60000000-0000-0000-0000-000000000001', 'bu1@fixture.test');
insert into public.users (id, display_name, email)
values ('60000000-0000-0000-0000-000000000001', 'BU One', 'bu1@fixture.test');

-- A group > subsidiary > business unit > project chain of our own.
insert into public.org_units (id, name, code, unit_type, parent_id) values
  ('61000000-0000-0000-0000-000000000001', 'BU Test Sub', 'BUT-SUB', 'subsidiary', (select id from public.org_units where parent_id is null limit 1)),
  ('61000000-0000-0000-0000-000000000002', 'BU Test Unit', 'BUT-BU', 'business_unit', '61000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000003', 'BU Test Project', 'BUT-PRJ', 'project', '61000000-0000-0000-0000-000000000002');

select is(pg_temp.err($$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
  select '60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', id, '60000000-0000-0000-0000-000000000001' from public.roles where code = 'bu_manager'$$),
  'The BU Manager role can only be assigned at a business unit.', 'refused at a subsidiary');
select is(pg_temp.err($$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
  select '60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000003', id, '60000000-0000-0000-0000-000000000001' from public.roles where code = 'bu_manager'$$),
  'The BU Manager role can only be assigned at a business unit.', 'refused at a project');
select is(pg_temp.err($$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
  select '60000000-0000-0000-0000-000000000001', (select id from public.org_units where parent_id is null limit 1), id, '60000000-0000-0000-0000-000000000001' from public.roles where code = 'bu_manager'$$),
  'The BU Manager role can only be assigned at a business unit.', 'refused at the group');
select is(pg_temp.err($$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
  select '60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', id, '60000000-0000-0000-0000-000000000001' from public.roles where code = 'bu_manager'$$),
  '', 'allowed at a business unit');
select is(pg_temp.err($$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
  select '60000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000003', id, '60000000-0000-0000-0000-000000000001' from public.roles where code = 'project_manager'$$),
  '', 'other roles are not limited by the new rule');

select * from finish();
rollback;
