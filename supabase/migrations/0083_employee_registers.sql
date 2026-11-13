-- Migration 0070: the employee register (.grill/role-dashboard-decisions.md, "Employee register: decided").
-- HR uploads an Excel register of the workforce; the server keeps ONLY the totals computed from it (no
-- person-level rows in the database) and the original file as private evidence in its own bucket. Written on a
-- machine with no database, so it has NOT been run: see ROLE_DASHBOARD_VERIFY.md.
--
-- Adds, and only adds: two permissions, one bucket, one table. Undo: drop the table, delete the bucket's
-- objects and row, delete the two permissions.

-------------------------------------------------------------------------------------------------
-- 1. Permissions. manage = upload and confirm a register; view = open the uploaded file and see which people
--    in it have an account. Held by the Super Admin and HR (owner's decision, 2026-11-12).
-------------------------------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('employee_register.manage', 'Upload an employee register and confirm the totals computed from it.'),
  ('employee_register.view',
   'Open an uploaded employee register and see which of its people have an EmeilSG account.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('employee_register.manage', 'employee_register.view')
where r.code in ('admin', 'hr')
on conflict do nothing;

-------------------------------------------------------------------------------------------------
-- 2. A private bucket for the register files: Excel or CSV, 10 MB, read only through the server.
-------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('registers', 'registers', false, 10485760, array[
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv'])
on conflict (id) do nothing;

-------------------------------------------------------------------------------------------------
-- 3. The register: one live row per org unit and financial year, holding the totals and nothing about any
--    person. Server-only, like org_levels: RLS on, no browser grants.
-------------------------------------------------------------------------------------------------
create table public.employee_registers (
  id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null references public.org_units (id),
  -- The year it starts in: 2025 = April 2025 to March 2026.
  financial_year integer not null check (financial_year between 2000 and 2100),
  storage_path text not null,
  file_name text not null check (length(file_name) between 1 and 255),
  file_hash text not null check (length(file_hash) = 64),
  file_size_bytes integer not null check (file_size_bytes > 0),
  -- lib/register/register.ts RegisterTotals: counts and sums only.
  totals jsonb not null,
  -- pending_verification: computed, waiting for HR to check the totals. verified: HR confirmed. approved:
  -- an approver accepted it (only approved registers are reported). returned: sent back with a note.
  -- superseded: replaced by a newer upload.
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'verified', 'approved', 'returned', 'superseded')),
  uploaded_by uuid not null references public.users (id),
  uploaded_at timestamptz not null default now(),
  verified_by uuid references public.users (id),
  verified_at timestamptz,
  decided_by uuid references public.users (id),
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  -- Whoever verifies is not the person who approves (the same rule as every record).
  constraint employee_registers_separate_approver check (decided_by is null or decided_by <> verified_by)
);

-- One live register per unit and year; a returned or superseded one makes room for the next upload.
create unique index employee_registers_one_live
  on public.employee_registers (org_unit_id, financial_year)
  where status in ('pending_verification', 'verified', 'approved');

create index employee_registers_by_unit on public.employee_registers (org_unit_id, financial_year);

alter table public.employee_registers enable row level security;
revoke all on public.employee_registers from anon, authenticated;

comment on table public.employee_registers is
  'Totals computed from an uploaded employee register; the file is in the registers bucket. No person-level data.';
