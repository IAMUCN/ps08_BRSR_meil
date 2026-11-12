import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getRecommendationsReport,
  generateAndSaveRecommendations,
  updateRecommendationStatus,
} from "@/lib/recommendations/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

const weightsSchema = z.object({
  impact: z.number().min(0).max(1),
  urgency: z.number().min(0).max(1),
  feasibility: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});

export const recommendationsRouter = router({
  /**
   * Retrieves or automatically calculates transparent ranked recommendations.
   */
  getReport: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        weights: weightsSchema.partial().optional(),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      return await getRecommendationsReport(sql, input);
    }),

  /**
   * Generates a fresh set of recommendations using custom or default calibration weights.
   */
  generate: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        weights: weightsSchema.partial().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await generateAndSaveRecommendations(sql, input);
    }),

  /**
   * Updates recommendation lifecycle workflow status and assignee.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        recommendationId: z.string(),
        status: z.enum(["open", "in_review", "approved", "implemented", "dismissed"]),
        assignedTo: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await updateRecommendationStatus(sql, input);
    }),
});
