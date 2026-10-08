-- Phase 15: consolidation (migration 0023). Known values are placed at the lowest levels of a fresh tree —
-- including a department below a site and a record on a project itself — and the roll-up is checked at every
-- level above, for an emission (summed), a percentage (re-derived from counts) and a recorded amount.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- --- Fixture: Group → Subsidiary → Project 1 (Site A → Dept D, Site B) and Project 2 (Site C) -------------
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000015aa', 'p15@fixture.test');
insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-0000000015aa', 'P15 fixture', 'p15@fixture.test');

insert into public.org_units (id, parent_id, unit_type, name) values
  ('15000000-0000-4000-8000-000000000001', null, 'group', 'P15 Group'),
  ('15000000-0000-4000-8000-000000000002', '15000000-0000-4000-8000-000000000001', 'subsidiary', 'P15 Sub'),
  ('15000000-0000-4000-8000-000000000003', '15000000-0000-4000-8000-000000000002', 'project', 'P15 Project 1'),
  ('15000000-0000-4000-8000-000000000004', '15000000-0000-4000-8000-000000000003', 'site', 'P15 Site A'),
  ('15000000-0000-4000-8000-000000000005', '15000000-0000-4000-8000-000000000004', 'department', 'P15 Dept D'),
  ('15000000-0000-4000-8000-000000000006', '15000000-0000-4000-8000-000000000003', 'site', 'P15 Site B'),
  ('15000000-0000-4000-8000-000000000007', '15000000-0000-4000-8000-000000000002', 'project', 'P15 Project 2'),
  ('15000000-0000-4000-8000-000000000008', '15000000-0000-4000-8000-000000000007', 'site', 'P15 Site C');

insert into public.reporting_periods (id, label, start_date, end_date)
values ('15000000-0000-4000-8000-0000000000aa', 'P15 fixture period', '2030-05-01', '2030-05-31');

-- One record, optionally calculated, optionally with calculation inputs.
create function pg_temp.rec(org_suffix text, metric text, approval text, quality text, value numeric,
                            unit text, inputs jsonb default null)
returns void language plpgsql as $$
declare r uuid; c uuid; k text;
begin
  insert into public.esg_records (org_unit_id, reporting_period_id, metric_id, submitted_by,
                                  activity_value_verified, activity_unit, verification_status,
                                  approval_status, data_quality_state)
  values (('15000000-0000-4000-8000-00000000000' || org_suffix)::uuid,
          '15000000-0000-4000-8000-0000000000aa',
          (select id from public.esg_metrics where code = metric),
          '00000000-0000-4000-8000-0000000015aa', value, unit, 'user_verified',
          approval::public.record_approval_status, quality::public.data_quality_state)
  returning id into r;
  if unit is null then return; end if;  -- "needs a calculation, has none"
  if (select requires_calculation from public.esg_metrics where code = metric) then
    insert into public.calculations (esg_record_id, input_value, input_unit, normalized_value,
                                     normalized_unit, result_value, result_unit, engine_version)
    values (r, value, unit, value, unit, value, unit, 'fixture') returning id into c;
    for k in select jsonb_object_keys(coalesce(inputs, '{}')) loop
      insert into public.calculation_inputs (calculation_id, input_key, input_value, input_unit)
      values (c, k, (inputs->>k)::numeric, 'count');
    end loop;
  end if;
end $$;

-- Diesel (summed): Dept D 5, Site A 100, Site B 50 approved + 20 awaiting, Site C 30, plus one uncalculated
-- record at Site C and a rejected 999 at Site A that must never count.
select pg_temp.rec('5', 'DIESEL_CONSUMPTION', 'approved', 'approved', 5, 'kgCO2e');
select pg_temp.rec('4', 'DIESEL_CONSUMPTION', 'approved', 'approved', 100, 'kgCO2e');
select pg_temp.rec('4', 'DIESEL_CONSUMPTION', 'approved', 'rejected', 999, 'kgCO2e');
select pg_temp.rec('6', 'DIESEL_CONSUMPTION', 'approved', 'approved', 50, 'kgCO2e');
select pg_temp.rec('6', 'DIESEL_CONSUMPTION', 'review_pending', 'validated', 20, 'kgCO2e');
select pg_temp.rec('8', 'DIESEL_CONSUMPTION', 'approved', 'approved', 30, 'kgCO2e');
select pg_temp.rec('8', 'DIESEL_CONSUMPTION', 'review_pending', 'validated', 7, null);
-- Women (percentage): Site A 10 of 20 (50 %), Site C 10 of 180 (5.6 %).
select pg_temp.rec('4', 'WORKFORCE_GENDER', 'approved', 'approved', 50, '%',
                   '{"female_employees": 10, "total_employees": 20}');
