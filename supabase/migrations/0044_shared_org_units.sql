-- An org unit under more than one parent (owner's request 2026-10-11, .grill/shared-org-units-decisions.md,
-- deviation D36): a project run by two subsidiaries belongs to both. `org_units.parent_id` stays the unit's
-- main parent (where it is managed: moves, deactivation, the place it was created); each row here is one
-- more parent it also sits under.
--
-- What "also under" means, by the owner's decision: the unit's figures count in full in every parent it
-- sits under, and once at any unit that is above several of them (the group). So two subsidiaries sharing a
-- project add up to more than their group — by exactly the shared project.
create table public.org_unit_parents (
  org_unit_id uuid not null references public.org_units (id) on delete cascade,
  parent_id uuid not null references public.org_units (id) on delete cascade,
  created_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  primary key (org_unit_id, parent_id)
);
create index org_unit_parents_parent_id_idx on public.org_unit_parents (parent_id);

-- Server-only, like the views that read it (D1): the browser has no use for it.
alter table public.org_unit_parents enable row level security;
revoke all on public.org_unit_parents from anon, authenticated;

-- Every parent-child link of either kind, for anything that walks the hierarchy.
create view public.org_unit_links with (security_invoker = true) as
select id as child_id, parent_id, true as is_main from public.org_units where parent_id is not null
union all
select org_unit_id, parent_id, false from public.org_unit_parents;
revoke all on public.org_unit_links from anon, authenticated;

-- The chatbot's read-only role reads org_unit_tree, which now reads these (0042).
grant select (org_unit_id, parent_id) on public.org_unit_parents to chat_reader;
grant select on public.org_unit_links to chat_reader;
create policy chat_reader_select on public.org_unit_parents for select to chat_reader using (true);

-- The top of the tree a unit hangs from, by its main parents.
create function public.org_unit_root(unit_id uuid) returns uuid
language sql
stable
set search_path = ''
as $$
  with recursive up as (
    select id, parent_id from public.org_units where id = unit_id
    union all
    select o.id, o.parent_id from public.org_units o join up on o.id = up.parent_id
  )
  select id from up where parent_id is null;
$$;
revoke execute on function public.org_unit_root(uuid) from public, anon, authenticated;

-- The rules of 0034 / 0037 for the extra parents: the parent's level comes strictly before the unit's (so
-- no path can return to where it started, whichever parents it follows), a root has no parents at all, an
-- extra parent is not the main one again, and both belong to the same group.
create function public.enforce_org_unit_parent() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  main_parent uuid;
  own_level text;
  own_order numeric;
  parent_level text;
  parent_order numeric;
begin
  select o.parent_id, l.code, l.sort_order into main_parent, own_level, own_order
  from public.org_units o join public.org_levels l on l.code = o.unit_type
  where o.id = new.org_unit_id;
  if main_parent is null then
    raise exception 'A group is the top of its organization and cannot sit under another unit.'
      using errcode = '23514';
  end if;
  if new.parent_id = main_parent then
    raise exception 'The unit already sits under that parent.' using errcode = '23514';
  end if;
  select l.code, l.sort_order into parent_level, parent_order
  from public.org_units p join public.org_levels l on l.code = p.unit_type
  where p.id = new.parent_id;
  if own_order <= parent_order then
    raise exception 'A % cannot sit under a %: a child''s level must come after its parent''s.',
      own_level, parent_level using errcode = '23514';
  end if;
  if public.org_unit_root(new.org_unit_id) is distinct from public.org_unit_root(new.parent_id) then
    raise exception 'A unit can only also sit under a unit of its own group.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_org_unit_parent() from public, anon, authenticated;

create trigger trg_enforce_org_unit_parent
  before insert or update on public.org_unit_parents
  for each row execute function public.enforce_org_unit_parent();

-- The main-parent trigger learns about the extra ones: a level change must keep the unit after every parent
-- and before every child, by either kind of link; and a unit cannot be moved under a parent it already sits
-- under as an extra one.
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
    if exists (select 1 from public.org_unit_parents x
               where x.org_unit_id = new.id and x.parent_id = new.parent_id) then
      raise exception 'The unit already sits under that parent.' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.unit_type is distinct from old.unit_type then
    if exists (
      select 1 from public.org_units child join public.org_levels l on l.code = child.unit_type
      where l.sort_order <= own_order
        and (child.parent_id = new.id
             or child.id in (select x.org_unit_id from public.org_unit_parents x where x.parent_id = new.id))
    ) then
      raise exception 'A % cannot have a child at the same or an earlier level.', new.unit_type
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.org_unit_parents x
      join public.org_units p on p.id = x.parent_id
      join public.org_levels l on l.code = p.unit_type
      where x.org_unit_id = new.id and l.sort_order >= own_order
    ) then
      raise exception 'A % cannot sit under a parent at the same or a later level.', new.unit_type
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Every org unit paired with itself and each unit beneath it, by either kind of link — once per pair, however
-- many paths lead there. That "once" is what counts a shared project once at the group, and the pair with
-- each parent is what counts it in full in both. `depth` is the shortest path.
create or replace view public.org_unit_tree with (security_invoker = true) as
with recursive tree as (
  select id as ancestor_id, id as descendant_id, 0 as depth from public.org_units
  union
  select t.ancestor_id, l.child_id, t.depth + 1
  from tree t join public.org_unit_links l on l.parent_id = t.descendant_id
)
select ancestor_id, descendant_id, min(depth) as depth from tree group by ancestor_id, descendant_id;

-- What a person may see follows the same links: someone assigned to either parent sees the shared unit.
create or replace function public.my_org_unit_ids() returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  with recursive scoped as (
    select ou.id
    from public.org_units ou
    join public.user_org_assignments uoa on uoa.org_unit_id = ou.id
    join public.users u on u.id = uoa.user_id
    where uoa.user_id = (select auth.uid())
      and uoa.revoked_at is null
      and u.is_active
    union
    select l.child_id
    from scoped s join public.org_unit_links l on l.parent_id = s.id
  )
  select id from scoped;
$$;
