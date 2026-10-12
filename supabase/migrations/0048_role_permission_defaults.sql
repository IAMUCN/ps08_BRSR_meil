-- Migration 0048: default permissions per role, reviewed against how the roles work in a company that files
-- a BRSR (owner's request, 2026-10-12; .grill/role-permissions-decisions.md, D39).
--
-- No permission is added or removed from the catalogue: only which seeded role holds which of the existing
-- ones. Custom roles and the Admin role are untouched. Safe to run twice.
--
-- Undo: delete the two grants below.

-------------------------------------------------------------------------------------------------
-- Corporate ESG / Sustainability: the team that checks what the sites submit and prepares the report.
--    It could already approve and monitor; it could not review a flagged validation result or generate a
--    report, the two steps between those. Both procedures are limited to the person's own org scope.
-------------------------------------------------------------------------------------------------
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('validation.review', 'report.generate')
where r.code = 'corporate_esg'
on conflict do nothing;
