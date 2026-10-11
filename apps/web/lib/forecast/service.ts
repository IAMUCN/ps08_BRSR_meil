import "server-only";
import { db, type Tx } from "@/lib/db";
import {
  generateForecast,
  toTonnesCo2e,
  type ForecastResult,
  type ForecastScopeTarget,
  type HistoricalObservation,
  type ScopeCode,
} from "./engine";

type Sql = Tx | ReturnType<typeof db>;

export type ScopeOption = {
  code: ForecastScopeTarget;
  name: string;
  periodsWithData: number;
  totalApprovedTco2e: number;
  isRecommended: boolean;
};

export type ForecastPayload = {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitCode: string;
  availableScopes: ScopeOption[];
  recommendedScope: ForecastScopeTarget;
  result: ForecastResult;
};

/**
 * Retrieves authorized historical emissions records and generates time-series forecast.
 * Read-only analytical query layer that leaves all official calculations untouched.
 */
export async function getEmissionsForecast(
  sql: Sql,
  {
    orgUnitId,
    scopeTarget,
    horizon = 2,
  }: {
    orgUnitId: string;
    scopeTarget?: ForecastScopeTarget;
    horizon?: number;
  },
): Promise<ForecastPayload> {
  // 1. Validate organization unit
  const [orgUnit] = await sql<{ id: string; name: string; code: string }[]>`
    select id, name, code from public.org_units where id = ${orgUnitId} and deleted_at is null`;

  if (!orgUnit) {
    throw new Error("Organization unit not found or inactive.");
  }

  // 2. Fetch all configured reporting periods in chronological order
  const periods = await sql<
    { id: string; label: string; start_date: string; end_date: string; status: string }[]
  >`
    select id, label, start_date::text, end_date::text, status::text
    from public.reporting_periods
    order by start_date asc`;

  // 3. Query historical records from consolidation_records
  const consolidationRows = await sql<
    {
      period_id: string;
      period_label: string;
      start_date: string;
      end_date: string;
      scope_code: string;
      scope_name: string;
      value_unit: string | null;
      approval_status: string;
      raw_value: number;
      record_count: number;
      not_calculated_count: number;
    }[]
  >`
    select
      rp.id as period_id,
      rp.label as period_label,
      rp.start_date::text as start_date,
      rp.end_date::text as end_date,
      coalesce(ps.code, s.code) as scope_code,
      coalesce(ps.name, s.name) as scope_name,
      cr.value_unit,
      cr.approval_status,
      coalesce(sum(cr.value), 0)::float as raw_value,
      count(cr.esg_record_id)::int as record_count,
      count(*) filter (where cr.not_calculated)::int as not_calculated_count
    from public.consolidation_records cr
    join public.reporting_periods rp on rp.id = cr.reporting_period_id
    join public.esg_metrics m on m.id = cr.metric_id
    join public.scopes s on s.id = cr.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    where cr.org_unit_id = ${orgUnitId}
      and cr.value is not null
    group by rp.id, rp.label, rp.start_date, rp.end_date, ps.code, s.code, ps.name, s.name, cr.value_unit, cr.approval_status
    order by rp.start_date asc`;

  // 4. Assess availability across Scope 1, Scope 2, Scope 3, and Total
  const scopeMap = new Map<
    ForecastScopeTarget,
    {
      name: string;
      periods: Map<
        string,
        {
          approvedTco2e: number;
          pendingTco2e: number;
          appRecords: number;
          pendRecords: number;
          notCalc: number;
        }
      >;
    }
  >();

  const targetDefs: Array<{ code: ForecastScopeTarget; name: string }> = [
    { code: "SCOPE_1", name: "Scope 1 (Direct Emissions)" },
    { code: "SCOPE_2", name: "Scope 2 (Indirect Electricity & Steam)" },
    { code: "SCOPE_3", name: "Scope 3 (Value Chain)" },
    { code: "TOTAL", name: "Total Emissions (Scope 1 + 2 + 3)" },
  ];

  for (const def of targetDefs) {
    scopeMap.set(def.code, { name: def.name, periods: new Map() });
  }

  // Aggregate rows into scopes per period
  for (const row of consolidationRows) {
    const rowScope = row.scope_code as ScopeCode;
    const isApproved = row.approval_status === "approved";
    const valTco2e = toTonnesCo2e(row.raw_value, row.value_unit);

    const updateBucket = (target: ForecastScopeTarget) => {
      const bucket = scopeMap.get(target);
      if (!bucket) return;
      const existing = bucket.periods.get(row.period_id) ?? {
        approvedTco2e: 0,
        pendingTco2e: 0,
        appRecords: 0,
        pendRecords: 0,
        notCalc: 0,
      };

      if (isApproved) {
        existing.approvedTco2e += valTco2e;
        existing.appRecords += row.record_count;
      } else {
        existing.pendingTco2e += valTco2e;
        existing.pendRecords += row.record_count;
      }
      existing.notCalc += row.not_calculated_count;
      bucket.periods.set(row.period_id, existing);
    };

    if (rowScope === "SCOPE_1" || rowScope === "SCOPE_2" || rowScope === "SCOPE_3") {
      updateBucket(rowScope);
      updateBucket("TOTAL");
    }
  }

  // Determine scope coverage stats
  const availableScopes: ScopeOption[] = [];
  let bestTarget: ForecastScopeTarget = "SCOPE_1";
  let maxPeriods = -1;
  let maxApprovedEmissions = -1;

  for (const def of targetDefs) {
    const bucket = scopeMap.get(def.code)!;
    let periodsWithData = 0;
    let totalApproved = 0;

    for (const [, pData] of bucket.periods.entries()) {
      if (pData.approvedTco2e > 0) {
        periodsWithData++;
        totalApproved += pData.approvedTco2e;
      }
    }

    if (
      periodsWithData > maxPeriods ||
      (periodsWithData === maxPeriods && totalApproved > maxApprovedEmissions)
    ) {
      maxPeriods = periodsWithData;
      maxApprovedEmissions = totalApproved;
      bestTarget = def.code;
    }

    availableScopes.push({
      code: def.code,
      name: def.name,
      periodsWithData,
      totalApprovedTco2e: Math.round(totalApproved * 1000) / 1000,
      isRecommended: false,
    });
  }

  // Mark recommended scope
  for (const s of availableScopes) {
    if (s.code === bestTarget) {
      s.isRecommended = true;
    }
  }

  const selectedTarget = scopeTarget ?? bestTarget;
  const targetMeta = targetDefs.find((t) => t.code === selectedTarget) ?? targetDefs[0];
  const selectedBucket = scopeMap.get(selectedTarget)!;

  // Build sorted historical observations for all periods that have records
  const historicalObservations: HistoricalObservation[] = [];

  for (const p of periods) {
    const pData = selectedBucket.periods.get(p.id);
    if (!pData && consolidationRows.length > 0) {
      // Period exists in calendar but no emissions recorded for this scope
      historicalObservations.push({
        periodId: p.id,
        periodLabel: p.label,
        startDate: p.start_date,
        endDate: p.end_date,
        valueTco2e: 0,
        approvedRecordCount: 0,
        pendingRecordCount: 0,
        uncalculatedRecordCount: 0,
      });
    } else if (pData) {
      historicalObservations.push({
        periodId: p.id,
        periodLabel: p.label,
        startDate: p.start_date,
        endDate: p.end_date,
        valueTco2e: Math.round(pData.approvedTco2e * 1000) / 1000,
        approvedRecordCount: pData.appRecords,
        pendingRecordCount: pData.pendRecords,
        uncalculatedRecordCount: pData.notCalc,
      });
    }
  }

  // Run pure forecast engine
  const result = generateForecast({
    historical: historicalObservations,
    scopeTarget: selectedTarget,
    scopeName: targetMeta.name,
    horizonPeriods: horizon,
    totalConfiguredPeriods: periods.length,
  });

  return {
    orgUnitId: orgUnit.id,
    orgUnitName: orgUnit.name,
    orgUnitCode: orgUnit.code,
    availableScopes,
    recommendedScope: bestTarget,
    result,
  };
}
