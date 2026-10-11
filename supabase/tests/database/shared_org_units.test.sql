-- Migration 0044 (D36): an org unit under more than one parent. A shared project counts in full in each
-- subsidiary it sits under and once at the group; both parents' people see it; the level rules hold for
-- the extra parents too. Also: a second group is its own tree.
begin;
create extension if not exists pgtap with schema extensions;

select plan(19);

select ok(
  not has_table_privilege('authenticated', 'public.org_unit_parents', 'SELECT')
    and not has_table_privilege('anon', 'public.org_unit_parents', 'SELECT')
    and (select relrowsecurity from pg_class where oid = 'public.org_unit_parents'::regclass),
  'the extra parents are read and written only by the server');

-- Two subsidiaries under the first group, a project of the first shared with the second, a site under it.
insert into public.org_units (id, parent_id, unit_type, name) values
  ('00000000-0000-4000-a000-000000004401', (select id from public.org_units where parent_id is null order by created_at limit 1),
   'subsidiary', 'S44 Subsidiary One'),
  ('00000000-0000-4000-a000-000000004402', (select id from public.org_units where parent_id is null order by created_at limit 1),
   'subsidiary', 'S44 Subsidiary Two'),
  ('00000000-0000-4000-a000-000000004403', '00000000-0000-4000-a000-000000004401', 'project', 'S44 Shared Project'),
  ('00000000-0000-4000-a000-000000004404', '00000000-0000-4000-a000-000000004403', 'site', 'S44 Shared Site'),
  ('00000000-0000-4000-a000-000000004405', '00000000-0000-4000-a000-000000004402', 'project', 'S44 Own Project');

select lives_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004403', '00000000-0000-4000-a000-000000004402')$$,
  'a project can also sit under a second subsidiary');

-- The tree: under both parents, once at the group.
select results_eq(
  $$select ancestor_id::text from public.org_unit_tree
    where descendant_id = '00000000-0000-4000-a000-000000004403'
      and ancestor_id in ('00000000-0000-4000-a000-000000004401', '00000000-0000-4000-a000-000000004402')
    order by 1$$,
  array['00000000-0000-4000-a000-000000004401', '00000000-0000-4000-a000-000000004402'],
  'the shared project is beneath both subsidiaries');
select is(
  (select count(*)::int from public.org_unit_tree
   where descendant_id = '00000000-0000-4000-a000-000000004403'
     and ancestor_id = (select id from public.org_units where parent_id is null order by created_at limit 1)),
  1, 'and beneath the group exactly once, though two paths lead there');
select is(
  (select count(*)::int from public.org_unit_tree
   where ancestor_id = '00000000-0000-4000-a000-000000004402'
     and descendant_id = '00000000-0000-4000-a000-000000004404'),
  1, 'what hangs under the shared project comes with it');
select is(
  (select count(*)::int from (
     select ancestor_id, descendant_id from public.org_unit_tree group by 1, 2 having count(*) > 1) d),
  0, 'no pair appears twice anywhere in the tree');

-- A verified record on the shared project: once per unit above it.
insert into auth.users (id, email, aud, role) values
  ('44444444-0000-4000-8000-00000000000a', 's44.two@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('44444444-0000-4000-8000-00000000000a', 'S44 Person at Subsidiary Two', 's44.two@example.test');
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select '44444444-0000-4000-8000-00000000000a', '00000000-0000-4000-a000-000000004402', r.id,
       '44444444-0000-4000-8000-00000000000a'
from public.roles r where r.code = 'project_manager';
insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by,
                                verification_status, activity_value_verified, activity_unit)
select '00000000-0000-4000-a000-000000004410', '00000000-0000-4000-a000-000000004403',
       (select id from public.reporting_periods limit 1), m.id, m.scope_id,
       '44444444-0000-4000-8000-00000000000a', 'user_verified', 100, 'INR'
from public.esg_metrics m where m.code = 'CSR_EXPENDITURE';
select is(
  (select count(*)::int from public.esg_records where id = '00000000-0000-4000-a000-000000004410'),
  1, 'a verified record exists on the shared project');
select is(
  (select count(*)::int from public.consolidation_records
   where esg_record_id = '00000000-0000-4000-a000-000000004410'
     and org_unit_id in ('00000000-0000-4000-a000-000000004401', '00000000-0000-4000-a000-000000004402')),
  2, 'it counts in full in each subsidiary');
select is(
  (select count(*)::int from public.consolidation_records c
   where c.esg_record_id = '00000000-0000-4000-a000-000000004410'
     and c.org_unit_id = (select id from public.org_units where parent_id is null order by created_at limit 1)),
  1, 'and once at the group');

-- Someone assigned to the second subsidiary sees the shared project, though its main parent is the first.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "44444444-0000-4000-8000-00000000000a", "role": "authenticated"}', true);
select ok(
  '00000000-0000-4000-a000-000000004403' in (select public.my_org_unit_ids())
    and '00000000-0000-4000-a000-000000004404' in (select public.my_org_unit_ids())
    and '00000000-0000-4000-a000-000000004401' not in (select public.my_org_unit_ids()),
  'the second parent''s people see the shared project and what is under it, not the first subsidiary');
reset role;

-- The rules.
select throws_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004403', '00000000-0000-4000-a000-000000004401')$$,
  '23514', null, 'the main parent is not an extra parent as well');
select throws_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004403', '00000000-0000-4000-a000-000000004405')$$,
  '23514', null, 'a project cannot also sit under a project');
select throws_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004401', '00000000-0000-4000-a000-000000004404')$$,
  '23514', null, 'nor a subsidiary under a site beneath it: no circle can be closed');
select throws_ok(
  $$update public.org_units set parent_id = '00000000-0000-4000-a000-000000004402'
    where id = '00000000-0000-4000-a000-000000004403'$$,
  '23514', null, 'a unit cannot be moved under a parent it already sits under');
select throws_ok(
  $$update public.org_units set unit_type = 'subsidiary' where id = '00000000-0000-4000-a000-000000004403'$$,
  '23514', null, 'a level change must keep the unit after its extra parent too');

-- A second group: a separate tree.
select lives_ok(
  $$insert into public.org_units (id, parent_id, unit_type, name) values
      ('00000000-0000-4000-a000-000000004420', null, 'group', 'S44 Second Group'),
      ('00000000-0000-4000-a000-000000004421', '00000000-0000-4000-a000-000000004420', 'subsidiary', 'S44 Other Subsidiary')$$,
  'a second group can exist, with its own units');
select throws_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004403', '00000000-0000-4000-a000-000000004421')$$,
  '23514', null, 'a unit is not shared across groups');
select throws_ok(
  $$insert into public.org_unit_parents (org_unit_id, parent_id)
    values ('00000000-0000-4000-a000-000000004420', '00000000-0000-4000-a000-000000004401')$$,
  '23514', null, 'a group sits under nothing');

-- Deleting a unit takes its extra-parent links with it.
delete from public.esg_records where id = '00000000-0000-4000-a000-000000004410';
delete from public.org_units where id in ('00000000-0000-4000-a000-000000004404', '00000000-0000-4000-a000-000000004403');
select is(
  (select count(*)::int from public.org_unit_parents
   where org_unit_id = '00000000-0000-4000-a000-000000004403'),
  0, 'deleting the unit removes its extra-parent links');

select * from finish();
rollback;
