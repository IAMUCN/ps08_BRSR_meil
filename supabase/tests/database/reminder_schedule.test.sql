-- Deadline reminders (migration 0059; feature_enhancement.md Phase 5).
begin;
select plan(7);

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

insert into public.reminder_sends
  (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
select p.id, 'owner', u.id, 3, 'email', 'sent', 2, array[]::uuid[]
from public.users u, public.reporting_periods p limit 1;

select matches(
  pg_temp.err($$insert into public.reminder_sends
    (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
    select reporting_period_id, kind, recipient_id, days_before, channel, 'sending', 2, org_unit_ids
    from public.reminder_sends limit 1$$),
  'duplicate key', 'the same reminder cannot be recorded twice');
select is(
  pg_temp.err($$insert into public.reminder_sends
    (reporting_period_id, kind, recipient_id, days_before, channel, status, missing_count, org_unit_ids)
    select reporting_period_id, kind, recipient_id, days_before, 'in_app', 'sending', 2, org_unit_ids
    from public.reminder_sends limit 1$$),
  '', 'another channel on the same day is a separate reminder');
select matches(
  pg_temp.err($$update public.reminder_sends set attempts = 6$$),
  'check constraint', 'attempts are capped');
select matches(
  pg_temp.err($$update public.reminder_sends set kind = 'everyone'$$),
  'check constraint', 'only owner and digest reminders exist');

select * from finish();
rollback;
