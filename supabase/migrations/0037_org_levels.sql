-- Audit fix P2 (AUDIT_FIXES.md; .grill/audit-p2-decisions.md; SCHEMA_DEVIATIONS.md D29): PRD §11 says adding a
-- hierarchy level is configuration. The levels were a database enum plus a constant in the app, so a new
-- level needed a migration and a release. They become rows: `org_levels`, in order; `org_units.unit_type`
-- references a level's code. The seven existing levels are seeded with the same codes, so no org unit changes.

create table public.org_levels (
  id uuid not null default gen_random_uuid() unique,
  code text primary key constraint org_levels_code_format check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null constraint org_levels_label_present check (btrim(label) <> ''),
  -- Position in the hierarchy: a child's level must come after its parent's. Numeric, so a level can be
  -- placed between two others without renumbering the rest.
  sort_order numeric not null unique
);

insert into public.org_levels (code, label, sort_order) values
  ('group', 'Group', 10),
  ('subsidiary', 'Subsidiary / Entity', 20),
  ('business_unit', 'Business Unit / Division', 30),
  ('region', 'Region', 40),
  ('project', 'Project', 50),
  ('site', 'Site', 60),
  ('department', 'Department', 70);

-- Server-only, like the other tables the browser has no business reading directly.
alter table public.org_levels enable row level security;
revoke all on public.org_levels from anon, authenticated;

-- A level's code and position never change once it exists (org units and their order depend on both); only
-- its label does. `group` is the root level: it stays, and nothing sorts before it.
create or replace function public.guard_org_levels() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.code = 'group' then
      raise exception 'The root level cannot be removed.' using errcode = '23514';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.code <> old.code or new.sort_order <> old.sort_order) then
    raise exception 'A level''s code and position cannot change; only its label can.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT'
     and new.sort_order <= (select sort_order from public.org_levels where code = 'group') then
    raise exception 'A level cannot come before the root level.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_guard_org_levels
  before insert or update or delete on public.org_levels
  for each row execute function public.guard_org_levels();

-- org_units.unit_type: enum → a level's code.
drop trigger trg_enforce_org_hierarchy on public.org_units;
alter table public.org_units drop constraint org_units_root_is_group;
alter table public.org_units alter column unit_type type text using unit_type::text;
alter table public.org_units
  add constraint org_units_unit_type_fkey foreign key (unit_type) references public.org_levels (code),
  add constraint org_units_root_is_group check (parent_id is not null or unit_type = 'group');

-- The hierarchy rules of 0034, now reading each level's position instead of the enum's declared order.
create or replace function public.enforce_org_hierarchy() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  own_order numeric;
  parent_level text;
  parent_order numeric;
begin
  select sort_order into own_order from public.org_levels where code = new.unit_type;
  if new.parent_id is not null then
    if new.unit_type = 'group' then
      raise exception 'A group can only be the root of the organization.' using errcode = '23514';
    end if;
    select l.code, l.sort_order into parent_level, parent_order
    from public.org_units p join public.org_levels l on l.code = p.unit_type
    where p.id = new.parent_id;
    if own_order <= parent_order then
      raise exception 'A % cannot sit under a %: a child''s level must come after its parent''s.',
        new.unit_type, parent_level using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.unit_type is distinct from old.unit_type and exists (
    select 1 from public.org_units child join public.org_levels l on l.code = child.unit_type
    where child.parent_id = new.id and l.sort_order <= own_order
  ) then
    raise exception 'A % cannot have a child at the same or an earlier level.', new.unit_type
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_org_hierarchy
  before insert or update of parent_id, unit_type on public.org_units
  for each row execute function public.enforce_org_hierarchy();

drop type public.org_unit_type;
