-- Migration 0064: conversion factors per financial year (owner's decision, 2026-11-11; D54,
-- .grill/factor-financial-years-decisions.md).
--
-- A factor version is for whole Indian financial years (1 April to 31 March): "effective for FY 2027-28 to
-- FY 2027-28" (one year by default). After its last year it is inherited by the following years until a newer
-- version starts; the calculation engine takes the latest version starting on or before a period and no longer
-- stops at effective_to. New versions start from the next financial year unless the chosen years have no value
-- yet (checked by the server, factors.ts).
--
-- Existing versions move to financial-year boundaries: the start to 1 April of the year it falls in (only PNG,
-- 1 Aug 2026, changes: it becomes 1 Apr 2026), the end to 31 March of the year it falls in, or of the start
-- year when there was none. Values and units are untouched, so no calculation changes (the used-version
-- guard of 0007 still holds); calculations already stored keep their numbers. financial_year, when empty,
-- becomes the first year.
--
-- Undo: drop trigger trg_factor_version_financial_years on public.conversion_factor_versions;
--       drop function public.factor_version_financial_years();
--       alter table public.conversion_factor_versions
--         drop constraint conversion_factor_versions_fy_start, drop constraint conversion_factor_versions_fy_end,
--         alter column effective_to drop not null;
--       (the old dates are in the audit entry written below)

create function pg_temp.fy_start(d date) returns int language sql immutable
  as $$ select extract(year from d)::int - case when extract(month from d) < 4 then 1 else 0 end $$;

-- Keep the old dates in the audit log before changing them.
insert into public.audit_logs (event_type, entity_type, entity_id, user_id, reason, old_value, new_value)
select 'factor.version_years_set', 'conversion_factor_version', v.id, null,
       'Migration 0064: factors are per financial year',
       jsonb_build_object('effective_from', v.effective_from, 'effective_to', v.effective_to,
                          'financial_year', v.financial_year),
       jsonb_build_object('effective_from', make_date(pg_temp.fy_start(v.effective_from), 4, 1),
                          'effective_to', make_date(pg_temp.fy_start(coalesce(v.effective_to, v.effective_from)) + 1, 3, 31))
from public.conversion_factor_versions v
where v.effective_from <> make_date(pg_temp.fy_start(v.effective_from), 4, 1)
   or v.effective_to is null
   or v.effective_to <> make_date(pg_temp.fy_start(v.effective_to) + 1, 3, 31);

update public.conversion_factor_versions v
set effective_from = make_date(pg_temp.fy_start(v.effective_from), 4, 1),
    effective_to = make_date(pg_temp.fy_start(coalesce(v.effective_to, v.effective_from)) + 1, 3, 31),
    financial_year = coalesce(v.financial_year,
      pg_temp.fy_start(v.effective_from)::text || '-' || lpad(((pg_temp.fy_start(v.effective_from) + 1) % 100)::text, 2, '0'));

-- Every writer, scripts and fixtures included, gets whole financial years: the start is moved to 1 April of
-- its year, the end to 31 March of its year (of the start year when none is given).
create or replace function public.factor_version_financial_years() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  first int := extract(year from new.effective_from)::int
               - case when extract(month from new.effective_from) < 4 then 1 else 0 end;
  last int := extract(year from coalesce(new.effective_to, new.effective_from))::int
              - case when extract(month from coalesce(new.effective_to, new.effective_from)) < 4 then 1 else 0 end;
begin
  new.effective_from := make_date(first, 4, 1);
  new.effective_to := make_date(greatest(first, last) + 1, 3, 31);
  return new;
end;
$$;
revoke execute on function public.factor_version_financial_years() from public, anon, authenticated;

create trigger trg_factor_version_financial_years
  before insert or update of effective_from, effective_to on public.conversion_factor_versions
  for each row execute function public.factor_version_financial_years();

alter table public.conversion_factor_versions
  alter column effective_to set not null,
  add constraint conversion_factor_versions_fy_start
    check (extract(month from effective_from) = 4 and extract(day from effective_from) = 1),
  add constraint conversion_factor_versions_fy_end
    check (extract(month from effective_to) = 3 and extract(day from effective_to) = 31);

comment on column public.conversion_factor_versions.effective_from is
  '1 April of the first financial year the version is for.';
comment on column public.conversion_factor_versions.effective_to is
  '31 March of its last financial year. Later years inherit the version until a newer one starts.';
