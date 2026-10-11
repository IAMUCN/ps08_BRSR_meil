import "server-only";
import type { db, Tx } from "@/lib/db";
import type { OrgNode } from "@/lib/org/rules";

export type OrgNodeRow = OrgNode & { alsoUnder: string[]; name: string; code: string | null };

/**
 * Every org unit with both kinds of parent: the main one and the units it also sits under (migration 0044).
 * One query for every caller that reasons about the tree, so none of them forgets the extra parents.
 */
export async function loadOrgNodes(sql: Tx | ReturnType<typeof db>): Promise<OrgNodeRow[]> {
  const rows = await sql<
    {
      id: string;
      parent_id: string | null;
      also_under: string[];
      unit_type: string;
      status: string;
      name: string;
      code: string | null;
    }[]
  >`
    select o.id, o.parent_id, o.unit_type, o.status, o.name, o.code,
           array(select x.parent_id::text from public.org_unit_parents x
                 where x.org_unit_id = o.id order by x.created_at) as also_under
    from public.org_units o where o.deleted_at is null order by o.name`;
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    alsoUnder: r.also_under,
    unitType: r.unit_type,
    status: r.status as OrgNode["status"],
    name: r.name,
    code: r.code,
  }));
}
