-- Migration 0047: data isolation hardening (database audit of 2026-10-12, DATABASE_AUDIT_2026-10-12.md, D38).
--
-- Nothing here changes what a legitimate workflow may do. Each section turns a rule the application already
-- follows into a rule the database enforces for every writer (the app's own connection and the service role
-- bypass RLS, so RLS cannot do this), or removes a privilege nothing uses.
--
-- Rollback: every section lists its own undo. Constraints are added NOT VALID, so existing rows are never
-- re-checked and the migration cannot fail on data already stored.

-------------------------------------------------------------------------------------------------
-- 1. A record and a document keep the org unit and the person they were filed under.
--    Scope (RLS, the app's checks, consolidation) hangs off org_unit_id; nothing in the app or the OCR
--    worker ever changes it, so a change can only be a mistake or an attempt to move data across a boundary.
--    Undo: drop trigger trg_esg_records_ownership on public.esg_records;
--          drop trigger trg_documents_ownership on public.documents;
--          drop function public.prevent_ownership_change();
-------------------------------------------------------------------------------------------------
create or replace function public.prevent_ownership_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% cannot be moved to another org unit or person once filed', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_ownership_change() from public, anon, authenticated;

drop trigger if exists trg_esg_records_ownership on public.esg_records;
create trigger trg_esg_records_ownership
  before update of org_unit_id, submitted_by on public.esg_records
  for each row
  when (new.org_unit_id is distinct from old.org_unit_id
        or new.submitted_by is distinct from old.submitted_by)
  execute function public.prevent_ownership_change();

drop trigger if exists trg_documents_ownership on public.documents;
create trigger trg_documents_ownership
  before update of org_unit_id, uploaded_by on public.documents
  for each row
  when (new.org_unit_id is distinct from old.org_unit_id
        or new.uploaded_by is distinct from old.uploaded_by)
  execute function public.prevent_ownership_change();

-------------------------------------------------------------------------------------------------
-- 2. Evidence is linked only to a record of the same org unit.
--    A link across org units would show one project's document to people scoped to another (the OCR and
--    evidence policies follow the document, the record policies follow the record).
--    Undo: drop trigger trg_esg_record_documents_same_org on public.esg_record_documents;
--          drop function public.enforce_record_document_org();
-------------------------------------------------------------------------------------------------
create or replace function public.enforce_record_document_org() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select r.org_unit_id from public.esg_records r where r.id = new.esg_record_id)
     is distinct from
     (select d.org_unit_id from public.documents d where d.id = new.document_id) then
    raise exception 'A record and its evidence document must belong to the same org unit'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_record_document_org() from public, anon, authenticated;

drop trigger if exists trg_esg_record_documents_same_org on public.esg_record_documents;
create trigger trg_esg_record_documents_same_org
  before insert or update of esg_record_id, document_id on public.esg_record_documents
  for each row execute function public.enforce_record_document_org();

-------------------------------------------------------------------------------------------------
-- 3. Carbon credits: the ledger cannot be over-drawn, whoever writes it.
--    The application checks the balance before a retirement or transfer; this makes double counting
--    impossible at the table itself and closes the gap between two requests arriving together.
--    Undo: drop trigger trg_carbon_credit_transactions_balance on public.carbon_credit_transactions;
--          drop function public.enforce_carbon_credit_balance();
--          alter table public.carbon_credit_transactions
--            drop constraint carbon_credit_transactions_retirement_fields,
--            drop constraint carbon_credit_transactions_transfer_fields;
--          drop index if exists public.internal_carbon_prices_one_active;
-------------------------------------------------------------------------------------------------
create or replace function public.enforce_carbon_credit_balance() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  batch_quantity numeric;
  already_used numeric;
