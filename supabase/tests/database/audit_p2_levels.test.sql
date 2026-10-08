-- Audit fix P2 (migration 0037, D29): hierarchy levels are rows, not an enum. A new level works at once,
-- with no schema change, and the rules of 0034 follow each level's position.
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

select results_eq(
  $$select code from public.org_levels
    where code in ('group', 'subsidiary', 'business_unit', 'region', 'project', 'site', 'department')
    order by sort_order$$,
  array['group', 'subsidiary', 'business_unit', 'region', 'project', 'site', 'department'],
  'the seven levels are seeded in hierarchy order');
select ok(
  not has_table_privilege('authenticated', 'public.org_levels', 'SELECT')
    and not has_table_privilege('anon', 'public.org_levels', 'SELECT')
    and (select relrowsecurity from pg_class where oid = 'public.org_levels'::regclass),
  'levels are read and written only by the server');
select hasnt_type('public', 'org_unit_type', 'the fixed enum of levels is gone');

-- An Admin adds "Package" between Region and Project: configuration, not a migration. (Position 47 and its
-- own code, so the test also passes on a local database where the end-to-end suite left a level at 45.)
insert into public.org_levels (code, label, sort_order) values ('p2_package', 'Package', 47);
insert into public.org_units (id, parent_id, unit_type, name) values
  ('00000000-0000-4000-a000-000000000b01', (select id from public.org_units where parent_id is null limit 1),
   'region', 'P2 Test Region'),
  ('00000000-0000-4000-a000-000000000b02', '00000000-0000-4000-a000-000000000b01', 'p2_package', 'P2 Test Package');
select lives_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000b02', 'project', 'a project under the new level')$$,
  'a later level fits under the new one');
select throws_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000b02', 'region', 'a region under the new level')$$,
  '23514', null, 'an earlier level does not');
select throws_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000b01', 'no_such_level', 'unknown level')$$,
  '23503', null, 'an org unit cannot be at a level that is not configured');

select throws_ok(
  $$update public.org_levels set sort_order = 15 where code = 'p2_package'$$,
  '23514', null, 'a level''s position never changes');
select lives_ok(
  $$update public.org_levels set label = 'Work Package' where code = 'p2_package'$$,
  'its label can');
select throws_ok(
  $$delete from public.org_levels where code = 'p2_package'$$,
  '23503', null, 'a level in use cannot be removed');
select throws_ok(
  $$delete from public.org_levels where code = 'group'$$,
  '23514', null, 'the root level cannot be removed');
select throws_ok(
  $$insert into public.org_levels (code, label, sort_order) values ('holding', 'Holding', 5)$$,
  '23514', null, 'nothing comes before the root level');

select * from finish();
rollback;
