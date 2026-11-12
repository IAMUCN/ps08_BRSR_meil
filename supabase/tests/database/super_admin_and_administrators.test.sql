-- Super Admins and scoped Administrators (migration 0050; .grill/scoped-admin-onboarding-decisions.md).
begin;
select plan(15);

create function pg_temp.perms(role_code text) returns text language sql as $$
  select coalesce(string_agg(p.code, ',' order by p.code), '')
  from public.roles r
  join public.role_permissions rp on rp.role_id = r.id
  join public.permissions p on p.id = rp.permission_id
  where r.code = role_code
$$;

-- Runs a statement and returns the error it raised ('' when it went through).
create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

-- --- The roles ---------------------------------------------------------------------------------------------
select is((select name from public.roles where code = 'admin'), 'Super Admin',
  'the admin role is called Super Admin');
select is((select is_system_role from public.roles where code = 'org_admin'), true,
  'Administrator is a system role');
select is(pg_temp.perms('org_admin'),
  'approval.decide,chat.use,document.upload,monitoring.view,org.bulk_import,org.manage,record.verify,report.generate,user.bulk_import,user.manage,validation.review',
  'Administrator: people, hierarchy, queues, figures, reports, uploads — and no configuration');
select is(
  (select count(*)::int from public.role_permissions rp
   join public.roles r on r.id = rp.role_id and r.code = 'org_admin'
   join public.permissions p on p.id = rp.permission_id
   where p.code in ('role.manage', 'period.manage', 'settings.manage', 'factor.manage',
                    'brsr_mapping.manage', 'audit.view')),
  0, 'Administrator holds no group-wide configuration permission');
select is((select (value #>> '{}')::int from public.org_settings where key = 'super_admin_limit'), 2,
  'the limit is a setting: 2');

-- --- Fixture: four people at the group, none a Super Admin yet ------------------------------------------------
-- Anyone already holding the role in this database is set aside so the count starts at zero.
update public.user_org_assignments uoa set revoked_at = now()
from public.roles r where r.id = uoa.role_id and r.code = 'admin' and uoa.revoked_at is null;

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'sa1@fixture.test'),
  ('50000000-0000-0000-0000-000000000002', 'sa2@fixture.test'),
  ('50000000-0000-0000-0000-000000000003', 'sa3@fixture.test'),
  ('50000000-0000-0000-0000-000000000004', 'sa4@fixture.test');
insert into public.users (id, display_name, email) values
  ('50000000-0000-0000-0000-000000000001', 'SA One', 'sa1@fixture.test'),
  ('50000000-0000-0000-0000-000000000002', 'SA Two', 'sa2@fixture.test'),
  ('50000000-0000-0000-0000-000000000003', 'SA Three', 'sa3@fixture.test'),
  ('50000000-0000-0000-0000-000000000004', 'SA Four', 'sa4@fixture.test');

create function pg_temp.grant_role(person int, role_code text) returns text language sql as $$
  select pg_temp.err(format(
    $f$insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
       select %L, o.id, r.id, %L
       from public.org_units o, public.roles r
       where o.parent_id is null and o.deleted_at is null and r.code = %L
       order by o.created_at limit 1$f$,
    '50000000-0000-0000-0000-00000000000' || person,
    '50000000-0000-0000-0000-000000000001', role_code))
$$;

-- --- The limit -----------------------------------------------------------------------------------------------
select is(pg_temp.grant_role(1, 'admin'), '', 'a first Super Admin is accepted');
select is(pg_temp.grant_role(2, 'admin'), '', 'a second Super Admin is accepted');
select matches(pg_temp.grant_role(3, 'admin'), 'At most 2 Super Admins',
  'a third Super Admin is refused');
select is(
  (select count(*)::int from public.user_org_assignments uoa
   join public.roles r on r.id = uoa.role_id and r.code = 'admin' where uoa.revoked_at is null),
  2, 'and nothing was written for the third');

select is(pg_temp.grant_role(3, 'org_admin'), '', 'the Administrator role is not limited');
select is(pg_temp.grant_role(4, 'org_admin'), '', 'a second Administrator at the same unit is accepted');

-- A deactivated Super Admin frees a place; reactivating them while it is taken is refused.
update public.users set is_active = false where id = '50000000-0000-0000-0000-000000000002';
select is(pg_temp.grant_role(3, 'admin'), '', 'a deactivated Super Admin frees a place');
select matches(
  pg_temp.err($$update public.users set is_active = true
                where id = '50000000-0000-0000-0000-000000000002'$$),
  'At most 2 Super Admins', 'reactivating a Super Admin beyond the limit is refused');

-- Turning an existing assignment into a Super Admin one is the same grant by another route.
select matches(
  pg_temp.err($$update public.user_org_assignments uoa
                set role_id = (select id from public.roles where code = 'admin')
                from public.roles r
                where r.id = uoa.role_id and r.code = 'org_admin'
                  and uoa.user_id = '50000000-0000-0000-0000-000000000004'$$),
  'At most 2 Super Admins', 'changing an assignment''s role to Super Admin is refused');

-- Raising the setting is the deliberate way to allow one more.
update public.org_settings set value = '3'::jsonb where key = 'super_admin_limit';
select is(pg_temp.grant_role(4, 'admin'), '', 'a higher limit admits one more');

select * from finish();
rollback;