begin
  -- Locks the batch, so two transactions against it are checked one after the other.
  select c.quantity_tco2e into batch_quantity
  from public.carbon_credits c where c.id = new.credit_id for update;
  select coalesce(sum(t.quantity_tco2e), 0) into already_used
  from public.carbon_credit_transactions t where t.credit_id = new.credit_id;
  if already_used + new.quantity_tco2e > batch_quantity + 0.0001 then
    raise exception 'This batch holds % tCO2e and % is already retired or transferred',
      batch_quantity, already_used
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_carbon_credit_balance() from public, anon, authenticated;

drop trigger if exists trg_carbon_credit_transactions_balance on public.carbon_credit_transactions;
create trigger trg_carbon_credit_transactions_balance
  before insert on public.carbon_credit_transactions
  for each row execute function public.enforce_carbon_credit_balance();

-- A retirement names what it offsets; a transfer names who received it.
alter table public.carbon_credit_transactions
  drop constraint if exists carbon_credit_transactions_retirement_fields,
  drop constraint if exists carbon_credit_transactions_transfer_fields;
alter table public.carbon_credit_transactions
  add constraint carbon_credit_transactions_retirement_fields check (
    transaction_type <> 'RETIREMENT'
    or (reporting_period_id is not null and beneficiary_org_unit_id is not null
        and target_scope is not null)) not valid,
  add constraint carbon_credit_transactions_transfer_fields check (
    transaction_type <> 'TRANSFER' or counterparty_name is not null) not valid;

-- One active internal carbon price per org unit. Skipped, with a notice, where stored data already has two.
do $$
begin
  if exists (select 1 from public.internal_carbon_prices where is_active
             group by org_unit_id having count(*) > 1) then
    raise notice 'internal_carbon_prices_one_active not created: an org unit has two active prices';
  else
    create unique index if not exists internal_carbon_prices_one_active
      on public.internal_carbon_prices (org_unit_id) where is_active;
  end if;
end $$;

-------------------------------------------------------------------------------------------------
-- 4. The chatbot's read-only role loses the carbon tables: no chatbot lookup reads them, and they hold
--    counterparty names and registry accounts (0046 granted them in passing).
--    Undo: grant select on the four tables to chat_reader and re-create the four policies from 0046.
-------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select from pg_roles where rolname = 'chat_reader') then
    revoke all on public.carbon_credits, public.carbon_credit_transactions,
                  public.internal_carbon_prices, public.capex_carbon_evaluations from chat_reader;
  end if;
end $$;
drop policy if exists chat_reader_select_cc on public.carbon_credits;
drop policy if exists chat_reader_select_cct on public.carbon_credit_transactions;
drop policy if exists chat_reader_select_icp on public.internal_carbon_prices;
drop policy if exists chat_reader_select_capex on public.capex_carbon_evaluations;

-------------------------------------------------------------------------------------------------
-- 5. Settings are for Admins. org_settings now also holds turnover, assurance details and the rate limits;
--    every signed-in user could read all of it through the database API. The application reads settings
--    on its own connection, so no screen depends on the old policy.
--    Undo: drop policy org_settings_select on public.org_settings;
--          create policy org_settings_select on public.org_settings for select to authenticated using (true);
-------------------------------------------------------------------------------------------------
drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings
  for select to authenticated using ((select public.is_admin()));

-------------------------------------------------------------------------------------------------
-- 6. Privileges nothing uses.
--    Browser roles held MAINTAIN (vacuum, reindex, lock) on tables, and three trigger functions were
--    executable by everyone. Neither is reachable through the database API today; both are removed so they
--    stay unreachable. The two older "prevent_*" functions get the fixed search path the others have.
--    Undo: grant maintain on all tables in schema public to authenticated; grant execute on the three
--          functions to public.
-------------------------------------------------------------------------------------------------
revoke maintain on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke maintain on tables from anon, authenticated;

revoke execute on function public.enforce_org_hierarchy() from public, anon, authenticated;
revoke execute on function public.guard_org_levels() from public, anon, authenticated;
revoke execute on function public.require_record_document() from public, anon, authenticated;
alter function public.prevent_audit_log_change() set search_path = '';
alter function public.prevent_carbon_transactions_change() set search_path = '';
