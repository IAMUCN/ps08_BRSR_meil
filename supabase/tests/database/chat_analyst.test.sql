-- The chatbot's database boundary (migration 0042, .grill/chat-analyst-decisions.md): the role its tools
-- connect as can read the figures and nothing else, cannot write anywhere, and the saved conversations are
-- closed to the browser and to that role.
begin;
create extension if not exists pgtap with schema extensions;

select plan(24);

-- --- What the role holds ----------------------------------------------------------------------------------
select has_role('chat_reader');
select is(
  (select count(*)::int from information_schema.table_privileges
   where grantee = 'chat_reader' and privilege_type <> 'SELECT'),
  0, 'chat_reader holds no table privilege other than SELECT');
select is(
  (select count(*)::int from information_schema.column_privileges
   where grantee = 'chat_reader' and privilege_type <> 'SELECT'),
  0, 'chat_reader holds no column privilege other than SELECT');
select ok(
  (select rolconfig @> array['default_transaction_read_only=on'] from pg_roles where rolname = 'chat_reader'),
  'chat_reader transactions are read-only by default');
select ok(not (select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles
               where rolname = 'chat_reader'),
          'chat_reader has no special attributes');

-- Nothing about people, documents, the audit trail, settings, reports or conversations.
select is(
  (select array_agg(t order by t) from unnest(array[
      'users', 'user_org_assignments', 'roles', 'audit_logs', 'notifications', 'org_settings', 'documents',
      'ocr_extractions', 'ocr_fields', 'report_runs', 'brsr_disclosures', 'password_reset_otps',
      'rate_limit_events', 'chat_conversations', 'chat_messages', 'verifications', 'approvals']) t
   where has_table_privilege('chat_reader', 'public.' || t, 'select')
      or has_any_column_privilege('chat_reader', 'public.' || t, 'select')),
  null, 'chat_reader can read no table outside its list');
select ok(has_table_privilege('chat_reader', 'public.consolidation_records', 'select'),
          'chat_reader can read the consolidation view');
select ok(not has_column_privilege('chat_reader', 'public.esg_records', 'submitted_by', 'select')
          and not has_column_privilege('chat_reader', 'public.esg_records', 'verified_by', 'select')
          and not has_column_privilege('chat_reader', 'public.conversion_factor_versions', 'created_by', 'select')
          and not has_column_privilege('chat_reader', 'public.submission_expectations', 'created_by', 'select'),
          'the columns that name a person are not readable');

-- --- What it can do, acting as the role -------------------------------------------------------------------
insert into public.org_units (id, parent_id, unit_type, name)
values ('42000000-0000-4000-8000-000000000001', (select id from public.org_units where parent_id is null limit 1),
        'subsidiary', 'Chat fixture unit');

-- Runs a statement as chat_reader and returns 'ok' or the error code. (The role cannot call pgTAP itself:
-- it has no access to the extensions schema.) The grant lasts for this transaction only.
grant chat_reader to current_user with set true;
create function pg_temp.as_chat_reader(statement text) returns text language plpgsql as $$
declare code text := 'ok';
begin
  set local role chat_reader;
  begin
    execute statement;
  exception when others then
    code := sqlstate;
  end;
  reset role;
  return code;
end $$;

select is(pg_temp.as_chat_reader('select count(*) from public.consolidation_records'), 'ok',
          'reads the consolidation view');
select is(pg_temp.as_chat_reader('select descendant_id from public.org_unit_tree limit 1'), 'ok',
          'reads the org tree');
-- Division by zero would mean row level security hid the row.
select is(pg_temp.as_chat_reader(
            $$ select 1 / count(*) from public.org_units where id = '42000000-0000-4000-8000-000000000001' $$),
          'ok', 'row level security lets it see org units');
select is(pg_temp.as_chat_reader(
            'select id, activity_value_verified, approval_status from public.esg_records limit 1'),
          'ok', 'reads record figures');
select is(pg_temp.as_chat_reader('select submitted_by from public.esg_records limit 1'), '42501',
          'cannot read who submitted a record');
select is(pg_temp.as_chat_reader('select * from public.esg_records limit 1'), '42501',
          'cannot select every column of a record');
select is(pg_temp.as_chat_reader('select email from public.users limit 1'), '42501', 'cannot read users');
select is(pg_temp.as_chat_reader('select 1 from public.audit_logs limit 1'), '42501',
          'cannot read the audit log');
select is(pg_temp.as_chat_reader('select 1 from public.ocr_fields limit 1'), '42501', 'cannot read OCR text');
select is(pg_temp.as_chat_reader('select 1 from public.chat_messages limit 1'), '42501',
          'cannot read saved conversations');
select is(pg_temp.as_chat_reader($$ update public.esg_records set approval_status = 'approved' $$), '42501',
          'cannot approve or change a record');
select is(pg_temp.as_chat_reader('delete from public.org_units'), '42501', 'cannot delete org units');
select is(pg_temp.as_chat_reader(
            $$ insert into public.reporting_periods (label, start_date, end_date)
               values ('chat', '2031-01-01', '2031-01-31') $$),
          '42501', 'cannot insert');

-- --- Saved conversations are server-only ------------------------------------------------------------------
select is(
  (select count(*)::int from information_schema.table_privileges
   where table_schema = 'public' and table_name in ('chat_conversations', 'chat_messages')
     and grantee in ('anon', 'authenticated')),
  0, 'the browser roles hold nothing on the conversation tables');

-- --- Availability is a permission --------------------------------------------------------------------------
select is(
  (select count(*)::int from public.roles r
   where r.code <> 'auditor' -- the Assurance Reviewer (0067) arrived later and does not get it by default
     and not exists (select 1 from public.role_permissions rp
                     join public.permissions p on p.id = rp.permission_id and p.code = 'chat.use'
                     where rp.role_id = r.id)),
  0, 'every role that existed when the chatbot arrived may use it');
insert into public.roles (code, name) values ('chat_fixture_role', 'Chat fixture role');
select is(
  (select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
   where r.code = 'chat_fixture_role'),
  0, 'a role created later does not get it until an Admin grants it');

select * from finish();
rollback;
