-- Deactivated users lose data access immediately, even with an unexpired session token
-- (supabase/SCHEMA_DEVIATIONS.md D9; .grill/phase-3-auth-decisions.md).
-- Both helpers now ignore assignments belonging to users with is_active = false.

create or replace function public.is_admin() returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_org_assignments uoa
    join public.roles r on r.id = uoa.role_id
    join public.users u on u.id = uoa.user_id
    where uoa.user_id = (select auth.uid())
      and uoa.revoked_at is null
      and u.is_active
      and r.code = 'admin'
  );
$$;

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
    select child.id
    from public.org_units child
    join scoped s on child.parent_id = s.id
  )
  select id from scoped;
$$;
