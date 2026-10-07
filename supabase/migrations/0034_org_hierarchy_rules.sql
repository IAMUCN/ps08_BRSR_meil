-- Audit fix P1 (AUDIT_FIXES.md, SCHEMA_DEVIATIONS.md D27): the hierarchy rules lived only in the app
-- (`apps/web/lib/org/rules.ts`). A direct insert could put a project under a project, a subsidiary under a
-- project, or close a cycle. This trigger enforces the same rules for every writer:
--   * a child's level comes strictly after its parent's (levels may be skipped, never inverted) — the enum's
--     declared order is the level order, the same list as ORG_UNIT_TYPES;
--   * a group is only ever the root;
--   * a node is never its own ancestor — which the first rule already guarantees: every step up the tree is
--     a strictly earlier level, so no path can return to where it started;
--   * changing a node's level keeps it before all of its children.
create or replace function public.enforce_org_hierarchy() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_type public.org_unit_type;
begin
  if new.parent_id is not null then
    if new.unit_type = 'group' then
      raise exception 'A group can only be the root of the organization.' using errcode = '23514';
    end if;
    select unit_type into parent_type from public.org_units where id = new.parent_id;
    if new.unit_type <= parent_type then
      raise exception 'A % cannot sit under a %: a child''s level must come after its parent''s.',
        new.unit_type, parent_type using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.unit_type is distinct from old.unit_type and exists (
    select 1 from public.org_units child
    where child.parent_id = new.id and child.unit_type <= new.unit_type
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
