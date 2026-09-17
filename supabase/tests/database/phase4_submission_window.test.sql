-- Phase 4 / D10: submission window columns exist, are optional, and reject inverted windows.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select has_column('public', 'reporting_periods', 'submission_opens_on', 'submission_opens_on exists');
select has_column('public', 'reporting_periods', 'submission_closes_on', 'submission_closes_on exists');

select lives_ok(
  $$insert into public.reporting_periods (label, start_date, end_date, submission_opens_on, submission_closes_on)
    values ('Window test A', '2026-10-01', '2026-10-31', '2026-11-01', '2026-11-10')$$,
  'a valid submission window is accepted');

select throws_ok(
  $$insert into public.reporting_periods (label, start_date, end_date, submission_opens_on, submission_closes_on)
    values ('Window test B', '2026-11-01', '2026-11-30', '2026-12-10', '2026-12-01')$$,
  '23514', null, 'a window that closes before it opens is rejected');

select * from finish();
rollback;
