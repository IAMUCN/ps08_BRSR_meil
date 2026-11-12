-- Several open periods, late uploads, bill numbers (migration 0056; feature_enhancement.md Phase 2).
begin;
select plan(17);

create function pg_temp.err(statement text) returns text language plpgsql as $$
begin
  execute statement;
  return '';
exception when others then
  return sqlerrm;
end;
$$;

-- India's today, as the functions see it; every date below is relative to it.
create function pg_temp.today() returns date language sql as $$ select public.reporting_period_today() $$;

insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000056u1', 'late_test@meil.test')
on conflict (id) do nothing;

insert into public.users (id, display_name, email)
values ('00000000-0000-4000-8000-0000000056u1', 'Late User', 'late_test@meil.test')
on conflict (id) do nothing;

-- Room for the test's own periods: whatever is open locally stays open, and the job must not touch it.
update public.reporting_periods set late_uploads_until = null where status = 'open';

insert into public.reporting_periods (id, label, start_date, end_date, status, submission_closes_on, late_uploads_until)
values
  -- Due date passed, still inside the late window.
  ('56565656-0000-4000-8000-000000000001', 'P2 late window', pg_temp.today() - 60, pg_temp.today() - 31, 'open',
   pg_temp.today() - 5, pg_temp.today() + 10),
  -- Both dates passed: the job closes it.
  ('56565656-0000-4000-8000-000000000002', 'P2 past window', pg_temp.today() - 120, pg_temp.today() - 91, 'open',
   pg_temp.today() - 60, pg_temp.today() - 1),
  -- No late date and past its due date: closes on the due date, as before 0056.
  ('56565656-0000-4000-8000-000000000003', 'P2 old style', pg_temp.today() - 200, pg_temp.today() - 171, 'open',
   pg_temp.today() - 2, null),
  -- On time.
  ('56565656-0000-4000-8000-000000000004', 'P2 on time', pg_temp.today() - 10, pg_temp.today() + 20, 'open',
   pg_temp.today() + 35, pg_temp.today() + 65);

select ok((select count(*) from public.reporting_periods where status = 'open') >= 4,
  'several periods can be open at once');

-- --- Late and locked ---------------------------------------------------------------------------------------------
select is((select public.reporting_period_late(p) from public.reporting_periods p
           where id = '56565656-0000-4000-8000-000000000001'), true, 'past the due date an upload is late');
select is((select public.reporting_period_locked(p) from public.reporting_periods p
           where id = '56565656-0000-4000-8000-000000000001'), false, 'but the period still takes uploads');
select is((select public.reporting_period_late(p) from public.reporting_periods p
           where id = '56565656-0000-4000-8000-000000000004'), false, 'before the due date it is on time');
select is((select public.reporting_period_locked(p) from public.reporting_periods p
           where id = '56565656-0000-4000-8000-000000000002'), true, 'past the late window it is locked');
select is((select public.reporting_period_locked(p) from public.reporting_periods p
           where id = '56565656-0000-4000-8000-000000000003'), true,
  'without a late date it locks on the due date');

-- --- The job ---------------------------------------------------------------------------------------------------
select is(public.close_expired_reporting_periods(), 2, 'the job closes the two locked periods');
select is(
  (select string_agg(label, ', ' order by label) from public.reporting_periods
   where id::text like '56565656-%' and status = 'closed'),
  'P2 old style, P2 past window', 'and only those');
select is(
  (select reason from public.audit_logs
   where entity_id = '56565656-0000-4000-8000-000000000002'
     and event_type = 'reporting_period.closed_automatically'),
  'The late-upload window ended.', 'its audit entry says why');
select is(
  (select reason from public.audit_logs
   where entity_id = '56565656-0000-4000-8000-000000000003'
     and event_type = 'reporting_period.closed_automatically'),
  'The deadline passed.', 'a period without a late window closed on its deadline');

-- --- Rules ------------------------------------------------------------------------------------------------------
select matches(
  pg_temp.err($$update public.reporting_periods set late_uploads_until = submission_closes_on - 1
               where id = '56565656-0000-4000-8000-000000000004'$$),
  'reporting_periods_late_window_check', 'late uploads cannot end before the due date');
select ok(
  not has_function_privilege('authenticated', 'public.reporting_period_locked(public.reporting_periods)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.reporting_period_late(public.reporting_periods)', 'EXECUTE'),
  'the browser roles cannot call the period functions');

-- --- On the record ----------------------------------------------------------------------------------------------
select has_column('public', 'esg_records', 'submitted_late', 'a record says whether it was late');
select col_default_is('public', 'esg_records', 'submitted_late', 'false', 'and is on time unless set');
select has_column('public', 'esg_records', 'bill_number', 'a record keeps its confirmed bill number');
select matches(
  pg_temp.err($$update public.documents set document_type_source = 'robot' where false$$ ||
              $$; insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name,
                 mime_type, file_size_bytes, file_hash, uploaded_by, document_type_source)
               select gen_random_uuid(), o.id, '56565656-0000-4000-8000-000000000004', 'x', 'x.pdf',
                      'application/pdf', 1, repeat('0', 64), u.id, 'robot'
               from public.org_units o, public.users u limit 1$$),
  'document_type_source', 'who chose a document type is OCR (null), the person or an Admin');
select ok(
  not exists (select 1 from pg_indexes where indexname = 'reporting_periods_single_open'),
  'the one-open-period index is gone');

select * from finish();
rollback;
