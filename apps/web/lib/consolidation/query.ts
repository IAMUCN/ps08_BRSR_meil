import "server-only";
import { parseFormula } from "@/lib/calculation/formulas";
import type { db, Tx } from "@/lib/db";
import {
  consolidate,
  type Consolidated,
  type InputRow,
  type MetricInfo,
  type ValueRow,
} from "./aggregate";

// Consolidated figures for a set of org nodes over a set of periods, read from the consolidation views
// (migration 0023). Shared by consolidation.query (Phase 15) and report generation (Phase 17), so a report
// and the live view always use the same rules.

type Sql = Tx | ReturnType<typeof db>;

export type ConsolidatedMetric = Consolidated & {
  metricId: string;
  code: string;
  name: string;
  scopeName: string | null;
  /** The top-level scope (SCOPE_1/2/3) a Scope 3 category rolls up to; null for non-emission metrics. */
  scopeCode: string | null;
};

export type MetricRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  requires_calculation: boolean;
  scope_name: string | null;
  scope_code: string | null;
  formula_type: string | null;
  formula_definition: unknown;
};

/** Metrics with how each consolidates, optionally filtered by metric code or scope (incl. its categories). */
export function loadMetrics(sql: Sql, filter: { metricCode?: string; scopeCode?: string } = {}) {
  return sql<MetricRow[]>`
    select m.id, m.code, m.name, m.unit, m.requires_calculation, s.name as scope_name,
           coalesce(parent.code, s.code) as scope_code,
           f.formula_type::text as formula_type, f.formula_definition
    from public.esg_metrics m
    left join public.scopes s on s.id = m.scope_id
    left join public.scopes parent on parent.id = s.parent_scope_id
    left join lateral (
      select formula_type, formula_definition from public.calculation_formulas
      where metric_id = m.id and status = 'active' order by version desc limit 1
    ) f on true
    where m.deleted_at is null
      and (${filter.metricCode ?? null}::text is null or m.code = ${filter.metricCode ?? null})
      and (${filter.scopeCode ?? null}::text is null or coalesce(parent.code, s.code) = ${filter.scopeCode ?? null})
    order by s.name nulls last, m.name`;
}

/** Each node's consolidated metrics (only metrics with at least one record there). */
export async function consolidateNodes(
  sql: Sql,
  nodeIds: string[],
  periodIds: string[],
  metrics: MetricRow[],
): Promise<Map<string, ConsolidatedMetric[]>> {
  const result = new Map<string, ConsolidatedMetric[]>(nodeIds.map((id) => [id, []]));
  const metricIds = metrics.map((m) => m.id);
  if (nodeIds.length === 0 || periodIds.length === 0 || metricIds.length === 0) return result;

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
      where cr.org_unit_id in ${sql(nodeIds)} and cr.reporting_period_id in ${sql(periodIds)}
        and cr.metric_id in ${sql(metricIds)}
      group by cr.org_unit_id, cr.metric_id, cr.value_unit`,
    sql<{ bucket: string; metric_id: string; key: string; approved: number; awaiting: number }[]>`
      select cr.org_unit_id::text as bucket, cr.metric_id, ci.input_key as key,
             coalesce(sum(ci.input_value) filter (where cr.approval_status = 'approved'), 0)::float as approved,
             coalesce(sum(ci.input_value) filter (where cr.approval_status <> 'approved'), 0)::float as awaiting
      from public.consolidation_records cr
      join public.calculation_inputs ci on ci.calculation_id = cr.calculation_id
      where cr.org_unit_id in ${sql(nodeIds)} and cr.reporting_period_id in ${sql(periodIds)}
        and cr.metric_id in ${sql(metricIds)}
      group by cr.org_unit_id, cr.metric_id, ci.input_key`,
    sql<{ metric_id: string; field_key: string; field_label: string }[]>`
      select metric_id, field_key, field_label from public.metric_field_requirements
      where metric_id in ${sql(metricIds)}`,
  ]);

  const infoOf = (m: MetricRow): MetricInfo => {
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
              scale: formula.scale,
            }
          : null,
    };
  };

  for (const nodeId of nodeIds) {
    result.set(
      nodeId,
      metrics.flatMap((m) => {
        const own: ValueRow[] = values
          .filter((v) => v.bucket === nodeId && v.metric_id === m.id)
          .map((v) => ({
            unit: v.unit,
            approved: v.approved,
            awaiting: v.awaiting,
            records: v.records,
            notCalculated: v.not_calculated,
          }));
        if (own.length === 0) return [];
        const ownInputs: InputRow[] = inputs.filter(
          (i) => i.bucket === nodeId && i.metric_id === m.id,
        );
        return [
          {
            metricId: m.id,
            code: m.code,
            name: m.name,
            scopeName: m.scope_name,
            scopeCode: m.scope_code,
            ...consolidate(infoOf(m), own, ownInputs),
          },
        ];
      }),
    );
  }
  return result;
}
