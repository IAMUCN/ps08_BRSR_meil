import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  financialYearLabel,
  financialYearOf,
  financialYearRange,
} from "@/lib/consolidation/aggregate";
import { consolidateNodes, loadMetrics, type ConsolidatedMetric } from "@/lib/consolidation/query";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

// Consolidation (06_IMPLEMENTATION_PLAN.md Phase 15, PRD §31, TRD §29): every metric rolled up the org tree
// through the consolidation views (migration 0023), for one period or a financial year, filterable by scope
// and metric. A non-admin only ever consolidates inside their own assignments.

export type { ConsolidatedMetric };

export type ConsolidationView = {
  node: { id: string; name: string; unitType: string };
  path: { id: string; name: string }[];
  label: string;
  periods: { id: string; label: string }[];
  financialYears: { startYear: number; label: string }[];
  metrics: ConsolidatedMetric[];
  children: { id: string; name: string; unitType: string; metrics: ConsolidatedMetric[] }[];
};

const input = z.object({
  orgUnitId: z.uuid().optional(),
  /** Starting calendar year of an April–March financial year, e.g. 2026 for FY 2026-27. */
  financialYear: z.number().int().min(2000).max(2100).optional(),
  periodId: z.uuid().optional(),
  scopeCode: z.string().trim().max(60).optional(),
  metricCode: z.string().trim().max(60).optional(),
});

export const consolidationRouter = router({
  query: protectedProcedure
    .input(input)
    .query(async ({ ctx, input }): Promise<ConsolidationView | null> => {
      const sql = db();

      // --- Which node: any for an Admin, only inside their own assignments for anyone else -------------
      let orgUnitId = input.orgUnitId;
      if (ctx.session.isAdmin) {
        if (!orgUnitId) {
          const [root] = await sql<{ id: string }[]>`
          select id from public.org_units where parent_id is null and deleted_at is null
          order by created_at limit 1`;
          orgUnitId = root?.id;
        }
      } else {
        const [allowed] = await sql<{ id: string }[]>`
        select t.descendant_id as id
        from public.user_org_assignments uoa
        join public.org_unit_tree t on t.ancestor_id = uoa.org_unit_id
        where uoa.user_id = ${ctx.session.userId} and uoa.revoked_at is null
          and (${orgUnitId ?? null}::uuid is null or t.descendant_id = ${orgUnitId ?? null}::uuid)
        order by t.depth
        limit 1`;
        if (!allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "That part of the organisation isn't in your scope.",
          });
        }
        orgUnitId = allowed.id;
      }
      if (!orgUnitId) return null;

      // --- Which periods: one period, a whole financial year, or the open period -------------------------
      const allPeriods = await sql<
        { id: string; label: string; start_date: string; end_date: string }[]
      >`
      select id, label, start_date::text, end_date::text from public.reporting_periods
      order by start_date`;
      let periods: { id: string; label: string; start_date: string; end_date: string }[];
      let label: string;
      if (input.financialYear !== undefined) {
        const { from, to } = financialYearRange(input.financialYear);
        periods = allPeriods.filter((p) => p.start_date >= from && p.end_date <= to);
        label = financialYearLabel(input.financialYear);
      } else {
        const periodId = input.periodId ?? (await resolvePeriod(undefined));
        periods = allPeriods.filter((p) => p.id === periodId);
        label = periods[0]?.label ?? "";
      }
      const periodIds = periods.map((p) => p.id);

      const [node] = await sql<{ id: string; name: string; unit_type: string }[]>`
      select id, name, unit_type::text from public.org_units where id = ${orgUnitId}`;
      if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "Org unit not found." });
      const [children, path] = await Promise.all([
        sql<{ id: string; name: string; unit_type: string }[]>`
        select id, name, unit_type::text from public.org_units
        where parent_id = ${orgUnitId} and deleted_at is null order by name`,
        sql<{ id: string; name: string }[]>`
        select o.id, o.name from public.org_unit_tree t join public.org_units o on o.id = t.ancestor_id
        where t.descendant_id = ${orgUnitId} order by t.depth desc`,
      ]);
      const buckets = [orgUnitId, ...children.map((c) => c.id)];

      // --- Every metric in view, consolidated for the node and each child ------------------------------
      const metrics = await loadMetrics(sql, {
        metricCode: input.metricCode,
        scopeCode: input.scopeCode,
      });
      const byNode = await consolidateNodes(sql, buckets, periodIds, metrics);

      return {
        node: { id: node.id, name: node.name, unitType: node.unit_type },
        path,
        label,
        periods: periods.map((p) => ({ id: p.id, label: p.label })),
        financialYears: years(allPeriods),
        metrics: byNode.get(node.id) ?? [],
        children: children.map((c) => ({
          id: c.id,
          name: c.name,
          unitType: c.unit_type,
          metrics: byNode.get(c.id) ?? [],
        })),
      };
    }),
});

function years(periods: { start_date: string }[]) {
  return [...new Set(periods.map((p) => financialYearOf(p.start_date)))]
    .sort((a, b) => b - a)
    .map((startYear) => ({ startYear, label: financialYearLabel(startYear) }));
}
