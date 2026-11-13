-- Migration 0088: BU Manager role (owner's request, 2026-11-13).
--
-- A BU Manager administers one business unit and everything beneath it (its projects): people, hierarchy,
-- queues, figures, reports and uploads, exactly what an Administrator may do for the unit it is assigned at.
-- The difference is the scope: this role can only be assigned at a business unit (a level under a
-- subsidiary), never at the group, a subsidiary or a project. The app treats it as an administrator role
-- for every scope check (lib/auth/redirects.ts, lib/auth/session.ts).
--
-- Undo: delete the trigger and function, then the role (only while nobody holds it).

insert into public.roles (code, name, description, is_system_role)
values ('bu_manager', 'BU Manager',
        'Manages one business unit and the projects beneath it: people, hierarchy, queues, figures, reports and uploads. Assigned at a business unit only.',
        true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'org.manage', 'org.bulk_import', 'user.manage', 'user.bulk_import',
  'monitoring.view', 'validation.review', 'approval.decide', 'report.generate',
  'document.upload', 'record.verify', 'chat.use')
where r.code = 'bu_manager'
on conflict do nothing;

create or replace function public.enforce_bu_manager_level() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit_level text;
  is_bu_manager boolean;
begin
  select exists (select 1 from public.roles where id = new.role_id and code = 'bu_manager') into is_bu_manager;
  if not is_bu_manager then
    return new;
  end if;
  select unit_type into unit_level from public.org_units where id = new.org_unit_id;
  if unit_level is distinct from 'business_unit' then
    raise exception 'The BU Manager role can only be assigned at a business unit.'
      using errcode = '23514', constraint = 'bu_manager_at_business_unit';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_bu_manager_level() from public, anon, authenticated;

drop trigger if exists trg_user_org_assignments_bu_manager_level on public.user_org_assignments;
create trigger trg_user_org_assignments_bu_manager_level
  before insert or update of role_id, org_unit_id on public.user_org_assignments
  for each row execute function public.enforce_bu_manager_level();
