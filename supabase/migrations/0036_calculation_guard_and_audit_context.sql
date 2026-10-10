-- Audit fixes P2 (AUDIT_FIXES.md; .grill/audit-p2-decisions.md; SCHEMA_DEVIATIONS.md D28).

-- 1. Calculations are append-only at the database layer, as the audit log has been since 0027. A report's
--    snapshot points at the calculation row each value used, and the audit trail says a calculation
--    happened — neither is true any more if the row can be removed. The only change the engine ever makes to
--    a stored calculation is retiring it (`is_current` true → false) when a newer one replaces it.
create or replace function public.prevent_calculation_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'calculations'
     and (to_jsonb(new) - 'is_current') = (to_jsonb(old) - 'is_current') then
    return new;
  end if;
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;
revoke execute on function public.prevent_calculation_change() from public, anon, authenticated;

create trigger trg_calculations_append_only
  before update or delete on public.calculations
  for each row execute function public.prevent_calculation_change();
create trigger trg_calculations_no_truncate
  before truncate on public.calculations
  for each statement execute function public.prevent_calculation_change();
create trigger trg_calculation_inputs_append_only
  before update or delete on public.calculation_inputs
  for each row execute function public.prevent_calculation_change();
create trigger trg_calculation_inputs_no_truncate
  before truncate on public.calculation_inputs
  for each statement execute function public.prevent_calculation_change();

-- 2. Where an audited action came from: the client address, browser and sign-in session of the person who
--    acted. Null for system events and for entries written before this migration.
alter table public.audit_logs
  add column ip_address text,
  add column user_agent text,
  add column session_id text;
