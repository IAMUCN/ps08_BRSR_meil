import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getEsgFeaturesForUnit } from "@/lib/features/service";
import { compareNormalizedEmissions } from "@/lib/features/engine";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const featuresRouter = router({
  /**
   * Retrieves verified ESG feature vector for a specified organization unit and reporting period.
   * Guarantees calculation using verified data only, with data quality audit and size-normalized indicators.
   */
  get: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      // Check caller's authorization scope
      if (!ctx.session.isAdmin) {
        const [isAllowed] = await sql<{ allowed: boolean }[]>`
          with recursive allowed_units as (
            select o.id from public.org_units o
            join public.user_org_assignments a on a.org_unit_id = o.id
            where a.user_id = ${ctx.session.userId} and a.revoked_at is null
            union
            select child.id from public.org_unit_links l
            join allowed_units au on au.id = l.parent_id
            join public.org_units child on child.id = l.child_id
          )
          select exists(select 1 from allowed_units where id = ${input.orgUnitId}) as allowed
        `;
        if (!isAllowed?.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not authorized to view features for this organization unit.",
          });
        }
      }

      try {
        return await getEsgFeaturesForUnit(sql, {
          orgUnitId: input.orgUnitId,
          reportingPeriodId: input.reportingPeriodId,
        });
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "Failed to calculate ESG features.",
        });
      }
    }),

  /**
   * Compares two entities or reporting periods with size and activity normalization.
   * Enforces the rule: never compare absolute emissions without considering size/activity.
   */
  compare: protectedProcedure
    .input(
      z.object({
        entityA: z.object({
          orgUnitId: z.string().uuid(),
          reportingPeriodId: z.string().uuid(),
        }),
        entityB: z.object({
          orgUnitId: z.string().uuid(),
          reportingPeriodId: z.string().uuid(),
        }),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();

      const [featA, featB] = await Promise.all([
        getEsgFeaturesForUnit(sql, {
          orgUnitId: input.entityA.orgUnitId,
          reportingPeriodId: input.entityA.reportingPeriodId,
        }),
        getEsgFeaturesForUnit(sql, {
          orgUnitId: input.entityB.orgUnitId,
          reportingPeriodId: input.entityB.reportingPeriodId,
        }),
      ]);

      const comparison = compareNormalizedEmissions(featA, featB);

      return {
        entityA: featA,
        entityB: featB,
        comparison,
      };
    }),
});
