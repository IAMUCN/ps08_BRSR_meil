-- Migration 0050: Super Admins and scoped Administrators (owner's decision, 2026-10-13;
-- .grill/scoped-admin-onboarding-decisions.md, D41).
--
-- Until now every holder of the `admin` role could do everything, and nothing limited how many there were.
--   * The `admin` role is the Super Admin: group-wide configuration and every org unit. At most
--     `super_admin_limit` people (2) may hold it at once; the database refuses one more, whoever asks.
--   * A new role, Administrator (`org_admin`), administers the org unit it is assigned at and everything
--     beneath it: people, the hierarchy, queues, figures, reports, uploads. It holds no configuration
--     permission (factors, BRSR mapping, roles, periods, settings, the audit trail).
--
-- `is_admin()` and every policy that calls it are unchanged: they keep meaning the Super Admin, so nothing
-- opens to an Administrator that this migration and the procedures do not open on purpose.
--
-- Refuses to run while more people hold the Super Admin role than the limit allows: move them first.
--
-- Undo: drop the two triggers and the function, delete the `org_admin` role with its grants (only while
-- nobody holds it), delete the setting, and set the `admin` role's name back to 'Admin'.

-------------------------------------------------------------------------------------------------
-- 1. The roles.
-------------------------------------------------------------------------------------------------
update public.roles
set name = 'Super Admin',
    description = 'Full system control: group-wide configuration and every org unit.'
where code = 'admin';

insert into public.roles (code, name, description, is_system_role)
values ('org_admin', 'Administrator',
        'Administers the org unit it is assigned at and everything beneath it: people, hierarchy, queues, figures, reports and uploads. No group-wide configuration.',
        true)
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'org.manage', 'org.bulk_import', 'user.manage', 'user.bulk_import',
  'monitoring.view', 'validation.review', 'approval.decide', 'report.generate',
  'document.upload', 'record.verify', 'chat.use')
where r.code = 'org_admin'
on conflict do nothing;

-------------------------------------------------------------------------------------------------
-- 2. The limit, as a setting.
-------------------------------------------------------------------------------------------------
insert into public.org_settings (key, value)
values ('super_admin_limit', '2'::jsonb)
on conflict (key) do nothing;

-------------------------------------------------------------------------------------------------
-- 3. The guard. People who count: an unrevoked `admin` assignment on an active account that is not deleted.
--    A transaction-scoped lock makes two grants at the same moment wait for each other.
-------------------------------------------------------------------------------------------------
create or replace function public.enforce_super_admin_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed int;
  holders int;
begin
  perform pg_advisory_xact_lock(hashtext('super_admin_limit'));
  select coalesce((select (value #>> '{}')::int from public.org_settings where key = 'super_admin_limit'), 2)
    into allowed;
  select count(distinct uoa.user_id) into holders
  from public.user_org_assignments uoa
  join public.roles r on r.id = uoa.role_id and r.code = 'admin'
  join public.users u on u.id = uoa.user_id
  where uoa.revoked_at is null and u.is_active and u.deleted_at is null;
  if holders > allowed then
    raise exception 'At most % Super Admins are allowed.', allowed
      using errcode = '23514', constraint = 'super_admin_limit';
  end if;
  return null;
end;
$$;

revoke all on function public.enforce_super_admin_limit() from public, anon, authenticated;

create trigger trg_user_org_assignments_super_admin_limit
  after insert or update of role_id, revoked_at, user_id on public.user_org_assignments
  for each row execute function public.enforce_super_admin_limit();

-- Reactivating (or restoring) an account that still holds the role counts too.
create trigger trg_users_super_admin_limit
  after update of is_active, deleted_at on public.users
  for each row execute function public.enforce_super_admin_limit();

-------------------------------------------------------------------------------------------------
-- 4. Refuse to leave the database already over the limit.
-------------------------------------------------------------------------------------------------
do $$
declare
  holders int;
begin
  select count(distinct uoa.user_id) into holders
  from public.user_org_assignments uoa
  join public.roles r on r.id = uoa.role_id and r.code = 'admin'
  join public.users u on u.id = uoa.user_id
  where uoa.revoked_at is null and u.is_active and u.deleted_at is null;
  if holders > 2 then
    raise exception
      '% people hold the Super Admin role and at most 2 are allowed. Revoke or move the others before running this migration.',
      holders;
  end if;
end;
$$;
