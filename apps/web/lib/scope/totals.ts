import "server-only";
import type { db, Tx } from "@/lib/db";

// Scope totals (06_IMPLEMENTATION_PLAN.md Phase 10; App Flow §2.2 scope dashboards). Queries over the
// current `calculations` rows — never a stored aggregate (schema §13). Parameterised by scope code so
// Scope 2 and Scope 3 reuse this untouched.

type Sql = Tx | ReturnType<typeof db>;

/** One result unit's totals. Units are never mixed: a factor in kgCO2e is not added to one in tCO2e. */
export type UnitTotal = {
  unit: string;
  /** Approved records — the reportable figure. */
  approved: number;
  /** Calculated but still going through approval. */
  awaitingApproval: number;
  records: number;
};

export type ScopeBranch = {
  id: string;
  name: string;
  unitType: string;
  totals: UnitTotal[];
  /** Verified records in this branch that have no calculation yet (usually a missing factor). */
  notCalculated: number;
};

export type ScopeRecord = {
  recordId: string;
  documentId: string | null;
  fileName: string | null;
  mimeType: string | null;
  metricName: string;
  orgUnitName: string;
  activityValue: number | null;
  activityUnit: string | null;
  resultValue: number | null;
  resultUnit: string | null;
  approvalStatus: string;
  calculatedAt: string | null;
};

/** One activity's share of the scope, e.g. Diesel Consumption inside Scope 1. */
export type ActivityTotal = {
  metricId: string;
  metricName: string;
  totals: UnitTotal[];
  notCalculated: number;
};

export type ScopeBreakdown = {
  node: ScopeBranch;
  /** The same total split by activity — what a reviewer asks next (Phase 11 decision). */
  byActivity: ActivityTotal[];
  /** Organisation → … → project → site: whatever levels exist under this node, one step at a time. */
  children: ScopeBranch[];
  /** Records attached to this node itself (the end of the drill-down). */
  records: ScopeRecord[];
  /** The last periods that have any calculation for this scope, oldest first. */
  trend: { periodId: string; label: string; totals: UnitTotal[] }[];
  path: { id: string; name: string }[];
};

type TotalRow = {
  bucket: string;
  unit: string;
  approved: number;
  awaiting: number;
  records: number;
};

const totalsOf = (rows: TotalRow[], bucket: string): UnitTotal[] =>
  rows
    .filter((r) => r.bucket === bucket)
    .map((r) => ({
      unit: r.unit,
      approved: r.approved,
      awaitingApproval: r.awaiting,
      records: r.records,
    }));

/**
 * Everything the scope dashboard shows for one node and period: the node's own total, the same for each
 * child branch, the records that sit on the node itself, and the trend across recent periods.
 */