select pg_temp.rec('8', 'WORKFORCE_GENDER', 'approved', 'approved', 5.5556, '%',
                   '{"female_employees": 10, "total_employees": 180}');
-- CSR (recorded amount) on Project 1 itself, not on a site.
select pg_temp.rec('3', 'CSR_EXPENDITURE', 'approved', 'approved', 500000, 'Rs');

create function pg_temp.sum_at(org_suffix text, metric text, approval text) returns numeric
language sql as $$
  select coalesce(sum(value), 0) from public.consolidation_records
  where org_unit_id = ('15000000-0000-4000-8000-00000000000' || org_suffix)::uuid
    and reporting_period_id = '15000000-0000-4000-8000-0000000000aa'
    and metric_id = (select id from public.esg_metrics where code = metric)
    and (approval = 'any' or (approval = 'approved') = (approval_status = 'approved'))
$$;

create function pg_temp.input_at(org_suffix text, key text) returns numeric language sql as $$
  select coalesce(sum(ci.input_value), 0) from public.consolidation_records cr
  join public.calculation_inputs ci on ci.calculation_id = cr.calculation_id
  where cr.org_unit_id = ('15000000-0000-4000-8000-00000000000' || org_suffix)::uuid
    and cr.reporting_period_id = '15000000-0000-4000-8000-0000000000aa' and ci.input_key = key
    and cr.approval_status = 'approved'
$$;

-- --- The tree ---------------------------------------------------------------------------------------------
select is((select depth from public.org_unit_tree
            where ancestor_id = '15000000-0000-4000-8000-000000000001'
              and descendant_id = '15000000-0000-4000-8000-000000000005'), 4,
  'the tree view walks every level, however deep (Group → … → Department is 4 steps)');
select is((select count(*)::int from public.org_unit_tree
            where ancestor_id = '15000000-0000-4000-8000-000000000001'), 8,
  'the group reaches itself and all seven units beneath it');

-- --- Diesel, summed at every level --------------------------------------------------------------------------
select is(pg_temp.sum_at('5', 'DIESEL_CONSUMPTION', 'approved'), 5::numeric, 'Department D: 5');
select is(pg_temp.sum_at('4', 'DIESEL_CONSUMPTION', 'approved'), 105::numeric,
  'Site A: its own 100 plus Department D''s 5 — the rejected 999 never counts');
select is(pg_temp.sum_at('6', 'DIESEL_CONSUMPTION', 'approved'), 50::numeric, 'Site B: 50 approved');
select is(pg_temp.sum_at('3', 'DIESEL_CONSUMPTION', 'approved'), 155::numeric, 'Project 1: 105 + 50');
select is(pg_temp.sum_at('3', 'DIESEL_CONSUMPTION', 'awaiting'), 20::numeric,
  'Project 1: the 20 awaiting approval stay apart from the approved figure');
select is(pg_temp.sum_at('7', 'DIESEL_CONSUMPTION', 'approved'), 30::numeric, 'Project 2: 30');
select is(pg_temp.sum_at('2', 'DIESEL_CONSUMPTION', 'approved'), 185::numeric, 'Subsidiary: 155 + 30');
select is(pg_temp.sum_at('1', 'DIESEL_CONSUMPTION', 'approved'), 185::numeric, 'Group: 185');
select is((select count(*)::int from public.consolidation_records
            where org_unit_id = '15000000-0000-4000-8000-000000000001' and not_calculated), 1,
  'the uncalculated record is counted as such at the top, never as a zero value');

-- --- Percentage, re-derived from counts ---------------------------------------------------------------------
select is(pg_temp.input_at('3', 'female_employees') / pg_temp.input_at('3', 'total_employees') * 100,
  50::numeric, 'Project 1: 10 of 20 women = 50 %');
select is(pg_temp.input_at('2', 'female_employees'), 20::numeric, 'Subsidiary: 20 women in total');
select is(pg_temp.input_at('2', 'total_employees'), 200::numeric, 'Subsidiary: 200 employees in total');
select ok(abs(pg_temp.sum_at('2', 'WORKFORCE_GENDER', 'approved') - 55.5556) < 0.001,
  'summing the stored percentages would give 55.6 % — which is why consolidation uses the counts (10 %)');

-- --- Recorded amount on a project ---------------------------------------------------------------------------
select is(pg_temp.sum_at('1', 'CSR_EXPENDITURE', 'approved'), 500000::numeric,
  'a record on a project (not a site) rolls up to the group');
select is(pg_temp.sum_at('4', 'CSR_EXPENDITURE', 'any'), 0::numeric,
  'and never leaks down into a site beneath it');

select * from finish();
rollback;
