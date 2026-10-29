-- Database audit of 2026-10-12 (DATABASE_AUDIT_2026-10-12.md, migration 0047, D38). Behavioural checks with
-- four identities — anonymous, a Project Manager at Project X, a Project Manager at a sibling project, an
-- Admin — acting as the browser roles, with the application out of the way. phase2_smoke checks the grants
-- in the catalogue; this tries the statements. The second half checks the rules 0047 added for the server's
-- own connection, which RLS does not bind. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Fixtures (as postgres) ---------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role) values
  ('47474747-0000-4000-8000-00000000000a', 'a3.a@example.test', 'authenticated', 'authenticated'),
  ('47474747-0000-4000-8000-00000000000b', 'a3.b@example.test', 'authenticated', 'authenticated'),
  ('47474747-0000-4000-8000-00000000000c', 'a3.admin@example.test', 'authenticated', 'authenticated');
insert into public.users (id, display_name, email) values
  ('47474747-0000-4000-8000-00000000000a', 'A3 PM A', 'a3.a@example.test'),
  ('47474747-0000-4000-8000-00000000000b', 'A3 PM B', 'a3.b@example.test'),
  ('47474747-0000-4000-8000-00000000000c', 'A3 Admin', 'a3.admin@example.test');
insert into public.org_units (parent_id, unit_type, name, code)
select id, 'project', 'Project Q', 'A3-Q' from public.org_units where code = 'SUB-A';
-- Whoever already holds the Super Admin role in this database is set aside first: at most two may hold it
-- (migration 0050), and this fixture adds one. Rolled back with the rest of the test.
update public.user_org_assignments uoa set revoked_at = now()
from public.roles r where r.id = uoa.role_id and r.code = 'admin' and uoa.revoked_at is null;
insert into public.user_org_assignments (user_id, org_unit_id, role_id, assigned_by)
select a.u::uuid, o.id, r.id, '47474747-0000-4000-8000-00000000000c'
from (values ('47474747-0000-4000-8000-00000000000a', 'PRJ-X', 'project_manager'),
             ('47474747-0000-4000-8000-00000000000b', 'A3-Q', 'project_manager'),
             ('47474747-0000-4000-8000-00000000000c', 'MEIL', 'admin')) as a (u, org, role)
join public.org_units o on o.code = a.org join public.roles r on r.code = a.role;

-- One document and one record at each project.
insert into public.documents (id, org_unit_id, reporting_period_id, storage_path, file_name, mime_type,
  file_size_bytes, file_hash, uploaded_by)
select d.id::uuid, o.id, p.id, 'a3/' || d.code || '.pdf', d.code || '.pdf', 'application/pdf', 1,
  'a3-hash-' || d.code, d.by::uuid
from (values ('47474747-0000-4000-8000-0000000000d1', 'PRJ-X', '47474747-0000-4000-8000-00000000000a'),
             ('47474747-0000-4000-8000-0000000000d2', 'A3-Q', '47474747-0000-4000-8000-00000000000b')) as d (id, code, by)
join public.org_units o on o.code = d.code, public.reporting_periods p where p.status = 'open';
insert into public.esg_records (id, org_unit_id, reporting_period_id, metric_id, scope_id, submitted_by)
select r.id::uuid, o.id, p.id, m.id, m.scope_id, r.by::uuid
from (values ('47474747-0000-4000-8000-0000000000e1', 'PRJ-X', '47474747-0000-4000-8000-00000000000a'),
             ('47474747-0000-4000-8000-0000000000e2', 'A3-Q', '47474747-0000-4000-8000-00000000000b')) as r (id, code, by)
join public.org_units o on o.code = r.code, public.reporting_periods p, public.esg_metrics m
where p.status = 'open' and m.code = 'DIESEL_CONSUMPTION';
insert into public.esg_record_documents (esg_record_id, document_id, added_by) values
  ('47474747-0000-4000-8000-0000000000e1', '47474747-0000-4000-8000-0000000000d1', '47474747-0000-4000-8000-00000000000a'),
  ('47474747-0000-4000-8000-0000000000e2', '47474747-0000-4000-8000-0000000000d2', '47474747-0000-4000-8000-00000000000b');
