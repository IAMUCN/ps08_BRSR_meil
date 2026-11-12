import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { askEsgAssistant } from "@/lib/rag/assistant";
import {
  buildCompleteRagIndex,
  indexBrsrIndicators,
  indexVerifiedRecords,
} from "@/lib/rag/indexer";
import { performHybridSearch } from "@/lib/rag/search";
import { providerIdEnum } from "@/lib/ai-gateway/types";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const ragRouter = router({
  /**
   * Ask the grounded ESG Assistant an inquiry using verified organizational evidence.
   */
  ask: protectedProcedure
    .input(
      z.object({
        query: z.string().min(2).max(1000),
        orgUnitId: z.string().uuid(),
        preferredProviderId: providerIdEnum.optional(),
        maxEvidenceChunks: z.number().min(1).max(10).default(5),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const sql = db();

      // Retrieve user's authorized organizational units from session scope
      const userAllowedOrgUnits: string[] = ctx.session?.assignments?.map(
        (a: any) => a.orgUnitId,
      ) || [input.orgUnitId];

      return await askEsgAssistant(sql, {
        query: input.query,
        orgUnitId: input.orgUnitId,
        authorizedOrgUnitIds: userAllowedOrgUnits,
        userId: ctx.session?.userId,
        preferredProviderId: input.preferredProviderId,
        maxEvidenceChunks: input.maxEvidenceChunks,
      });
    }),

  /**
   * Performs permission-aware hybrid search (vector cosine + lexical rank).
   */
  search: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(500),
        orgUnitId: z.string().uuid().optional(),
        limit: z.number().min(1).max(20).default(6),
        minSimilarity: z.number().min(0).max(1).default(0.15),
      }),
    )
    .query(async ({ input, ctx }) => {
      const sql = db();
      const userAllowedOrgUnits: string[] = input.orgUnitId
        ? [input.orgUnitId]
        : ctx.session?.assignments?.map((a: any) => a.orgUnitId) || [];

      return await performHybridSearch(sql, input.query, {
        authorizedOrgUnits: userAllowedOrgUnits.length > 0 ? userAllowedOrgUnits : undefined,
        limit: input.limit,
        minSimilarity: input.minSimilarity,
      });
    }),

  /**
   * Indexes verified records and BRSR standards into the vector knowledge base (Admin only).
   */
  reindex: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid().optional(),
        recordsLimit: z.number().min(10).max(2000).default(500),
        docsLimit: z.number().min(10).max(1500).default(500),
      }),
    )
    .mutation(async ({ input }) => {
      const sql = db();
      return await buildCompleteRagIndex(sql, input);
    }),

  /**
   * Retrieves knowledge chunk statistics.
   */
  getStats: protectedProcedure.query(async () => {
    const sql = db();
    const rows = await sql`
      select
        source_type,
        data_classification,
        count(*) as count
      from public.rag_knowledge_chunks
      group by source_type, data_classification
      order by count desc
    `;
    return rows;
  }),
});
