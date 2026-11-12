import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  listDecisionRules,
  createDecisionRule,
  updateAndVersionDecisionRule,
  evaluateAndAuditDecisionRules,
} from "@/lib/rules/service";
import {
  ruleCategoryEnum,
  ruleOperatorEnum,
  ruleSeverityEnum,
  ruleStatusEnum,
} from "@/lib/rules/engine";
import { protectedProcedure, router } from "@/lib/trpc/init";

export const rulesRouter = router({
  /**
   * Lists all configurable decision rules.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          category: ruleCategoryEnum.optional(),
          status: ruleStatusEnum.optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const sql = db();
      return await listDecisionRules(sql, input ?? {});
    }),

  /**
   * Admin-only: Creates a brand new decision rule (Version 1).
   */
  create: protectedProcedure
    .input(
      z.object({
        code: z.string().min(3).max(64),
        name: z.string().min(3).max(128),
        description: z.string().min(5).max(500),
        category: ruleCategoryEnum,
        severity: ruleSeverityEnum,
        targetFeature: z.string().min(2).max(64),
        operator: ruleOperatorEnum,
        thresholdValue: z.number(),
        thresholdUpper: z.number().optional().nullable(),
        advisoryMessageTemplate: z.string().min(5).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can configure decision rules.",
        });
      }

      const sql = db();
      return await createDecisionRule(sql, {
        ...input,
        userId: ctx.session.userId,
      });
    }),

  /**
   * Admin-only: Updates a decision rule by creating a new version.
   * Marks previous version as SUPERSEDED to preserve audit history.
   */
  update: protectedProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        name: z.string().min(3).max(128).optional(),
        description: z.string().min(5).max(500).optional(),
        severity: ruleSeverityEnum.optional(),
        thresholdValue: z.number().optional(),
        thresholdUpper: z.number().optional().nullable(),
        advisoryMessageTemplate: z.string().min(5).max(500).optional(),
        status: ruleStatusEnum.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.session.isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only administrators can configure decision rules.",
        });
      }

      const sql = db();
      return await updateAndVersionDecisionRule(sql, input.ruleId, {
        ...input,
        userId: ctx.session.userId,
      });
    }),

  /**
   * Evaluates all active rules against an org unit's verified feature vector.
   * Records append-only audit entries to decision_rule_evaluations.
   */
  evaluate: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sql = db();

      // Check access scope
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
            message: "You are not authorized to evaluate rules for this unit.",
          });
        }
      }

      return await evaluateAndAuditDecisionRules(sql, {
        orgUnitId: input.orgUnitId,
        reportingPeriodId: input.reportingPeriodId,
      });
    }),

  /**
   * Queries historical evaluation audit receipts.
   */
  auditHistory: protectedProcedure
    .input(
      z.object({
        orgUnitId: z.string().uuid(),
        reportingPeriodId: z.string().uuid().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ input }) => {
      const sql = db();
      const rows = await sql<
        {
          id: string;
          rule_code: string;
          rule_version: number;
          triggered: boolean;
          observed_feature_value: number | null;
          threshold_value: number;
          severity: string;
          advisory_message: string;
          contributing_record_ids: string[];
          evaluated_at: string;
        }[]
      >`
        select
          id, rule_code, rule_version, triggered, observed_feature_value,
          threshold_value, severity, advisory_message, contributing_record_ids,
          evaluated_at::text as evaluated_at
        from public.decision_rule_evaluations
        where org_unit_id = ${input.orgUnitId}
          and (${input.reportingPeriodId ?? null}::uuid is null or reporting_period_id = ${input.reportingPeriodId ?? null})
        order by evaluated_at desc
        limit ${input.limit}
      `;
      return rows;
    }),
});
