-- Identity, access and organization tables (05_BACKEND_SCHEMA.md §3, §4).

-- §3.2
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_system_role boolean not null default false,
  created_at timestamptz not null default now()
);

-- §3.3
create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text
);

-- §3.4
create table public.role_permissions (
  role_id uuid not null references public.roles (id),
  permission_id uuid not null references public.permissions (id),
  primary key (role_id, permission_id)
);

-- §4.1 — single self-referencing, configurable-depth hierarchy
create table public.org_units (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.org_units (id),
  unit_type public.org_unit_type not null,
  name text not null,
  code text unique,
  status public.org_unit_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint org_units_root_is_group check (parent_id is not null or unit_type = 'group')
);

create index org_units_parent_id_idx on public.org_units (parent_id);
create index org_units_unit_type_idx on public.org_units (unit_type);
create index org_units_status_idx on public.org_units (status);

-- §3.1 — application profile, 1:1 with auth.users
create table public.users (
  id uuid primary key references auth.users (id),
  display_name text not null,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- §3.5 — authorization root: who can do what, where
create table public.user_org_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  org_unit_id uuid not null references public.org_units (id),
  role_id uuid not null references public.roles (id),
  assigned_by uuid not null references public.users (id),
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index user_org_assignments_active_unique
  on public.user_org_assignments (user_id, org_unit_id, role_id)
  where revoked_at is null;
create index user_org_assignments_user_id_idx on public.user_org_assignments (user_id);
create index user_org_assignments_org_unit_id_idx on public.user_org_assignments (org_unit_id);
create index user_org_assignments_active_user_org_idx
  on public.user_org_assignments (user_id, org_unit_id)
  where revoked_at is null;
