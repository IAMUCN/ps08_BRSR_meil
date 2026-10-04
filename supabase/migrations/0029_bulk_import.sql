-- Bulk import (schema deviation D21; .grill/bulk-import-decisions.md): an Excel-sheet upload for
-- creating several employee accounts, or several org hierarchy nodes, in one submission.

-- An optional, org-unique employee reference shown alongside name/email wherever a user appears.
-- Nullable (existing accounts and the single-invite form don't set it); unique only when present.
alter table public.users add column employee_id text;
create unique index users_employee_id_unique on public.users (employee_id) where employee_id is not null;

insert into public.permissions (code, description) values
  ('user.bulk_import', 'Bulk-create user accounts and role/org assignments from an uploaded spreadsheet.'),
  ('org.bulk_import', 'Bulk-create organization hierarchy nodes from an uploaded spreadsheet.');

-- Admin: every permission (migration 0009's cross join already ran, so these two need their own insert).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'admin' and p.code in ('user.bulk_import', 'org.bulk_import');

-- HR gets employee bulk-import by default, per the request that started this feature. org.bulk_import
-- starts unassigned to any non-admin role — an Admin grants it to whichever role needs it from the
-- existing Roles & Permissions matrix (/admin/roles), same as any other permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'user.bulk_import'
where r.code = 'hr';
