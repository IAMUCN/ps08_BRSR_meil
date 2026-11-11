import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { readAlertSettings, type AlertSettings } from "@/lib/analytics/alerts";
import { runEmissionAlerts } from "@/lib/analytics/run-alerts";
import {
  analyticsOverview,
  analyticsUnitIds,
  analyticsUnits,
  assertAnalyticsScope,
  emissionsByUnit,
  type AnalyticsOverview,
  type AnalyticsUnit,
  type UnitEmission,
} from "@/lib/analytics/service";
import type { ScopeCode } from "@/lib/analytics/trends";
import { checkWording, wordingMessages } from "@/lib/analytics/wording";
import { writeAudit } from "@/lib/audit";
import { chatConfig } from "@/lib/chat/data";
import { createModelCaller, ProviderError } from "@/lib/chat/nim";
import { db } from "@/lib/db";
import { bucket, count, exceeded, rateLimits } from "@/lib/security/rate-limit";
import { adminAreaProcedure, adminProcedure, router } from "@/lib/trpc/init";

// Carbon Analytics (feature_enhancement.md Phase 7, requirements 33 and 34; A47). Open to Super Admins (every
// unit) and Administrators (their units and below); the threshold settings and "Check now" are Super Admin only.

const AI_PERMISSION = "chat.use";

export type EmissionAlert = {
  id: string;
  orgUnitId: string;
  orgUnitName: string;
  periodId: string;
  periodLabel: string;
  scopeCode: ScopeCode;
  measuredT: number;
  baselineT: number;
  thresholdPct: number;
  baselinePeriods: { periodId: string; label: string; tco2e: number }[];
  status: "open" | "acknowledged";
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  acknowledgedNote: string | null;
  createdAt: string;
};

const settingsInput = z.object({
  enabled: z.boolean(),
  thresholdPct: z.object({
    SCOPE_1: z.number().min(1).max(1000),
    SCOPE_2: z.number().min(1).max(1000),
    SCOPE_3: z.number().min(1).max(1000),
  }),
  minBaselineYears: z.number().int().min(1).max(3),
  minIncreaseTco2e: z.number().min(0).max(1_000_000),
  lookbackDays: z.number().int().min(1).max(730),
});

async function loadSettings(): Promise<AlertSettings> {
  const [row] = await db()<{ value: unknown }[]>`
    select value from public.org_settings where key = 'emission_alert_settings'`;
  return readAlertSettings(row?.value);
}

