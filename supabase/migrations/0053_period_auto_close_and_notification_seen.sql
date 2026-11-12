-- Migration 0053: reporting periods close by themselves, and notifications pop up once per account (owner's
-- decisions, 2026-11-01; .grill/org-tree-users-notifications-periods-decisions.md).
--
--   * A period takes its deadline from `submission_closes_on`, or `end_date` when no close date is set. It stays
--     open through that whole day, India time, whatever the server's time zone. On hosted, August ends on 31 Aug
--     and takes submissions until 15 Oct, so `end_date` alone would close it before submissions open.
--   * `close_expired_reporting_periods()` closes what has passed, writes a system audit entry and tells the
--     Super Admins. pg_cron runs it every five minutes, so it does not depend on anyone opening the app. Uploads
--     check `reporting_period_past_deadline` themselves, so the five minutes can never let one through.
--   * No record is touched: what was already uploaded still finishes verification and approval.
--   * `users.notifications_seen_at` is how far pop-ups have reached for an account. It starts at the time of this
--     migration, so an old backlog does not pop up.

alter table public.users
  add column notifications_seen_at timestamptz not null default now();

create function public.reporting_period_past_deadline(p public.reporting_periods)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p.submission_closes_on, p.end_date) < (now() at time zone 'Asia/Kolkata')::date;
$$;

create function public.close_expired_reporting_periods()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  period public.reporting_periods;
  closed integer := 0;
  unapproved integer;
  unresolved integer;
begin
  -- The same lock as a manual open or close, and uploads wait on it, so nothing lands mid-close.
  perform pg_advisory_xact_lock(hashtext('reporting_period_status'));

  for period in
    select * from public.reporting_periods rp
    where rp.status = 'open' and public.reporting_period_past_deadline(rp)
    for update
  loop
    select
      count(*) filter (where r.approval_status::text <> 'approved'
                         and r.data_quality_state::text <> 'rejected'),
      count(*) filter (where r.validation_status::text in ('failed', 'flagged'))
    into unapproved, unresolved
    from public.esg_records r
    where r.reporting_period_id = period.id;

    update public.reporting_periods
    set status = 'closed', closed_at = now()
    where id = period.id;

    insert into public.audit_logs (event_type, entity_type, entity_id, user_id, old_value, new_value, reason)
    values (
      'reporting_period.closed_automatically', 'reporting_period', period.id, null,
      jsonb_build_object('status', 'open'),
      jsonb_build_object(
        'status', 'closed',
        'deadline', coalesce(period.submission_closes_on, period.end_date),
        'unapproved_records', unapproved,
        'unresolved_validation', unresolved),
      'The deadline passed.');

    insert into public.notifications
      (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
    select distinct uoa.user_id, 'period_closed', period.label || ' closed automatically',
           unapproved || ' record(s) still unapproved, ' || unresolved
             || ' with validation issues. No period is open, so uploads are paused until you open the next one.',
           'reporting_period', period.id, '/admin/reporting-periods'
    from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id and r.code = 'admin'
    join public.users u on u.id = uoa.user_id and u.is_active and u.deleted_at is null
    where uoa.revoked_at is null;

    closed := closed + 1;
  end loop;

  return closed;
end;
$$;

revoke execute on function public.close_expired_reporting_periods() from public, anon, authenticated;
revoke execute on function public.reporting_period_past_deadline(public.reporting_periods)
  from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule(
  'close-expired-reporting-periods',
  '*/5 * * * *',
  'select public.close_expired_reporting_periods()'
);
