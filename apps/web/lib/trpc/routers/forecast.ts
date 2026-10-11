import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEmissionsForecast } from "@/lib/forecast/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const forecastRouter = router({
  /**
   * Retrieves accessible organization units for the forecast selectors.
   */
  options: protectedProcedure.query(async ({ ctx }) => {
    const sql = db();

    let orgUnits: Array<{ id: string; name: string; code: string; depth: number }> = [];

    if (ctx.session.isAdmin) {
      orgUnits = await sql<{ id: string; name: string; code: string; depth: number }[]>`
        with recursive tree as (
          select id, name, code, 0 as depth, array[name::text] as path
          from public.org_units where parent_id is null and deleted_at is null
          union all
          select o.id, o.name, o.code, t.depth + 1, t.path || o.name::text
          from public.org_units o join tree t on o.parent_id = t.id where o.deleted_at is null
        )
        select id, name, code, depth from tree order by path`;
    } else {
      orgUnits = await sql<{ id: string; name: string; code: string; depth: number }[]>`
        with recursive assigned as (
          select o.id, o.name, o.code, 0 as depth, array[o.name::text] as path
          from public.org_units o
          join public.user_org_assignments a on a.org_unit_id = o.id
          where a.user_id = ${ctx.session.userId} and a.revoked_at is null and o.deleted_at is null
          union all
          select child.id, child.name, child.code, parent.depth + 1, parent.path || child.name::text
          from public.org_units child
          join assigned parent on child.parent_id = parent.id
          where child.deleted_at is null
        )
        select distinct id, name, code, depth from assigned order by depth, name`;
    }

    return {
      orgUnits: orgUnits.map((u) => ({ id: u.id, name: u.name, code: u.code, depth: u.depth })),
      defaultOrgUnitId: orgUnits[0]?.id ?? null,
    };
  }),

  /**
   * Loads historical data, backtest metrics, and forecast for an authorized organization unit.
   */
  getForecast: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        scopeTarget: z.enum(["SCOPE_1", "SCOPE_2", "SCOPE_3", "TOTAL"]).optional(),
        horizon: z.number().int().min(1).max(4).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      // Authorization check for non-admins
      if (!ctx.session.isAdmin) {
        const [allowed] = await sql<{ ok: boolean }[]>`
          select exists (
            select 1 from public.org_unit_tree t
            join public.user_org_assignments a on a.org_unit_id = t.ancestor_id
            where a.user_id = ${ctx.session.userId}
              and a.revoked_at is null
              and t.descendant_id = ${input.orgUnitId}
          ) as ok`;

        if (!allowed?.ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view emissions forecast data for this organization unit.",
          });
        }
      }

      return getEmissionsForecast(sql, {
        orgUnitId: input.orgUnitId,
        scopeTarget: input.scopeTarget,
        horizon: input.horizon,
      });
    }),
});
