import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getDecarbonizationRoadmap,
  generateAndSaveRoadmap,
  updateSuggestionStatus,
  type SuggestionStatus,
} from "@/lib/suggestions/service";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const suggestionsRouter = router({
  /**
   * Retrieves or automatically generates the strategic decarbonization roadmap for an org unit and period.
   */
  getRoadmap: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      return await getDecarbonizationRoadmap(sql, input);
    }),

  /**
   * Generates a fresh roadmap with optional AI strategic rationale enrichment.
   */
  generate: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
        useAi: z.boolean().default(true),
        shadowPricePerTco2e: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await generateAndSaveRoadmap(sql, input);
    }),

  /**
   * Updates a suggestion's workflow status and tracking notes.
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        suggestionDbId: z.string().uuid(),
        status: z.enum(["OPEN", "IN_REVIEW", "ACCEPTED", "IMPLEMENTED", "DISMISSED"]),
        notes: z.string().max(1000).optional(),
        assignedTo: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await updateSuggestionStatus(sql, {
        suggestionDbId: input.suggestionDbId,
        status: input.status as SuggestionStatus,
        notes: input.notes,
        assignedTo: input.assignedTo,
      });
    }),
});
