-- Migration 0049: a role can upload on behalf of another role (owner's request, 2026-10-12;
-- .grill/employee-uploads-decisions.md, D40).
--
-- A project's employee files the bills its Project Manager is responsible for. Which activities a role may
-- upload is decided by the category's owning role (esg_categories.owning_role_id, one role per category), so a
-- new role owns nothing and is offered nothing. This column lets a role be given another role's categories
-- for uploading, without taking them away from that role. Nothing else follows from it: permissions,
-- reminders and approval stay with each role as before.
--
-- Additive and safe to run twice. Undo: alter table public.roles drop column uploads_for_role_id;
alter table public.roles
  add column if not exists uploads_for_role_id uuid references public.roles (id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'roles_uploads_for_not_self') then
    alter table public.roles
      add constraint roles_uploads_for_not_self check (uploads_for_role_id is distinct from id);
  end if;
end $$;

comment on column public.roles.uploads_for_role_id is
  'People holding this role may upload into the categories owned by that role, at the org units they are assigned to.';
