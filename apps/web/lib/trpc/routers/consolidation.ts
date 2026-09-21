import "server-only";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  consolidate,
  financialYearLabel,
  financialYearOf,
  financialYearRange,
  type Consolidated,
  type InputRow,
  type MetricInfo,
  type ValueRow,
} from "@/lib/consolidation/aggregate";
import { parseFormula } from "@/lib/calculation/formulas";
import { db } from "@/lib/db";
import { protectedProcedure, router } from "@/lib/trpc/init";
import { resolvePeriod } from "@/lib/trpc/routers/scope";

// Consolidation (06_IMPLEMENTATION_PLAN.md Phase 15, PRD §31, TRD §29): every metric rolled up the org tree
// through the consolidation views (migration 0023), for one period or a financial year, filterable by scope
// and metric. A non-admin only ever consolidates inside their own assignments.

export type ConsolidatedMetric = Consolidated & {
  metricId: string;
  code: string;
  name: string;
  scopeName: string | null;
};

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
          select id from public.org_units where parent_id is null and deleted_at is null limit 1`;
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

      // --- Metrics in view, with how each consolidates --------------------------------------------------
      const metrics = await sql<
        {
          id: string;
          code: string;
          name: string;
          unit: string;
          requires_calculation: boolean;
          scope_name: string | null;
          formula_type: string | null;
          formula_definition: unknown;
        }[]
      >`
      select m.id, m.code, m.name, m.unit, m.requires_calculation, s.name as scope_name,
             f.formula_type::text as formula_type, f.formula_definition
      from public.esg_metrics m
      left join public.scopes s on s.id = m.scope_id
      left join lateral (
        select formula_type, formula_definition from public.calculation_formulas
        where metric_id = m.id and status = 'active' order by version desc limit 1
      ) f on true
      where m.deleted_at is null
        and (${input.metricCode ?? null}::text is null or m.code = ${input.metricCode ?? null})
        and (${input.scopeCode ?? null}::text is null or m.scope_id in (
          with recursive sc as (
            select id from public.scopes where code = ${input.scopeCode ?? null}
            union all select s2.id from public.scopes s2 join sc on s2.parent_scope_id = sc.id)
          select id from sc))
      order by s.name nulls last, m.name`;
      const metricIds = metrics.map((m) => m.id);
      if (metricIds.length === 0 || periodIds.length === 0) {
        return {
          node: { id: node.id, name: node.name, unitType: node.unit_type },
          path,
          label,
          periods: periods.map((p) => ({ id: p.id, label: p.label })),
          financialYears: years(allPeriods),
          metrics: [],
          children: children.map((c) => ({
            id: c.id,
            name: c.name,
            unitType: c.unit_type,
            metrics: [],
          })),
        };
      }

      const [values, inputs, labels] = await Promise.all([
        sql<
          {
            bucket: string;
            metric_id: string;
            unit: string | null;
            approved: number;
            awaiting: number;
            records: number;
            not_calculated: number;
          }[]
        >`
        select cr.org_unit_id::text as bucket, cr.metric_id, cr.value_unit as unit,
               coalesce(sum(cr.value) filter (where cr.approval_status = 'approved'), 0)::float as approved,
               coalesce(sum(cr.value) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting,
               count(cr.value)::int as records,
               count(*) filter (where cr.not_calculated)::int as not_calculated
        from public.consolidation_records cr
        where cr.org_unit_id in ${sql(buckets)} and cr.reporting_period_id in ${sql(periodIds)}
          and cr.metric_id in ${sql(metricIds)}
        group by cr.org_unit_id, cr.metric_id, cr.value_unit`,
        sql<
          { bucket: string; metric_id: string; key: string; approved: number; awaiting: number }[]
        >`
        select cr.org_unit_id::text as bucket, cr.metric_id, ci.input_key as key,
               coalesce(sum(ci.input_value) filter (where cr.approval_status = 'approved'), 0)::float as approved,
               coalesce(sum(ci.input_value) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting
        from public.consolidation_records cr
        join public.calculation_inputs ci on ci.calculation_id = cr.calculation_id
        where cr.org_unit_id in ${sql(buckets)} and cr.reporting_period_id in ${sql(periodIds)}
          and cr.metric_id in ${sql(metricIds)}
        group by cr.org_unit_id, cr.metric_id, ci.input_key`,
        sql<{ metric_id: string; field_key: string; field_label: string }[]>`
        select metric_id, field_key, field_label from public.metric_field_requirements
        where metric_id in ${sql(metricIds)}`,
      ]);

      const infoOf = (m: (typeof metrics)[number]): MetricInfo => {
        const formula = m.formula_type ? parseFormula(m.formula_type, m.formula_definition) : null;
        const labelOf = (key: string) =>
          labels.find((l) => l.metric_id === m.id && l.field_key === key)?.field_label ?? key;
        return {
          unit: m.unit,
          requiresCalculation: m.requires_calculation,
          ratio:
            formula?.op === "percentage"
              ? {
                  part: formula.part,
                  whole: formula.whole,
                  partLabel: labelOf(formula.part),
                  wholeLabel: labelOf(formula.whole),
                }
              : null,
        };
      };

      const metricsAt = (bucket: string): ConsolidatedMetric[] =>
        metrics.flatMap((m) => {
          const own: ValueRow[] = values
            .filter((v) => v.bucket === bucket && v.metric_id === m.id)
            .map((v) => ({
              unit: v.unit,
              approved: v.approved,
              awaiting: v.awaiting,
              records: v.records,
              notCalculated: v.not_calculated,
            }));
          if (own.length === 0) return [];
          const ownInputs: InputRow[] = inputs.filter(
            (i) => i.bucket === bucket && i.metric_id === m.id,
          );
          return [
            {
              metricId: m.id,
              code: m.code,
              name: m.name,
              scopeName: m.scope_name,
              ...consolidate(infoOf(m), own, ownInputs),
            },
          ];
        });

      return {
        node: { id: node.id, name: node.name, unitType: node.unit_type },
        path,
        label,
        periods: periods.map((p) => ({ id: p.id, label: p.label })),
        financialYears: years(allPeriods),
        metrics: metricsAt(node.id),
        children: children.map((c) => ({
          id: c.id,
          name: c.name,
          unitType: c.unit_type,
          metrics: metricsAt(c.id),
        })),
      };
    }),
});

function years(periods: { start_date: string }[]) {
  return [...new Set(periods.map((p) => financialYearOf(p.start_date)))]
    .sort((a, b) => b - a)
    .map((startYear) => ({ startYear, label: financialYearLabel(startYear) }));
}
