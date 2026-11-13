-- Migration 0070: the employee register. Written without a database to run it on: verify before merging.
begin;
select plan(9);

select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'employee_register.manage'),
  'admin,hr', 'only the Super Admin and HR upload and confirm a register');
select is(
  (select string_agg(r.code, ',' order by r.code) from public.role_permissions rp
     join public.roles r on r.id = rp.role_id
     join public.permissions p on p.id = rp.permission_id and p.code = 'employee_register.view'),
  'admin,hr', 'only the Super Admin and HR open an uploaded register');

select is((select public from storage.buckets where id = 'registers'), false, 'the registers bucket is private');
select is((select file_size_limit from storage.buckets where id = 'registers'), 10485760::bigint,
  'and takes 10 MB');

select is((select relrowsecurity from pg_class where oid = 'public.employee_registers'::regclass), true,
  'the register table has row-level security');
select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'employee_registers'
      and grantee in ('anon', 'authenticated')),
  0, 'and the browser roles hold nothing on it');

-- A register holds totals only: no column could carry a person.
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'employee_registers'
      and column_name in ('employee_id', 'name', 'gender', 'email', 'wage')),
  0, 'there is no person-level column');

-- One live register per unit and year.
insert into auth.users (id, email, aud, role)
values ('70707070-0000-4000-8000-000000000001', 'register.fixture@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email)
values ('70707070-0000-4000-8000-000000000001', 'Register Fixture', 'register.fixture@example.test');
insert into public.employee_registers
  (org_unit_id, financial_year, storage_path, file_name, file_hash, file_size_bytes, totals, uploaded_by)
select o.id, 2025, 'x/a.xlsx', 'a.xlsx', repeat('a', 64), 10, '{}'::jsonb, '70707070-0000-4000-8000-000000000001'
from public.org_units o where o.code = 'MEIL';
select throws_ok(
  $$insert into public.employee_registers
      (org_unit_id, financial_year, storage_path, file_name, file_hash, file_size_bytes, totals, uploaded_by)
    select o.id, 2025, 'x/b.xlsx', 'b.xlsx', repeat('b', 64), 10, '{}'::jsonb,
           '70707070-0000-4000-8000-000000000001'
    from public.org_units o where o.code = 'MEIL'$$,
  '23505', null, 'a second live register for the same unit and year is refused');
select lives_ok(
  $$update public.employee_registers set status = 'superseded' where storage_path = 'x/a.xlsx'$$,
  'a superseded one makes room');

select * from finish();
rollback;