insert into public.notifications (id, user_id, type, title, message, deep_link_path)
select n.id::uuid, n.u::uuid, 'verification_needed', 'A3', 'A3', '/app'
from (values ('47474747-0000-4000-8000-0000000000a1', '47474747-0000-4000-8000-00000000000a'),
             ('47474747-0000-4000-8000-0000000000a2', '47474747-0000-4000-8000-00000000000b')) as n (id, u);
insert into public.submission_expectations (org_unit_id, metric_id)
select o.id, m.id from public.org_units o, public.esg_metrics m
where o.code = 'A3-Q' and m.code = 'DIESEL_CONSUMPTION';
insert into public.password_reset_otps (user_id, code_hash, expires_at) values
  ('47474747-0000-4000-8000-00000000000b', repeat('a', 64), now() + interval '10 minutes');
insert into public.chat_conversations (user_id, title) values
  ('47474747-0000-4000-8000-00000000000b', 'A3 private conversation');
insert into public.carbon_credits (id, org_unit_id, project_name, registry, registry_project_id,
  serial_number_start, serial_number_end, quantity_tco2e, vintage_year, methodology_code, issuance_date,
  verifier_name)
select '47474747-0000-4000-8000-0000000000c1', id, 'A3 batch', 'VERRA_VCS', 'A3', 'S1', 'S9', 10, 2024, 'M1',
  '2025-01-01', 'A3 verifier' from public.org_units where code = 'A3-Q';

-- Helpers. pgTAP cannot be called while acting as a browser role, so each helper switches role itself.
-- Acts as `as_role` (with `subject` as the signed-in user, or none) and reports how many public tables let
-- the statement past the privilege check: success, or any error other than "permission denied" (42501).
create function pg_temp.tables_allowing(as_role text, subject text, action text) returns int
language plpgsql as $$
declare
  t record;
  allowed int := 0;
  statement text;
begin
  execute format('set local role %I', as_role);
  perform set_config('request.jwt.claims',
    case when subject is null then '' else format('{"sub": "%s", "role": "authenticated"}', subject) end, true);
  for t in
    select c.relname as name,
           (select a.attname from pg_attribute a
             where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
               and a.attidentity = '' and a.attgenerated = ''
               and (c.relname <> 'notifications' or a.attname <> 'is_read')
             order by a.attnum limit 1) as col
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    statement := case action
      when 'select' then format('select 1 from public.%I limit 1', t.name)
      when 'insert' then format('insert into public.%I default values', t.name)
      when 'update' then format('update public.%I set %I = %I where false', t.name, t.col, t.col)
      when 'delete' then format('delete from public.%I where false', t.name)
      when 'truncate' then format('truncate public.%I', t.name)
    end;
    begin
      execute statement;
      allowed := allowed + 1;
    exception
      when insufficient_privilege then null;
      when others then allowed := allowed + 1;
    end;
  end loop;
  reset role;
  return allowed;
end;
$$;

-- Runs one counting query as a signed-in user and returns the count; -1 when the privilege check refuses it.
create function pg_temp.count_as(subject text, query text) returns int
language plpgsql as $$
declare
  n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', subject), true);
  begin
    execute query into n;
  exception when insufficient_privilege then n := -1;
  end;
  reset role;
  return n;
end;
$$;

-- Runs one statement as a signed-in user and returns its SQLSTATE ('00000' when it ran), with rows changed.
create function pg_temp.run_as(subject text, statement text, out state text, out changed int)
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', subject), true);
  begin
    execute statement;
    get diagnostics changed = row_count;
    state := '00000';
  exception when others then
    state := sqlstate;
    changed := 0;
  end;
  reset role;
end;
$$;

-- 1. Anonymous: nothing at all ---------------------------------------------------------------------------
select is(pg_temp.tables_allowing('anon', null, 'select'), 0, 'anonymous: no table can be read');
select is(pg_temp.tables_allowing('anon', null, 'insert'), 0, 'anonymous: no table accepts an insert');
select is(pg_temp.tables_allowing('anon', null, 'update'), 0, 'anonymous: no table accepts an update');
select is(pg_temp.tables_allowing('anon', null, 'delete'), 0, 'anonymous: no table accepts a delete');

-- 2. Signed-in browser roles never write, whatever their role in the app ------------------------------------
select is(pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000a', 'insert'), 0,
  'a Project Manager: no table accepts an insert from the browser');
