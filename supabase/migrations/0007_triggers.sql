-- Triggers (05_BACKEND_SCHEMA.md §19).

-- §19.1 — updated_at maintenance, attached to every table that has an updated_at column.
-- (§19.1 also names reporting_periods and esg_metrics, which have no updated_at column in
-- §5.1/§6.2; no column was added — see supabase/SCHEMA_DEVIATIONS.md D7.)
create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_set_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.org_units
  for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.esg_records
  for each row execute function public.set_updated_at();
create trigger trg_set_updated_at before update on public.org_settings
  for each row execute function public.set_updated_at();

-- §19.3 — a factor version already used by a calculation can never change value or units;
-- corrections create a new version. DB-level so it holds even against an application bug.
create or replace function public.prevent_referenced_factor_version_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.calculations where conversion_factor_version_id = old.id
  ) then
    if new.value <> old.value
      or new.input_unit <> old.input_unit
      or new.output_unit <> old.output_unit then
      raise exception 'Cannot mutate a conversion_factor_version already referenced by a calculation — create a new version instead';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_guard_factor_version before update on public.conversion_factor_versions
  for each row execute function public.prevent_referenced_factor_version_mutation();