export const analyticsRouter = router({
  units: adminAreaProcedure.query(async ({ ctx }): Promise<AnalyticsUnit[]> =>
    analyticsUnits(db(), ctx.session),
  ),

  overview: adminAreaProcedure
    .input(z.object({ orgUnitId: z.uuid() }))
    .query(async ({ ctx, input }): Promise<AnalyticsOverview & { aiAvailable: boolean }> => {
      const sql = db();
      await assertAnalyticsScope(sql, ctx.session, input.orgUnitId);
      const overview = await analyticsOverview(sql, input.orgUnitId);
      return {
        ...overview,
        aiAvailable: chatConfig() !== null && ctx.session.permissions.includes(AI_PERMISSION),
      };
    }),

  /**
   * Rewords one suggestion through the AI service, on request. The rules chose it; the model only writes it
   * in plain words, and a reply with a figure not in the suggestion is refused (lib/analytics/wording.ts).
   */
  /**
   * Which units (projects, sites) a suggestion's emissions come from, largest first (owner's request,
   * 2026-11-11). Same scope rule as the page; read-only, so not audited.
   */
  byUnit: adminAreaProcedure
    .input(z.object({ orgUnitId: z.uuid(), recommendationId: z.string().min(3).max(80) }))
    .query(async ({ ctx, input }): Promise<{ financialYear: number; units: UnitEmission[] }> => {
      const sql = db();
      await assertAnalyticsScope(sql, ctx.session, input.orgUnitId);
      const { recommendations } = await analyticsOverview(sql, input.orgUnitId);
      const rec = recommendations.find((r) => r.id === input.recommendationId);
      if (!rec)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That suggestion no longer applies. Reload the page.",
        });
      const { financialYear, metricCodes } = rec.evidence;
      return {
        financialYear,
        units: await emissionsByUnit(sql, input.orgUnitId, metricCodes, financialYear),
      };
    }),

  wordRecommendation: adminAreaProcedure
    .input(z.object({ orgUnitId: z.uuid(), recommendationId: z.string().min(3).max(80) }))
    .mutation(async ({ ctx, input }): Promise<{ text: string; model: string }> => {
      const sql = db();
      await assertAnalyticsScope(sql, ctx.session, input.orgUnitId);
      const config = chatConfig();
      if (!config || !ctx.session.permissions.includes(AI_PERMISSION))
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "AI wording is not available to you on this server.",
        });
      const limits = await rateLimits();
      const limiter = bucket("chat", ctx.session.userId);
      if (await exceeded(limiter, limits.chat_messages_per_user, limits.chat_window_minutes))
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `You have asked the AI service ${limits.chat_messages_per_user} times in ${limits.chat_window_minutes} minutes. Try again shortly.`,
        });
      const { recommendations } = await analyticsOverview(sql, input.orgUnitId);
      const rec = recommendations.find((r) => r.id === input.recommendationId);
      if (!rec)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That suggestion no longer applies. Reload the page.",
        });
      await count(limiter);
      const call = createModelCaller({
        config,
        tools: [],
        onFailure: (model, reason) =>
          console.warn(`analytics wording: ${model} failed (${reason})`),
      });
      // One audit entry per request, whatever the outcome; the wording itself is not kept.
      const audit = (outcome: Record<string, unknown>) =>
        sql.begin((tx) =>
          writeAudit(tx, {
            eventType: "analytics.recommendation_worded",
            entityType: "org_unit",
            entityId: input.orgUnitId,
            userId: ctx.session.userId,
            newValue: { recommendation: rec.id, ...outcome },
          }),
        );
      let reply;
      try {
        reply = await call(wordingMessages(rec), AbortSignal.timeout(45_000), false);
      } catch (error) {
        const failure = error instanceof ProviderError ? error.kind : "provider";
        await audit({ accepted: false, failure });
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            (error instanceof ProviderError
              ? error.message
              : "The AI service is not available right now.") + " The fixed wording stands.",
        });
      }
      const checked = checkWording(reply.content, rec);
      await audit({
        model: reply.model,
        accepted: checked.ok,
        ...(checked.ok ? {} : { failure: checked.reason }),
      });
      if (!checked.ok)
        throw new TRPCError({
          code: "UNPROCESSABLE_CONTENT",
          message:
            "The AI wording added figures or did not read as plain advice, so it was not shown. The fixed wording stands.",
        });
      return { text: checked.text, model: reply.model };
    }),

  alerts: adminAreaProcedure
    .input(z.object({ orgUnitId: z.uuid().optional() }).optional())
    .query(async ({ ctx, input }): Promise<EmissionAlert[]> => {
      const sql = db();
      const ids = await analyticsUnitIds(sql, ctx.session);
      if (input?.orgUnitId) await assertAnalyticsScope(sql, ctx.session, input.orgUnitId);
      const rows = await sql<
        {
          id: string;
          org_unit_id: string;
          org_unit_name: string;
          period_id: string;
          period_label: string;
          scope_code: ScopeCode;
          measured: number;
          baseline: number;
          threshold: number;
          baseline_periods: EmissionAlert["baselinePeriods"];
          status: EmissionAlert["status"];
          acknowledged_by: string | null;
          acknowledged_at: string | null;
          acknowledged_note: string | null;
          created_at: string;
        }[]
      >`
        select a.id, a.org_unit_id, o.name as org_unit_name, a.reporting_period_id as period_id,
               p.label as period_label, a.scope_code, a.measured_tco2e::float as measured,
               a.baseline_tco2e::float as baseline, a.threshold_pct::float as threshold, a.baseline_periods,
               a.status, u.display_name as acknowledged_by, a.acknowledged_at::text, a.acknowledged_note,
               a.created_at::text
        from public.emission_alerts a
        join public.org_units o on o.id = a.org_unit_id
        join public.reporting_periods p on p.id = a.reporting_period_id
        left join public.users u on u.id = a.acknowledged_by
        where ${ids === null ? sql`true` : sql`a.org_unit_id = any(${ids}::uuid[])`}
          and ${
            input?.orgUnitId
              ? sql`a.org_unit_id in (select descendant_id from public.org_unit_tree where ancestor_id = ${input.orgUnitId})`
              : sql`true`
          }
        order by a.status = 'open' desc, p.start_date desc, o.name, a.scope_code
        limit 200`;
      return rows.map((r) => ({
        id: r.id,
        orgUnitId: r.org_unit_id,
        orgUnitName: r.org_unit_name,
        periodId: r.period_id,
        periodLabel: r.period_label,
        scopeCode: r.scope_code,
        measuredT: r.measured,
        baselineT: r.baseline,
        thresholdPct: r.threshold,
        baselinePeriods: r.baseline_periods,
        status: r.status,
        acknowledgedBy: r.acknowledged_by,
        acknowledgedAt: r.acknowledged_at,
        acknowledgedNote: r.acknowledged_note,
        createdAt: r.created_at,
      }));
    }),

  acknowledge: adminAreaProcedure
    .input(z.object({ id: z.uuid(), note: z.string().trim().min(3).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      const sql = db();
      const [alert] = await sql<{ org_unit_id: string; status: string }[]>`
        select org_unit_id, status from public.emission_alerts where id = ${input.id}`;
      if (!alert) throw new TRPCError({ code: "NOT_FOUND", message: "That alert was not found." });
      await assertAnalyticsScope(sql, ctx.session, alert.org_unit_id);
      if (alert.status !== "open")
        throw new TRPCError({
          code: "CONFLICT",
          message: "This alert has already been acknowledged.",
        });
      await sql.begin(async (tx) => {
        const done = await tx`
          update public.emission_alerts
          set status = 'acknowledged', acknowledged_by = ${ctx.session.userId}, acknowledged_at = now(),
              acknowledged_note = ${input.note}
          where id = ${input.id} and status = 'open'
          returning id`;
        if (done.length === 0)
          throw new TRPCError({
            code: "CONFLICT",
            message: "This alert has already been acknowledged.",
          });
        await writeAudit(tx, {
          eventType: "emission_alert.acknowledged",
          entityType: "emission_alert",
          entityId: input.id,
          userId: ctx.session.userId,
          newValue: { status: "acknowledged" },
          reason: input.note,
        });
      });
      return { ok: true };
    }),

  alertSettings: adminAreaProcedure.query(() => loadSettings()),

  updateAlertSettings: adminProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
    const before = await loadSettings();
    await db().begin(async (tx) => {
      const [saved] = await tx<{ id: string }[]>`
        insert into public.org_settings (key, value, updated_by)
        values ('emission_alert_settings', ${tx.json(input)}, ${ctx.session.userId})
        on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by,
                                        updated_at = now()
        returning id`;
      await writeAudit(tx, {
        eventType: "settings.emission_alerts_changed",
        entityType: "org_setting",
        entityId: saved.id,
        userId: ctx.session.userId,
        oldValue: before,
        newValue: input,
      });
    });
    return readAlertSettings(input);
  }),

  runAlerts: adminProcedure.mutation(({ ctx }) =>
    runEmissionAlerts({ userId: ctx.session.userId }),
  ),
});