select is(pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000a', 'update'), 0,
  'a Project Manager: no table accepts an update (other than the one notifications column)');
select is(pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000a', 'delete'), 0,
  'a Project Manager: no table accepts a delete');
select is(pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000c', 'insert')
        + pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000c', 'update')
        + pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000c', 'delete')
        + pg_temp.tables_allowing('authenticated', '47474747-0000-4000-8000-00000000000c', 'truncate'), 0,
  'an Admin: no table accepts a write from the browser either — every change goes through the server');

-- 3. Cross-project reads: PM A (Project X) against Project Q's rows ------------------------------------------
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.esg_records where id = '47474747-0000-4000-8000-0000000000e2'$$), 0,
  'PM A cannot read a sibling project''s record by its id');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.documents where id = '47474747-0000-4000-8000-0000000000d2'$$), 0,
  'nor its document');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.esg_record_documents where document_id = '47474747-0000-4000-8000-0000000000d2'$$), 0,
  'nor the link between them');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.org_units where code = 'A3-Q'$$), 0, 'nor the sibling org unit itself');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.submission_expectations se join public.org_units o on o.id = se.org_unit_id$$)
  , pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.submission_expectations where org_unit_id in (select public.my_org_unit_ids())$$),
  'expected submissions: only those of units in scope');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.esg_records where id = '47474747-0000-4000-8000-0000000000e1'$$), 1,
  'PM A does read their own project''s record');

-- 4. People: a user reads their own account and assignments, an Admin reads all ------------------------------
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.users$$), 1, 'PM A reads exactly one users row: their own');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.users where email = 'a3.b@example.test'$$), 0,
  'another employee''s email and employee id are not readable');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.user_org_assignments where user_id <> '47474747-0000-4000-8000-00000000000a'$$), 0,
  'nor anyone else''s role assignments');
select ok(pg_temp.count_as('47474747-0000-4000-8000-00000000000c',
  $$select count(*) from public.users$$) >= 3, 'the Admin reads every account');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.notifications where user_id <> '47474747-0000-4000-8000-00000000000a'$$), 0,
  'notifications: only one''s own');

-- 5. Notifications: the one browser write, limited to one's own rows and one column --------------------------
select is((select changed from pg_temp.run_as('47474747-0000-4000-8000-00000000000a',
  $$update public.notifications set is_read = true where id = '47474747-0000-4000-8000-0000000000a1'$$)), 1,
  'PM A marks their own notification read');
select is((select changed from pg_temp.run_as('47474747-0000-4000-8000-00000000000a',
  $$update public.notifications set is_read = true where id = '47474747-0000-4000-8000-0000000000a2'$$)), 0,
  'marking someone else''s changes nothing');
select is((select state from pg_temp.run_as('47474747-0000-4000-8000-00000000000a',
  $$update public.notifications set message = 'changed' where id = '47474747-0000-4000-8000-0000000000a1'$$)), '42501',
  'and no other column of a notification can be changed');

-- 6. Sensitive and server-only tables and views -----------------------------------------------------------
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.audit_logs$$), 0, 'the audit trail shows nothing to a non-Admin');
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.org_settings$$), 0,
  'settings (turnover, assurance, rate limits) are not readable by a non-Admin (0047)');
select ok(pg_temp.count_as('47474747-0000-4000-8000-00000000000c',
  $$select count(*) from public.org_settings$$) > 0, 'an Admin still reads settings');
select is((select array_agg(pg_temp.count_as('47474747-0000-4000-8000-00000000000c',
  format('select count(*) from public.%I', t)) order by t)
  from unnest(array['carbon_credits', 'carbon_credit_transactions', 'internal_carbon_prices',
    'capex_carbon_evaluations', 'chat_conversations', 'chat_messages', 'password_reset_otps',
    'rate_limit_events', 'brsr_disclosures', 'document_bundle_parts', 'org_levels', 'org_unit_parents',
    'org_unit_tree', 'org_unit_links', 'consolidation_records', 'user_invitations',
    'user_sessions']) as t),
  array_fill(-1, array[17]),
  'server-only tables and the roll-up views refuse the browser roles outright, an Admin included');

