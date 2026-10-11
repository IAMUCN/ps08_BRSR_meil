// Org scope for procedures that read through lib/db.ts, which bypasses RLS: there the procedure's own check
// is the only boundary (SECURITY_AUDIT_2026-10-12.md). An Admin reaches every org unit; anyone else their
// assigned units and everything beneath them (org_unit_tree, so shared units count under every parent).
// No "server-only" import and the connection is a parameter, so the rule is unit-tested with a stand-in.
import { TRPCError } from "@trpc/server";
import type postgres from "postgres";

type Sql = postgres.Sql | postgres.TransactionSql;
type Caller = { userId: string; isAdmin: boolean };

/** The org units the caller may read: `null` means all of them (Admin). */
export async function scopedOrgUnitIds(sql: Sql, caller: Caller): Promise<string[] | null> {
  if (caller.isAdmin) return null;
  const rows = await sql<{ id: string }[]>`
    select distinct t.descendant_id as id
    from public.user_org_assignments uoa
    join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
    where uoa.user_id = ${caller.userId} and uoa.revoked_at is null`;
  return rows.map((r) => r.id);
}

export async function inOrgScope(sql: Sql, caller: Caller, orgUnitId: string): Promise<boolean> {
  const ids = await scopedOrgUnitIds(sql, caller);
  return ids === null || ids.includes(orgUnitId);
}

/** Refuses an org unit outside the caller's scope. Out of scope and missing read the same (§4.4). */
export async function assertOrgScope(sql: Sql, caller: Caller, orgUnitId: string): Promise<void> {
  if (!(await inOrgScope(sql, caller, orgUnitId))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That part of the organisation isn't in your scope.",
    });
  }
}
