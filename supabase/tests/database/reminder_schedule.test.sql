-- Deadline reminders (migration 0059; feature_enhancement.md Phase 5) and overdue escalation (migration 0071).
begin;
select plan(11);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

select ok((select relrowsecurity from pg_class where oid = 'public.reminder_sends'::regclass),
  'reminder_sends has RLS');
select ok(
  not has_table_privilege('authenticated', 'public.reminder_sends', 'SELECT')
    and not has_table_privilege('anon', 'public.reminder_sends', 'SELECT')
    and not has_table_privilege('authenticated', 'public.reminder_sends', 'INSERT'),
  'the browser roles cannot read or write it');
select is(
  (select jsonb_array_length(value -> 'days') from public.org_settings where key = 'reminder_schedule'),
  8, 'the default schedule has eight days');

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-000000005901', 'reminder_test@meil.test')
on conflict (id) do nothing;

insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-000000005901', 'Reminder User', 'reminder_test@meil.test')
on conflict (id) do nothing;

create temporary table fixture as
with inserted as (
  insert into public.reminder_sends
    (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
  select p.id, 'owner', u.id, 59, 'email', 'sent', 2, array[]::uuid[]
  from public.users u, public.reporting_periods p limit 1
  returning id)
select id from inserted;

select matches(
  pg_temp.err($$insert into public.reminder_sends
    (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
    select reporting_period_id, kind, recipient_id, days_before, channel, 'sending', 2, org_unit_ids
    from public.reminder_sends where id = (select id from fixture)$$),
  'duplicate key', 'the same reminder cannot be recorded twice');
select is(
  pg_temp.err($$insert into public.reminder_sends
    (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
    select reporting_period_id, kind, recipient_id, days_before, 'in_app', 'sending', 2, org_unit_ids
    from public.reminder_sends where id = (select id from fixture)$$),
  '', 'another channel on the same day is a separate reminder');
select matches(
  pg_temp.err($$update public.reminder_sends set attempts = 6 where id = (select id from fixture)$$),
  'check constraint', 'attempts are capped');
select matches(
  pg_temp.err($$update public.reminder_sends set kind = 'everyone' where id = (select id from fixture)$$),
  'check constraint', 'only owner, digest and escalation reminders exist');

-- Migration 0071: overdue days are negative, and the escalation message to an Administrator is a kind of its own.
select is(
  pg_temp.err($$update public.reminder_sends set days_before = -3, kind = 'escalation' where id = (select id from fixture)$$),
  '', 'an escalation 3 days after the due date can be recorded');
select matches(
  pg_temp.err($$update public.reminder_sends set days_before = -61 where id = (select id from fixture)$$),
  'check constraint', 'days after the due date stop at 60');
select is(
  (select value -> 'escalation' ->> 'superAdminAfter' from public.org_settings where key = 'reminder_schedule'),
  '7', 'the schedule carries the escalation days');
select is(
  (select (value -> 'escalation' ->> 'unitAdminAfter')::int * 100
        + (value -> 'escalation' ->> 'parentAdminAfter')::int
   from public.org_settings where key = 'reminder_schedule'),
  103, 'the unit Administrator is told after 1 day, the next one up after 3');

select * from finish();
rollback;
