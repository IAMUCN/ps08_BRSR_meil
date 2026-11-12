import "server-only";
import { z } from "zod";
import { createMemo, loadFacts, loadTile } from "@/lib/dashboard/loaders";
import {
  arrange,
  mapLimit,
  narrowTiles,
  TILES,
  visibleTiles,
  type TileData,
} from "@/lib/dashboard/tiles";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

/** A period taking uploads now, with its dates (migration 0056: several may be open at once). */
export type OpenPeriod = {
  id: string;
  label: string;
  /** Due date; uploads after it are late. */
  dueOn: string;
  /** Last day any upload is taken. */
  lastUploadDay: string;
  /** Past the due date: uploads now are late. */
  late: boolean;
};

export const dashboardRouter = router({
  /**
   * The dashboard's tiles for the signed-in person (role-wise dashboard, Phase 2): only the tiles their
   * permissions earn, each limited to the units where a role of theirs holds the tile's permission, split into
   * the "Needs action" band (overdue, then returned, then pending) and the overview. One call, loaded a few at
   * a time so the connection pool is never swamped.
   */
  tiles: protectedProcedure
    .input(z.object({ periodId: z.uuid().optional(), orgUnitId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }): Promise<{ band: TileData[]; grid: TileData[] }> => {
      const sql = db();
      const viewer = {
        userId: ctx.session.userId,
        isAdmin: ctx.session.isAdmin,
        isOrgAdmin: ctx.session.isOrgAdmin,
      };
      const [facts, periodId] = await Promise.all([
        loadFacts(sql, viewer),
        resolvePeriod(input?.periodId),
      ]);
      // A unit chosen on the Control Tower narrows the tiles to it and what is beneath it, never beyond what
      // each tile's own permission already covers (an intersection in narrowTiles).
      const within = input?.orgUnitId
        ? (
            await sql<{ id: string }[]>`
              select descendant_id::text as id from public.org_unit_tree
              where ancestor_id = ${input.orgUnitId}`
          ).map((r) => r.id)
        : null;
      const visible = narrowTiles(visibleTiles(TILES, facts), within);
      const memo = createMemo();
      const data = await mapLimit(visible, 3, (tile) =>
        loadTile(tile, { sql, viewer, scope: tile.scope, periodId, memo }),
      );
      return arrange(
        data.filter((d) => !d.hidden),
        TILES,
      );
    }),

  /** The periods that take uploads now, newest first (readable by every signed-in user). */
  openPeriods: protectedProcedure.query(async (): Promise<OpenPeriod[]> => {
    const rows = await db()<
      { id: string; label: string; due_on: string; last_upload_day: string; late: boolean }[]
    >`
      select rp.id, rp.label,
             coalesce(rp.submission_closes_on, rp.end_date)::text as due_on,
             coalesce(rp.late_uploads_until, rp.submission_closes_on, rp.end_date)::text as last_upload_day,
             public.reporting_period_late(rp) as late
      from public.reporting_periods rp
      where rp.status = 'open' and not public.reporting_period_locked(rp)
      order by rp.start_date desc`;
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      dueOn: r.due_on,
      lastUploadDay: r.last_upload_day,
      late: r.late,
    }));
  }),
});
