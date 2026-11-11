import "server-only";
import { TRPCError } from "@trpc/server";
import type { db, Tx } from "@/lib/db";
import { loadOrgNodes } from "@/lib/org/nodes";
import { recommend, type Recommendation } from "./recommend";
import {
  buildTrends,
  type EmissionRow,
  type PeriodGap,
  type PeriodInfo,
  type ScopeCode,
  type Trends,
} from "./trends";

// Reads for Carbon Analytics (feature_enhancement.md Phase 7; A47). Approved figures come from
// consolidation_records (the same roll-up the scope pages and reports use), in tCO2e. lib/db.ts bypasses RLS,
// so the org scope is checked here: a Super Admin reaches every unit, an Administrator the units they
// administer and everything beneath them.

type Sql = Tx | ReturnType<typeof db>;
type Caller = { userId: string; isAdmin: boolean; adminOrgUnitIds: string[] };

/** Units the caller may analyse; null means all of them. */
export async function analyticsUnitIds(sql: Sql, caller: Caller): Promise<string[] | null> {
  if (caller.isAdmin) return null;
  if (caller.adminOrgUnitIds.length === 0) return [];
  const rows = await sql<{ id: string }[]>`
    select distinct descendant_id as id from public.org_unit_tree
    where ancestor_id = any(${caller.adminOrgUnitIds}::uuid[])`;
  return rows.map((r) => r.id);
}

export async function assertAnalyticsScope(sql: Sql, caller: Caller, orgUnitId: string) {
  const ids = await analyticsUnitIds(sql, caller);
  if (ids !== null && !ids.includes(orgUnitId))
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That part of the organisation isn't in your scope.",
    });
}

export type AnalyticsUnit = { id: string; name: string; parentIds: string[]; inactive: boolean };

export async function analyticsUnits(sql: Sql, caller: Caller): Promise<AnalyticsUnit[]> {
  const [nodes, ids] = await Promise.all([loadOrgNodes(sql), analyticsUnitIds(sql, caller)]);
  const allowed = ids === null ? null : new Set(ids);
  return nodes
    .filter((n) => !allowed || allowed.has(n.id))
    .map((n) => ({
      id: n.id,
      name: n.name,
      parentIds: [n.parentId, ...n.alsoUnder].filter((p): p is string => !!p),
      inactive: n.status !== "active",
    }));
}

/** Today's date in India, as the periods are kept. */
export async function indiaToday(sql: Sql): Promise<string> {
  const [{ today }] = await sql<
    { today: string }[]
  >`select public.reporting_period_today()::text as today`;
  return today;
}

export async function loadPeriods(sql: Sql): Promise<PeriodInfo[]> {
  const rows = await sql<
    {
      id: string;
      label: string;
      start_date: string;
      end_date: string;
      period_type: string;
      status: string;
    }[]
  >`
    select id, label, start_date::text, end_date::text, period_type::text, status::text
    from public.reporting_periods order by start_date`;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    startDate: r.start_date,
    endDate: r.end_date,
    type: r.period_type === "annual" ? "annual" : "monthly",
    status: r.status,
  }));
}

/**
 * tCO2e from a calculation result. Emission results are kgCO2e / tCO2e (or kgCO2 / tCO2 for a factor that covers
 * CO2 only); anything else is not an emission and is left out.
 */
export const toTonnes = (sql: Sql) => sql`
  case lower(coalesce(cr.value_unit, ''))
    when 'kgco2e' then cr.value / 1000 when 'kgco2' then cr.value / 1000
    when 'tco2e' then cr.value when 'tco2' then cr.value end`;

/** Per period and activity, for one unit and everything beneath it. */
export async function loadEmissionRows(sql: Sql, orgUnitId: string): Promise<EmissionRow[]> {
  const rows = await sql<
    {
      period_id: string;
      metric_code: string;
      metric_name: string;
      scope_code: ScopeCode;
      approved_t: number | null;
      approved_count: number;
      pending_count: number;
      not_calculated_count: number;
    }[]
  >`
    select cr.reporting_period_id as period_id, m.code as metric_code, m.name as metric_name,
           coalesce(ps.code, s.code) as scope_code,
           sum(${toTonnes(sql)}) filter (where cr.approval_status = 'approved' and not cr.not_calculated)::float
             as approved_t,
           count(*) filter (where cr.approval_status = 'approved' and not cr.not_calculated
                              and ${toTonnes(sql)} is not null)::int as approved_count,
           count(*) filter (where cr.approval_status <> 'approved' and not cr.not_calculated)::int as pending_count,
           count(*) filter (where cr.not_calculated)::int as not_calculated_count
    from public.consolidation_records cr
    join public.esg_metrics m on m.id = cr.metric_id
    join public.scopes s on s.id = m.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    where cr.org_unit_id = ${orgUnitId}
      and coalesce(ps.code, s.code) in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
    group by cr.reporting_period_id, m.code, m.name, coalesce(ps.code, s.code)`;
  return rows.map((r) => ({
    periodId: r.period_id,
    metricCode: r.metric_code,
    metricName: r.metric_name,
    scopeCode: r.scope_code,
    approvedT: r.approved_t ?? 0,
    approvedCount: r.approved_count,
    pendingCount: r.pending_count,
    notCalculatedCount: r.not_calculated_count,
  }));
}

