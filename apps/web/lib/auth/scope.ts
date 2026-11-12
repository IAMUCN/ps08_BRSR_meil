// Org scope for procedures that read through lib/db.ts, which bypasses RLS: there the procedure's own check
// is the only boundary (SECURITY_AUDIT_2026-10-12.md). An Admin reaches every org unit; anyone else their
// assigned units and everything beneath them (org_unit_tree, so shared units count under every parent).
//
// With a `permission`, only the assignments whose ROLE holds that permission count (role-wise dashboard,
// .grill/role-dashboard-decisions.md): a Project Manager at one project who is also Corporate ESG at a
// subsidiary may monitor the subsidiary, not the project. The session's permission list is a union over all
// assignments, so it cannot say where a permission is held; this can.
// No "server-only" import and the connection is a parameter, so the rule is unit-tested with a stand-in.
import { TRPCError } from "@trpc/server";
import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;
type Caller = { userId: string; isAdmin: boolean };

/** The org units the caller may read: `null` means all of them (Admin). */
export async function scopedOrgUnitIds(
  sql: Sql,
  caller: Caller,
  permission?: string,
): Promise<string[] | null> {
  if (caller.isAdmin) return null;
  const rows = permission
    ? await sql<{ id: string }[]>`
        select distinct t.descendant_id as id
        from public.user_org_assignments uoa
        join public.role_permissions rp on rp.role_id = uoa.role_id
        join public.permissions p on p.id = rp.permission_id and p.code = ${permission}
        join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
        where uoa.user_id = ${caller.userId} and uoa.revoked_at is null`
    : await sql<{ id: string }[]>`
        select distinct t.descendant_id as id
        from public.user_org_assignments uoa
        join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
        where uoa.user_id = ${caller.userId} and uoa.revoked_at is null`;
  return rows.map((r) => r.id);
}

export async function inOrgScope(
  sql: Sql,
  caller: Caller,
  orgUnitId: string,
  permission?: string,
): Promise<boolean> {
  const ids = await scopedOrgUnitIds(sql, caller, permission);
  return ids === null || ids.includes(orgUnitId);
}

/**
 * The org unit a page opens on when its address names none: the first group for a Super Admin, else the
 * highest unit the caller is assigned to (where they hold `permission`, if given). Null when there is
 * nothing to show.
 */
export async function defaultOrgUnitId(
  sql: Sql,
  caller: Caller,
  permission?: string,
): Promise<string | null> {
  if (caller.isAdmin) {
    const [root] = await sql<{ id: string }[]>`
      select id from public.org_units where parent_id is null and deleted_at is null
      order by created_at limit 1`;
    return root?.id ?? null;
  }
  const [unit] = permission
    ? await sql<{ id: string }[]>`
        select o.id
        from public.user_org_assignments uoa
        join public.role_permissions rp on rp.role_id = uoa.role_id
        join public.permissions p on p.id = rp.permission_id and p.code = ${permission}
        join public.org_units o on o.id = uoa.org_unit_id and o.deleted_at is null
        left join public.org_levels l on l.code = o.unit_type::text
        where uoa.user_id = ${caller.userId} and uoa.revoked_at is null
        order by l.sort_order nulls last, o.name limit 1`
    : await sql<{ id: string }[]>`
        select o.id
        from public.user_org_assignments uoa
        join public.org_units o on o.id = uoa.org_unit_id and o.deleted_at is null
        left join public.org_levels l on l.code = o.unit_type::text
        where uoa.user_id = ${caller.userId} and uoa.revoked_at is null
        order by l.sort_order nulls last, o.name limit 1`;
  return unit?.id ?? null;
}

/** Refuses an org unit outside the caller's scope. Out of scope and missing read the same (§4.4). */
export async function assertOrgScope(
  sql: Sql,
  caller: Caller,
  orgUnitId: string,
  permission?: string,
): Promise<void> {
  if (!(await inOrgScope(sql, caller, orgUnitId, permission))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That part of the organisation isn't in your scope.",
    });
  }
}
