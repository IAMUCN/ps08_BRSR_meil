-- Audit fixes P1 (AUDIT_FIXES.md): the hierarchy rules hold for every writer (migration 0034, D27), and the
-- Scope 1 and Scope 3 activities added in migration 0035 are complete configuration.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

-- A small tree of its own, so the test does not depend on seed data.
insert into public.org_units (id, parent_id, unit_type, name, code) values
  ('00000000-0000-4000-a000-000000000a01', (select id from public.org_units where parent_id is null limit 1),
   'subsidiary', 'P1 Test Subsidiary', 'P1T-SUB'),
  ('00000000-0000-4000-a000-000000000a02', '00000000-0000-4000-a000-000000000a01',
   'project', 'P1 Test Project', 'P1T-PRJ');

select throws_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000a02', 'project', 'project under a project')$$,
  '23514', null, 'a project cannot sit under a project');
select throws_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000a02', 'subsidiary', 'subsidiary under a project')$$,
  '23514', null, 'a subsidiary cannot sit under a project');
select throws_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000a01', 'group', 'second group')$$,
  '23514', null, 'a group is only ever the root');
select throws_ok(
  $$update public.org_units set parent_id = '00000000-0000-4000-a000-000000000a02'
    where id = '00000000-0000-4000-a000-000000000a01'$$,
  '23514', null, 'a node cannot be moved under its own descendant (no cycle)');
select throws_ok(
  $$update public.org_units set parent_id = id where id = '00000000-0000-4000-a000-000000000a02'$$,
  '23514', null, 'a node cannot be its own parent');
select lives_ok(
  $$insert into public.org_units (parent_id, unit_type, name)
    values ('00000000-0000-4000-a000-000000000a01', 'site', 'a site straight under a subsidiary')$$,
  'levels may be skipped');
select throws_ok(
  $$update public.org_units set unit_type = 'business_unit'
    where id = '00000000-0000-4000-a000-000000000a01';
    update public.org_units set unit_type = 'department'
    where id = '00000000-0000-4000-a000-000000000a01'$$,
  '23514', null, 'a node''s level cannot be changed past its children''s');

-- Migration 0035.
select is(
  (select count(*)::int from public.esg_metrics m
    where m.code in ('COAL_ANTHRACITE', 'COAL_BITUMINOUS', 'COAL_SUB_BITUMINOUS', 'COAL_LIGNITE',
                     'LNG_CONSUMPTION', 'PNG_CONSUMPTION', 'REFRIGERANT_R22', 'REFRIGERANT_R32',
                     'REFRIGERANT_R410A', 'REFRIGERANT_R134A', 'SF6_TOPUP', 'BUSINESS_TRAVEL_AIR',
                     'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD', 'CEMENT_PURCHASED', 'STEEL_PURCHASED',
                     'FREIGHT_SPEND', 'COMMUTING_SPEND')
      and m.requires_conversion_factor and m.scope_id is not null
      and exists (select 1 from public.calculation_formulas f where f.metric_id = m.id and f.status = 'active')
      and exists (select 1 from public.document_type_metric_mappings x where x.metric_id = m.id)
      and exists (select 1 from public.validation_rules v
                   where v.metric_id = m.id and v.rule_definition->>'check' = 'allowed_units')
      -- Travel asks for the distance and the passengers instead of one passenger-km number (0077).
      and (select count(*) from public.metric_field_requirements r
            where r.metric_id = m.id and r.is_required)
          = case when m.code like 'BUSINESS_TRAVEL_%' then 5 else 4 end),
  18,
  'each new activity has a scope, a formula, an evidence type, a units rule and its required fields');
select is(
  (select count(*)::int from public.scopes child
     join public.scopes parent on parent.id = child.parent_scope_id
    where parent.code = 'SCOPE_3' and child.is_active),
  6,
  'six of the ten Scope 3 categories are active (downstream transport since migration 0038)');
select is(
  (select count(distinct m.scope_id)::int from public.esg_metrics m
    where m.code in ('BUSINESS_TRAVEL_AIR', 'BUSINESS_TRAVEL_RAIL', 'BUSINESS_TRAVEL_ROAD')
      and m.unit = 'km'),
  1,
  'a flight, a train and a bus are separate activities in one category, measured by distance');
select is(
  (select count(*)::int from public.esg_metrics m
     join public.esg_categories c on c.id = m.category_id
     join public.scopes s on s.id = m.scope_id
    where c.name = 'Fuel & Energy' and s.code = 'SCOPE_1'
      and not exists (select 1 from public.metric_field_requirements r
                       where r.metric_id = m.id and r.field_key = 'source_classification'
                         and not r.is_required)),
  0,
  'every Scope 1 fuel records, optionally, whether it was burnt in a generator, a vehicle or equipment');
select is(
  (select string_agg(distinct r.code, ',') from public.esg_metrics m
     join public.esg_categories c on c.id = m.category_id
     join public.roles r on r.id = c.owning_role_id
    where m.code like 'REFRIGERANT_%' or m.code = 'SF6_TOPUP'),
  'ehs',
  'refrigerant and SF6 records belong to EHS');

select * from finish();
rollback;