/**
 * Expected submissions of emission activities with nothing filed (or only a rejected record), per unit at or
 * above the expectation, period and scope. `orgUnitIds` null: every unit.
 */
export async function loadMissingExpected(
  sql: Sql,
  orgUnitIds: string[] | null,
): Promise<{ orgUnitId: string; periodId: string; scopeCode: ScopeCode; missing: number }[]> {
  const rows = await sql<
    { org_unit_id: string; period_id: string; scope_code: ScopeCode; missing: number }[]
  >`
    select t.ancestor_id as org_unit_id, p.id as period_id, coalesce(ps.code, s.code) as scope_code,
           count(*)::int as missing
    from public.submission_expectations e
    join public.org_unit_tree t on t.descendant_id = e.org_unit_id
    join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
    join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
    join public.scopes s on s.id = m.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    join public.reporting_periods p on p.period_type::text = m.frequency::text and p.status <> 'draft'
    where ${orgUnitIds === null ? sql`true` : sql`t.ancestor_id = any(${orgUnitIds}::uuid[])`}
      and coalesce(ps.code, s.code) in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
      and not exists (select 1 from public.esg_records r
                      where r.org_unit_id = e.org_unit_id and r.metric_id = e.metric_id
                        and r.reporting_period_id = p.id and r.data_quality_state <> 'rejected')
    group by 1, 2, 3`;
  return rows.map((r) => ({
    orgUnitId: r.org_unit_id,
    periodId: r.period_id,
    scopeCode: r.scope_code,
    missing: r.missing,
  }));
}

export type AnalyticsOverview = {
  orgUnitId: string;
  orgUnitName: string;
  today: string;
  trends: Trends;
  recommendations: Recommendation[];
};

export async function analyticsOverview(sql: Sql, orgUnitId: string): Promise<AnalyticsOverview> {
  const [[unit], periods, rows, missing, today] = await Promise.all([
    sql<
      { name: string }[]
    >`select name from public.org_units where id = ${orgUnitId} and deleted_at is null`,
    loadPeriods(sql),
    loadEmissionRows(sql, orgUnitId),
    loadMissingExpected(sql, [orgUnitId]),
    indiaToday(sql),
  ]);
  if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "That org unit was not found." });
  const gaps = new Map<string, number>();
  for (const m of missing) gaps.set(m.periodId, (gaps.get(m.periodId) ?? 0) + m.missing);
  // A period that has not started yet cannot be missing anything.
  const started = new Set(periods.filter((p) => p.startDate <= today).map((p) => p.id));
  const gapList: PeriodGap[] = [...gaps]
    .filter(([id]) => started.has(id))
    .map(([periodId, missingExpected]) => ({ periodId, missingExpected }));
  const trends = buildTrends({ periods, rows, gaps: gapList, today });
  const completeYears = new Set(trends.years.filter((y) => y.complete).map((y) => y.financialYear));
  return {
    orgUnitId,
    orgUnitName: unit.name,
    today,
    trends,
    recommendations: recommend({ periods, rows, completeYears }),
  };
}

export type UnitEmission = {
  orgUnitId: string;
  name: string;
  /** The unit's level as configured (Project, Site …). */
  level: string;
  tco2e: number;
  records: number;
  sharePct: number;
};

/**
 * One suggestion's emissions split by the unit each record was filed under (owner's request, 2026-11-11: which
 * project emits the most, not only which source). Approved, calculated records of the given activities in one
 * financial year, for the chosen unit and everything beneath it; largest first.
 */
export async function emissionsByUnit(
  sql: Sql,
  orgUnitId: string,
  metricCodes: string[],
  financialYear: number,
): Promise<UnitEmission[]> {
  const rows = await sql<
    { org_unit_id: string; name: string; level: string; tco2e: number; records: number }[]
  >`
    select o.id as org_unit_id, o.name, coalesce(l.label, o.unit_type::text) as level,
           sum(${toTonnes(sql)})::float as tco2e, count(*)::int as records
    from public.consolidation_records cr
    join public.esg_metrics m on m.id = cr.metric_id
    join public.reporting_periods p on p.id = cr.reporting_period_id
    join public.org_units o on o.id = cr.source_org_unit_id
    left join public.org_levels l on l.code = o.unit_type::text
    where cr.org_unit_id = ${orgUnitId}
      and m.code = any(${metricCodes}::text[])
      and cr.approval_status = 'approved' and not cr.not_calculated
      and ${toTonnes(sql)} is not null
      and p.start_date >= make_date(${financialYear}, 4, 1)
      and p.start_date < make_date(${financialYear} + 1, 4, 1)
    group by o.id, o.name, l.label, o.unit_type
    order by tco2e desc, o.name`;
  const total = rows.reduce((s, r) => s + r.tco2e, 0);
  return rows.map((r) => ({
    orgUnitId: r.org_unit_id,
    name: r.name,
    level: r.level,
    tco2e: r.tco2e,
    records: r.records,
    sharePct: total > 0 ? (r.tco2e / total) * 100 : 0,
  }));
}
