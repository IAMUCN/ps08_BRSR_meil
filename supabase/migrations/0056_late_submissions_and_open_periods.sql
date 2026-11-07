-- Several open reporting periods, late uploads, and the bill number on a record (feature_enhancement.md
-- Phase 2, requirements 22, 23 and 39; SCHEMA_DEVIATIONS D46; .grill/feature-enhancement-roadmap-decisions.md,
-- "Phase 2 decisions").
--
--   * More than one period may be open at a time: a month's bills arrive after the month ends, so August stays
--     open while September is open too. The uploader picks the period.
--   * A period has a due date (`submission_closes_on`) and, new, a "late uploads until" date
--     (`late_uploads_until`). Between the two an upload is accepted and marked late (`esg_records.submitted_late`);
--     validation flags it for review. On the second date the job closes the period. A period without the new date
--     closes on its due date, exactly as before.
--   * `esg_records.bill_number`: the confirmed bill or invoice number, kept on the record so it can be shown,
--     searched and compared. Files stay stored by their id; the number is never part of a storage path.
--
-- Code built before this migration keeps working: it still finds an open period (the first one) and still
-- refuses uploads past the due date. Undo: in the footer of this file.

-- --- Several open periods ---------------------------------------------------------------------------------------
drop index public.reporting_periods_single_open;
create index reporting_periods_open_idx on public.reporting_periods (start_date desc) where status = 'open';

-- --- The late-upload window -------------------------------------------------------------------------------------
alter table public.reporting_periods
  add column late_uploads_until date,
  add constraint reporting_periods_late_window_check
    check (late_uploads_until is null or late_uploads_until >= coalesce(submission_closes_on, end_date));

-- Today in India, the business calendar of every date above.
create function public.reporting_period_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- Past the due date: an upload now is late. (reporting_period_past_deadline, 0053, answers the same question.)
create function public.reporting_period_late(p public.reporting_periods)
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(p.submission_closes_on, p.end_date) < public.reporting_period_today() $$;

-- Past the last day uploads are taken, late ones included: the period closes.
create function public.reporting_period_locked(p public.reporting_periods)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(p.late_uploads_until, p.submission_closes_on, p.end_date) < public.reporting_period_today()
$$;

-- The job (0053) now closes a period when its late-upload window has ended, not on its due date.
create or replace function public.close_expired_reporting_periods()
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
  perform pg_advisory_xact_lock(hashtext('reporting_period_status'));

  for period in
    select * from public.reporting_periods rp
    where rp.status = 'open' and public.reporting_period_locked(rp)
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
        'late_uploads_until', period.late_uploads_until,
        'unapproved_records', unapproved,
        'unresolved_validation', unresolved),
      case when period.late_uploads_until is null then 'The deadline passed.'
           else 'The late-upload window ended.' end);

    insert into public.notifications
      (user_id, type, title, message, related_entity_type, related_entity_id, deep_link_path)
    select distinct uoa.user_id, 'period_closed', period.label || ' closed automatically',
           unapproved || ' record(s) still unapproved, ' || unresolved
             || ' with validation issues. No more uploads are taken for it.',
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

-- --- On the record ----------------------------------------------------------------------------------------------
alter table public.esg_records
  -- Uploaded after its period's due date; fixed at upload, so a later change of the date does not rewrite it.
  add column submitted_late boolean not null default false,
  -- The confirmed bill / invoice number, as verified (trimmed). Null when the document has none.
  add column bill_number text check (char_length(bill_number) <= 120);

create index esg_records_bill_number_idx on public.esg_records (upper(bill_number)) where bill_number is not null;

-- Who chose a document's type: the person on the verify screen ('person'), or an Admin correcting it
-- ('admin'). Null with a type set means the OCR worker chose it (the worker is not changed for this).
alter table public.documents
  add column document_type_source text check (document_type_source in ('person', 'admin'));

-- The numbers already confirmed.
update public.esg_records r
set bill_number = nullif(trim(f.verified_value), '')
from public.esg_record_documents erd
join public.ocr_extractions e on e.document_id = erd.document_id
join public.ocr_fields f on f.ocr_extraction_id = e.id and f.field_key = 'invoice_number'
where erd.esg_record_id = r.id and erd.is_primary
  and r.verification_status = 'user_verified'
  and nullif(trim(f.verified_value), '') is not null;

revoke all on function public.reporting_period_today() from public, anon, authenticated;
revoke all on function public.reporting_period_late(public.reporting_periods) from public, anon, authenticated;
revoke all on function public.reporting_period_locked(public.reporting_periods) from public, anon, authenticated;

-- Undo (after the code that uses these is gone; refuses if two periods are open):
--   drop index public.esg_records_bill_number_idx;
--   alter table public.documents drop column document_type_source;
--   alter table public.esg_records drop column bill_number, drop column submitted_late;
--   restore close_expired_reporting_periods() from 0053;
--   drop function public.reporting_period_locked(public.reporting_periods);
--   drop function public.reporting_period_late(public.reporting_periods);
--   drop function public.reporting_period_today();
--   alter table public.reporting_periods drop constraint reporting_periods_late_window_check,
--     drop column late_uploads_until;
--   drop index public.reporting_periods_open_idx;
--   create unique index reporting_periods_single_open on public.reporting_periods (status) where status = 'open';