export async function scopeBreakdown(
  sql: Sql,
  { scopeCode, orgUnitId, periodId }: { scopeCode: string; orgUnitId: string; periodId: string },
): Promise<ScopeBreakdown> {
  const [node] = await sql<{ id: string; name: string; unit_type: string }[]>`
    select id, name, unit_type::text from public.org_units where id = ${orgUnitId}`;

  // Every unit in the subtree, tagged with the direct child it hangs from ('self' for the node itself).
  const totals = await sql<TotalRow[]>`
    with recursive tree as (
      select id, parent_id, 'self'::text as bucket from public.org_units where id = ${orgUnitId}
      union all
      select o.id, o.parent_id,
             case when o.parent_id = ${orgUnitId} then o.id::text else t.bucket end
      from public.org_units o join tree t on o.parent_id = t.id
    )
    select t.bucket, c.result_unit as unit,
           sum(case when r.approval_status = 'approved' then c.result_value else 0 end)::float as approved,
           sum(case when r.approval_status <> 'approved' then c.result_value else 0 end)::float as awaiting,
           count(*)::int as records
    from public.calculations c
    join public.esg_records r on r.id = c.esg_record_id
    join tree t on t.id = r.org_unit_id
    join public.scopes s on s.id = c.scope_id
    where c.is_current and s.code = ${scopeCode}
      and r.reporting_period_id = ${periodId}
      and r.data_quality_state <> 'rejected'
    group by t.bucket, c.result_unit`;

  // Verified records in the same scope and period that produced no number yet.
  const gaps = await sql<{ bucket: string; n: number }[]>`
    with recursive tree as (
      select id, parent_id, 'self'::text as bucket from public.org_units where id = ${orgUnitId}
      union all
      select o.id, o.parent_id,
             case when o.parent_id = ${orgUnitId} then o.id::text else t.bucket end
      from public.org_units o join tree t on o.parent_id = t.id
    )
    select t.bucket, count(*)::int as n
    from public.esg_records r
    join tree t on t.id = r.org_unit_id
    join public.esg_metrics m on m.id = r.metric_id
    join public.scopes s on s.id = m.scope_id
    where s.code = ${scopeCode} and r.reporting_period_id = ${periodId}
      and r.verification_status = 'user_verified' and r.data_quality_state <> 'rejected'
      and m.requires_calculation
      and not exists (select 1 from public.calculations c
                       where c.esg_record_id = r.id and c.is_current)
    group by t.bucket`;
  const gapOf = (bucket: string) => gaps.find((g) => g.bucket === bucket)?.n ?? 0;

  const activityRows = await sql<
    {
      metric_id: string;
      metric_name: string;
      unit: string | null;
      approved: number;
      awaiting: number;
      records: number;
      not_calculated: number;
    }[]
  >`
    with recursive tree as (
      select id, parent_id from public.org_units where id = ${orgUnitId}
      union all
      select o.id, o.parent_id from public.org_units o join tree t on o.parent_id = t.id
    )
    select m.id as metric_id, m.name as metric_name, c.result_unit as unit,
           coalesce(sum(case when r.approval_status = 'approved' then c.result_value end), 0)::float as approved,
           coalesce(sum(case when r.approval_status <> 'approved' then c.result_value end), 0)::float as awaiting,
           count(c.id)::int as records,
           count(*) filter (where c.id is null)::int as not_calculated
    from public.esg_records r
    join tree t on t.id = r.org_unit_id
    join public.esg_metrics m on m.id = r.metric_id
    join public.scopes s on s.id = m.scope_id
    left join public.calculations c on c.esg_record_id = r.id and c.is_current
    where s.code = ${scopeCode} and r.reporting_period_id = ${periodId}
      and r.verification_status = 'user_verified' and r.data_quality_state <> 'rejected'
    group by m.id, m.name, c.result_unit
    order by m.name`;

  const childRows = await sql<{ id: string; name: string; unit_type: string }[]>`
    select id, name, unit_type::text from public.org_units
    where parent_id = ${orgUnitId} and deleted_at is null
    order by name`;

  const records = await sql<
    {
      record_id: string;
      document_id: string | null;
      file_name: string | null;
      mime_type: string | null;
      metric_name: string;
      org_unit_name: string;
      activity_value: number | null;
      activity_unit: string | null;
      result_value: number | null;
      result_unit: string | null;
      approval_status: string;
      calculated_at: Date | null;
    }[]
  >`
    select r.id as record_id, d.id as document_id, d.file_name, d.mime_type,
           m.name as metric_name, o.name as org_unit_name,
           r.activity_value_verified::float as activity_value, r.activity_unit,
           c.result_value::float as result_value, c.result_unit,
           r.approval_status::text, c.calculated_at
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    join public.scopes s on s.id = m.scope_id
    join public.org_units o on o.id = r.org_unit_id
    left join public.calculations c on c.esg_record_id = r.id and c.is_current
    left join public.esg_record_documents erd on erd.esg_record_id = r.id and erd.is_primary
    left join public.documents d on d.id = erd.document_id and d.deleted_at is null
    where s.code = ${scopeCode} and r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${periodId}
      and r.verification_status = 'user_verified' and r.data_quality_state <> 'rejected'
    order by c.result_value desc nulls last
    limit 200`;

  const trendRows = await sql<
    {
      period_id: string;
      label: string;
      unit: string;
      approved: number;
      awaiting: number;
      records: number;
    }[]
  >`
    with recursive tree as (
      select id, parent_id from public.org_units where id = ${orgUnitId}
      union all
      select o.id, o.parent_id from public.org_units o join tree t on o.parent_id = t.id
    ),
    recent as (
      select p.id, p.label, p.start_date from public.reporting_periods p
      order by p.start_date desc limit 12
    )
    select recent.id as period_id, recent.label, c.result_unit as unit,
           sum(case when r.approval_status = 'approved' then c.result_value else 0 end)::float as approved,
           sum(case when r.approval_status <> 'approved' then c.result_value else 0 end)::float as awaiting,
           count(*)::int as records
    from recent
    join public.esg_records r on r.reporting_period_id = recent.id
    join tree t on t.id = r.org_unit_id
    join public.calculations c on c.esg_record_id = r.id and c.is_current
    join public.scopes s on s.id = c.scope_id
    where s.code = ${scopeCode} and r.data_quality_state <> 'rejected'
    group by recent.id, recent.label, recent.start_date, c.result_unit
    order by recent.start_date`;

  const trend: ScopeBreakdown["trend"] = [];
  for (const row of trendRows) {
    let entry = trend.find((t) => t.periodId === row.period_id);
    if (!entry) {
      entry = { periodId: row.period_id, label: row.label, totals: [] };
      trend.push(entry);
    }
    entry.totals.push({
      unit: row.unit,
      approved: row.approved,
      awaitingApproval: row.awaiting,
      records: row.records,
    });
  }

  const path = await sql<{ id: string; name: string }[]>`
    with recursive up as (
      select id, parent_id, name, 0 as depth from public.org_units where id = ${orgUnitId}
      union all
      select o.id, o.parent_id, o.name, up.depth + 1
      from public.org_units o join up on o.id = up.parent_id
    )
    select id, name from up order by depth desc`;

  // A node's own figure is everything beneath it, so the subtree buckets are summed together.
  const nodeTotals: UnitTotal[] = [];
  for (const row of totals) {
    let entry = nodeTotals.find((t) => t.unit === row.unit);
    if (!entry) {
      entry = { unit: row.unit, approved: 0, awaitingApproval: 0, records: 0 };
      nodeTotals.push(entry);
    }
    entry.approved += row.approved;
    entry.awaitingApproval += row.awaiting;
    entry.records += row.records;
  }

  const byActivity: ActivityTotal[] = [];
  for (const row of activityRows) {
    let activity = byActivity.find((a) => a.metricId === row.metric_id);
    if (!activity) {
      activity = {
        metricId: row.metric_id,
        metricName: row.metric_name,
        totals: [],
        notCalculated: 0,
      };
      byActivity.push(activity);
    }
    activity.notCalculated += row.not_calculated;
    if (!row.unit) continue;
    activity.totals.push({
      unit: row.unit,
      approved: row.approved,
      awaitingApproval: row.awaiting,
      records: row.records,
    });
  }

  return {
    node: {
      id: node.id,
      name: node.name,
      unitType: node.unit_type,
      totals: nodeTotals,
      notCalculated: gaps.reduce((sum, g) => sum + g.n, 0),
    },
    byActivity,
    children: childRows.map((child) => ({
      id: child.id,
      name: child.name,
      unitType: child.unit_type,
      totals: totalsOf(totals, child.id),
      notCalculated: gapOf(child.id),
    })),
    records: records.map((r) => ({
      recordId: r.record_id,
      documentId: r.document_id,
      fileName: r.file_name,
      mimeType: r.mime_type,
      metricName: r.metric_name,
      orgUnitName: r.org_unit_name,
      activityValue: r.activity_value,
      activityUnit: r.activity_unit,
      resultValue: r.result_value,
      resultUnit: r.result_unit,
      approvalStatus: r.approval_status,
      calculatedAt: r.calculated_at?.toISOString() ?? null,
    })),
    trend,
    path,
  };
}
