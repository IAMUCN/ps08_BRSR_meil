import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  getAiSecurityPolicy,
  listAiProvidersFromDb,
  toggleAiKillSwitch,
} from "@/lib/ai-gateway/service";
import {
  dataClassificationEnum,
  providerApprovalStatusEnum,
  providerIdEnum,
} from "@/lib/ai-gateway/types";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const aiGatewayRouter = router({
  /**
   * Retrieves active AI security policy including the Emergency Kill Switch state.
   */
  getSecurityPolicy: protectedProcedure.query(async () => {
    const sql = db();
    return await getAiSecurityPolicy(sql);
  }),

  /**
   * Toggles the emergency AI kill switch on or off.
   */
  toggleKillSwitch: protectedProcedure
    .input(
      z.object({
        enabled: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const sql = db();
      return await toggleAiKillSwitch(sql, {
        enabled: input.enabled,
        reason: input.reason,
        userId: ctx.session?.userId,
      });
    }),

  /**
   * Lists all registered AI providers, approval statuses, and allowed classifications.
   */
  listProviders: protectedProcedure.query(async () => {
    const sql = db();
    return await listAiProvidersFromDb(sql);
  }),

  /**
   * Updates provider approval status or granted data classifications.
   */
  updateProviderApproval: protectedProcedure
    .input(
      z.object({
        providerId: providerIdEnum,
        status: providerApprovalStatusEnum,
        approvedClassifications: z.array(dataClassificationEnum).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const sql = db();
      await sql`
        update public.ai_providers
        set
          approval_status = ${input.status},
          approved_classifications = coalesce(${input.approvedClassifications ? sql.json(input.approvedClassifications) : null}, approved_classifications),
          approved_by = ${ctx.session?.email || "admin"},
          approved_at = now(),
          updated_at = now()
        where id = ${input.providerId}
      `;
      return { success: true };
    }),

  /**
   * Retrieves recent AI-related audit events from the immutable audit_logs table.
   */
  getAiAuditLogs: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(30),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      const rows = await sql`
        select
          id,
          event_type,
          entity_type,
          entity_id,
          user_id,
          new_value,
          reason,
          created_at
        from public.audit_logs
        where entity_type in ('ai_gateway', 'ai_policy', 'ai_recommendation')
           or event_type like 'ai_%'
        order by created_at desc
        limit ${input.limit}
      `;
      return rows;
    }),
});