-- 7. Functions ---------------------------------------------------------------------------------------------
select is(pg_temp.count_as('47474747-0000-4000-8000-00000000000a',
  $$select count(*) from public.my_org_unit_ids() i join public.org_units o on o.id = i where o.code = 'A3-Q'$$), 0,
  'my_org_unit_ids() never returns a sibling project');
select ok(not has_function_privilege('anon', 'public.is_admin()', 'execute')
      and not has_function_privilege('anon', 'public.my_org_unit_ids()', 'execute'),
  'anonymous cannot call the scope helpers');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
     and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))),
  0, 'no trigger function is executable by a browser role (0047)');
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0, 'every function in public has a fixed search path (0047)');
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and (has_table_privilege('authenticated', c.oid, 'MAINTAIN')
          or has_table_privilege('anon', c.oid, 'MAINTAIN'))),
  0, 'browser roles hold no MAINTAIN privilege (0047)');

-- 8. The chatbot's role --------------------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array['carbon_credits', 'carbon_credit_transactions',
     'internal_carbon_prices', 'capex_carbon_evaluations']) as t
   where has_table_privilege('chat_reader', 'public.' || t, 'SELECT')),
  0, 'chat_reader no longer reads the carbon tables (0047)');

-- 9. Rules for the server's own connection (0047) -----------------------------------------------------------
select throws_ok(
  $$update public.esg_records set org_unit_id = (select id from public.org_units where code = 'A3-Q')
    where id = '47474747-0000-4000-8000-0000000000e1'$$,
  '42501', null, 'a record cannot be moved to another org unit, even by the server');
select throws_ok(
  $$update public.documents set uploaded_by = '47474747-0000-4000-8000-00000000000b'
    where id = '47474747-0000-4000-8000-0000000000d1'$$,
  '42501', null, 'a document cannot be re-attributed to another person');
select lives_ok(
  $$update public.esg_records set activity_unit = 'L', org_unit_id = org_unit_id
    where id = '47474747-0000-4000-8000-0000000000e1'$$,
  'an ordinary update of a record still works');
select throws_ok(
  $$insert into public.esg_record_documents (esg_record_id, document_id, added_by) values
    ('47474747-0000-4000-8000-0000000000e1', '47474747-0000-4000-8000-0000000000d2', '47474747-0000-4000-8000-00000000000a')$$,
  '23514', null, 'a record cannot be given another org unit''s document as evidence');

select lives_ok(
  $$insert into public.carbon_credit_transactions (credit_id, transaction_type, quantity_tco2e,
      counterparty_name, executed_by)
    values ('47474747-0000-4000-8000-0000000000c1', 'TRANSFER', 6, 'A3 buyer', '47474747-0000-4000-8000-00000000000c')$$,
  'a transfer within the batch''s balance is recorded');
select throws_ok(
  $$insert into public.carbon_credit_transactions (credit_id, transaction_type, quantity_tco2e,
      counterparty_name, executed_by)
    values ('47474747-0000-4000-8000-0000000000c1', 'TRANSFER', 6, 'A3 buyer', '47474747-0000-4000-8000-00000000000c')$$,
  '23514', null, 'a second one that would over-draw the batch is refused by the table itself');
select throws_ok(
  $$insert into public.carbon_credit_transactions (credit_id, transaction_type, quantity_tco2e, executed_by)
    values ('47474747-0000-4000-8000-0000000000c1', 'RETIREMENT', 1, '47474747-0000-4000-8000-00000000000c')$$,
  '23514', null, 'a retirement must name its period, beneficiary and scope');
select throws_ok(
  $$insert into public.carbon_credit_transactions (credit_id, transaction_type, quantity_tco2e, executed_by)
    values ('47474747-0000-4000-8000-0000000000c1', 'TRANSFER', 1, '47474747-0000-4000-8000-00000000000c')$$,
  '23514', null, 'a transfer must name the counterparty');
select throws_ok(
  $$insert into public.internal_carbon_prices (org_unit_id, effective_from, shadow_price_per_tco2e, source_rational)
    select org_unit_id, current_date, 1, 'A3 duplicate' from public.internal_carbon_prices where is_active limit 1$$,
  '23505', null, 'an org unit cannot have two active internal carbon prices');

select * from finish();
rollback;
