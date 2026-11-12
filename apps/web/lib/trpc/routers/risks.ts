import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { evaluateAndSaveRisks, getRiskReport } from "@/lib/risks/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const risksRouter = router({
  /**
   * Retrieves or automatically runs the comprehensive ESG & BRSR risk assessment.
   */
  getReport: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      return await getRiskReport(sql, input);
    }),

  /**
   * Triggers a fresh evaluation across all 6 risk categories.
   */
  evaluate: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await evaluateAndSaveRisks(sql, input);
    }),
});
