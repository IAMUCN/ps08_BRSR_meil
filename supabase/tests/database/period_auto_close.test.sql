-- Migration 0053: open periods past their deadline close by themselves; nothing else changes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(13);

-- Set the seeded open period aside; only one period may be open at a time.
update public.reporting_periods set status = 'closed' where status = 'open';

insert into public.reporting_periods
  (label, start_date, end_date, submission_opens_on, submission_closes_on, status, opened_at)
values ('Past close date', '2020-01-01', '2020-01-31', '2020-02-01', '2020-03-15', 'open', now());

insert into public.reporting_periods (label, start_date, end_date, submission_closes_on)
values ('Future draft', '2099-01-01', '2099-01-31', '2099-03-15'),
       ('Past draft', '2020-05-01', '2020-05-31', '2020-06-15');

select is(public.close_expired_reporting_periods(), 1, 'one period closes');
select is((select status::text from public.reporting_periods where label = 'Past close date'), 'closed',
  'the open period past its close date is closed');
select isnt((select closed_at from public.reporting_periods where label = 'Past close date'), null,
  'its closing time is recorded');
select is((select status::text from public.reporting_periods where label = 'Future draft'), 'draft',
  'a future period is untouched');
select is((select status::text from public.reporting_periods where label = 'Past draft'), 'draft',
  'a draft is never closed, even with a past date');
select is((select count(*)::int from public.audit_logs a join public.reporting_periods p on p.id = a.entity_id
           where p.label = 'Past close date' and a.event_type = 'reporting_period.closed_automatically'
             and a.user_id is null), 1, 'a system audit entry is written');
select is(public.close_expired_reporting_periods(), 0, 'running again closes nothing');

-- The deadline day itself, India time, is still open.
insert into public.reporting_periods (label, start_date, end_date, submission_closes_on, status, opened_at)
values ('Closes today', '2020-01-01', '2020-01-31', (now() at time zone 'Asia/Kolkata')::date, 'open', now());
select is(public.close_expired_reporting_periods(), 0, 'a period is open through its close date');
update public.reporting_periods set submission_closes_on = (now() at time zone 'Asia/Kolkata')::date - 1
where label = 'Closes today';
select is(public.close_expired_reporting_periods(), 1, 'and closes the day after');

-- No close date: the end date is the deadline, not the start of the window.
insert into public.reporting_periods (label, start_date, end_date, status, opened_at)
values ('Only an end date', '2020-07-01', '2020-07-31', 'open', now());
select is(public.close_expired_reporting_periods(), 1, 'without a close date the end date decides');

select is(
  (select bool_or(has_function_privilege(r, 'public.close_expired_reporting_periods()', 'execute'))
   from unnest(array['anon', 'authenticated']) r),
  false, 'browser roles cannot run the closing');
select has_column('public', 'users', 'notifications_seen_at', 'the pop-up marker exists');
select is((select count(*)::int from cron.job where jobname = 'close-expired-reporting-periods'), 1,
  'the job is scheduled');

select * from finish();
rollback;
