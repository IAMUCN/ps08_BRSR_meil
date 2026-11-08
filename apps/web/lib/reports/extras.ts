import "server-only";
import { analyticsOverview, toTonnes } from "@/lib/analytics/service";
import type { db, Tx } from "@/lib/db";
import type { ActivityEmission, ReportTemplate, TemplateExtras } from "./templates";

// What the GHG inventory and the executive summary add to a report's snapshot (feature_enhancement.md 8.1; D52),
// read at generation from the same consolidation as the rest of the report and frozen with it.

type Sql = Tx | ReturnType<typeof db>;

/** Approved, calculated emissions per activity for the org unit (with everything beneath it) and periods. */
export async function activityEmissions(
  sql: Sql,
  orgUnitId: string,
  periodIds: string[],
): Promise<ActivityEmission[]> {
  if (!periodIds.length) return [];
  const rows = await sql<
    {
      metric_code: string;
      metric_name: string;
      scope_code: ActivityEmission["scopeCode"];
      category_name: string;
      tco2e: number;
      records: number;
    }[]
  >`
    select m.code as metric_code, m.name as metric_name, coalesce(ps.code, s.code) as scope_code,
           s.name as category_name, sum(${toTonnes(sql)})::float as tco2e, count(*)::int as records
    from public.consolidation_records cr
    join public.esg_metrics m on m.id = cr.metric_id
    join public.scopes s on s.id = m.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    where cr.org_unit_id = ${orgUnitId}
      and cr.reporting_period_id = any(${periodIds}::uuid[])
      and cr.approval_status = 'approved' and not cr.not_calculated
      and ${toTonnes(sql)} is not null
      and coalesce(ps.code, s.code) in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
    group by m.code, m.name, coalesce(ps.code, s.code), s.name
    order by 3, 4, 5 desc`;
  return rows.map((r) => ({
    metricCode: r.metric_code,
    metricName: r.metric_name,
    scopeCode: r.scope_code,
    categoryName: r.category_name,
    tco2e: Math.round(r.tco2e * 1_000_000) / 1_000_000,
    records: r.records,
  }));
}

/** The executive summary's year-wise emissions, suggestions and open alerts for the org unit and below. */
export async function summaryAnalytics(
  sql: Sql,
  orgUnitId: string,
): Promise<NonNullable<TemplateExtras["analytics"]>> {
  const [overview, alerts] = await Promise.all([
    analyticsOverview(sql, orgUnitId),
    sql<
      {
        org_unit_name: string;
        period_label: string;
        scope_code: string;
        measured: number;
        baseline: number;
        threshold: number;
      }[]
    >`
      select o.name as org_unit_name, p.label as period_label, a.scope_code,
             a.measured_tco2e::float as measured, a.baseline_tco2e::float as baseline,
             a.threshold_pct::float as threshold
      from public.emission_alerts a
      join public.org_units o on o.id = a.org_unit_id
      join public.reporting_periods p on p.id = a.reporting_period_id
      where a.status = 'open'
        and a.org_unit_id in (select descendant_id from public.org_unit_tree where ancestor_id = ${orgUnitId})
      order by p.start_date desc, o.name, a.scope_code`,
  ]);
  return {
    years: overview.trends.years.map((y) => ({
      label: y.label,
      total: y.total,
      byScope: y.byScope,
      complete: y.complete,
      notes: y.notes,
    })),
    recommendations: overview.recommendations.map((r) => ({
      title: r.title,
      reason: r.reason,
      priority: r.priority,
      policy: r.policy,
    })),
    alerts: alerts.map((a) => ({
      orgUnitName: a.org_unit_name,
      periodLabel: a.period_label,
      scopeCode: a.scope_code,
      measuredT: a.measured,
      baselineT: a.baseline,
      thresholdPct: a.threshold,
    })),
  };
}

export async function templateExtras(
  sql: Sql,
  template: ReportTemplate,
  run: { orgUnitId: string; periodIds: string[]; previousPeriodIds: string[] },
): Promise<TemplateExtras | undefined> {
  if (template === "ghg")
    return {
      activities: await activityEmissions(sql, run.orgUnitId, run.periodIds),
      previousActivities: await activityEmissions(sql, run.orgUnitId, run.previousPeriodIds),
    };
  if (template === "summary") return { analytics: await summaryAnalytics(sql, run.orgUnitId) };
  return undefined;
}
