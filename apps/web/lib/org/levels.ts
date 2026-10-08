import "server-only";
import type { db, Tx } from "@/lib/db";
import type { OrgLevel } from "./rules";

/** The configured hierarchy levels, in order (migration 0037). */
export async function loadLevels(sql: Tx | ReturnType<typeof db>): Promise<OrgLevel[]> {
  return sql<OrgLevel[]>`
    select code, label, sort_order::float as "order" from public.org_levels order by sort_order`;
}
