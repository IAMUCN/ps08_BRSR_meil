-- Emission threshold alerts (migration 0061; feature_enhancement.md Phase 7, D51).
begin;
select plan(12);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000061a1', 'alert.reader@db.test');
insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-0000000061a1', 'Alert Reader', 'alert.reader@db.test');
insert into public.reporting_periods (id, label, start_date, end_date, status)
values ('00000000-0000-4000-8000-0000000061b1', 'DB test alert period', '2032-07-01', '2032-07-31', 'closed');

select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.emission_alerts'::regclass, 'public.emission_alert_sends'::regclass)),
  'both tables have RLS');
select ok(
  not has_table_privilege('authenticated', 'public.emission_alerts', 'SELECT')
    and not has_table_privilege('anon', 'public.emission_alerts', 'SELECT')
    and not has_table_privilege('authenticated', 'public.emission_alert_sends', 'SELECT')
    and not has_table_privilege('authenticated', 'public.emission_alerts', 'UPDATE'),
  'the browser roles cannot read or write the alerts');
select ok(
  not has_function_privilege('authenticated', 'public.guard_emission_alert()', 'execute'),
  'the browser roles cannot run the alert guard');
select ok(
  (select (value ->> 'enabled')::boolean and (value -> 'thresholdPct' ->> 'SCOPE_1')::numeric = 20
   from public.org_settings where key = 'emission_alert_settings'),
  'the default settings are there: on, 20% per scope');

insert into public.emission_alerts
  (id, org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct, baseline_periods)
values ('00000000-0000-4000-8000-0000000061c1',
        (select id from public.org_units where parent_id is null order by created_at limit 1),
        '00000000-0000-4000-8000-0000000061b1', 'SCOPE_2', 30, 20, 20,
        '[{"periodId": "x", "label": "Jul 2031", "tco2e": 20}]');

select matches(
  pg_temp.err($$insert into public.emission_alerts
    (org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct, baseline_periods)
    select org_unit_id, reporting_period_id, scope_code, 31, 20, 20, '[]'
    from public.emission_alerts where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'duplicate key',
  'one alert per unit, period and scope');
select matches(
  pg_temp.err($$insert into public.emission_alerts
    (org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct, baseline_periods)
    select org_unit_id, reporting_period_id, 'SCOPE_1', 10, 20, 20, '[]'
    from public.emission_alerts where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'check constraint',
  'an alert is only for a figure above its baseline');
select matches(
  pg_temp.err($$insert into public.emission_alerts
    (org_unit_id, reporting_period_id, scope_code, measured_tco2e, baseline_tco2e, threshold_pct, baseline_periods)
    select org_unit_id, reporting_period_id, 'TOTAL', 30, 20, 20, '[]'
    from public.emission_alerts where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'check constraint',
  'an alert names Scope 1, 2 or 3');
select is(
  pg_temp.err($$update public.emission_alerts set measured_tco2e = 99
                where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'An emission alert''s figures cannot be changed',
  'the figures of an alert cannot be changed');
select matches(
  pg_temp.err($$update public.emission_alerts set status = 'acknowledged'
                where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'check constraint',
  'acknowledging needs who, when and a note');
select is(
  pg_temp.err($$update public.emission_alerts
                set status = 'acknowledged', acknowledged_by = '00000000-0000-4000-8000-0000000061a1',
                    acknowledged_at = now(), acknowledged_note = 'Checked: a new plant started in July.'
                where id = '00000000-0000-4000-8000-0000000061c1'$$),
  '',
  'an open alert can be acknowledged with a note');
select is(
  pg_temp.err($$update public.emission_alerts set acknowledged_note = 'Rewritten later.'
                where id = '00000000-0000-4000-8000-0000000061c1'$$),
  'This alert has already been acknowledged',
  'an acknowledgement cannot be changed afterwards');

insert into public.emission_alert_sends (alert_id, recipient_id, channel, status)
values ('00000000-0000-4000-8000-0000000061c1', '00000000-0000-4000-8000-0000000061a1', 'email', 'sent');
select matches(
  pg_temp.err($$insert into public.emission_alert_sends (alert_id, recipient_id, channel, status)
    values ('00000000-0000-4000-8000-0000000061c1', '00000000-0000-4000-8000-0000000061a1', 'email', 'sending')$$),
  'duplicate key',
  'an alert goes to a person once per channel');

select * from finish();
rollback;
