import "server-only";
import { db, type Tx } from "@/lib/db";
import {
  toTonnesCo2e,
  type BaselineCategory,
  type BaselineData,
  type ScopeCode,
  type ScopeTotals,
} from "./engine";

type Sql = Tx | ReturnType<typeof db>;

/**
 * Retrieves the emissions baseline for an authorized organization unit and reporting period.
 * Queries the official consolidation records without altering any records.
 */
export async function getSimulatorBaseline(
  sql: Sql,
  {
    orgUnitId,
    periodId,
  }: {
    orgUnitId: string;
    periodId: string;
  },
): Promise<BaselineData> {
  // 1. Fetch Organization Unit details
  const [orgUnit] = await sql<{ id: string; name: string; code: string }[]>`
    select id, name, code from public.org_units where id = ${orgUnitId} and deleted_at is null`;

  if (!orgUnit) {
    throw new Error("Organization unit not found or inactive.");
  }

  // 2. Fetch Reporting Period details
  const [period] = await sql<{ id: string; label: string; start_date: string; end_date: string }[]>`
    select id, label, start_date::text, end_date::text from public.reporting_periods where id = ${periodId}`;

  if (!period) {
    throw new Error("Reporting period not found.");
  }

  // 3. Query calculated emissions from consolidation_records
  const consolidationRows = await sql<
    {
      metric_id: string;
      metric_code: string;
      metric_name: string;
      top_scope_code: string;
      top_scope_name: string;
      value_unit: string | null;
      approved_value: number;
      total_calculated_value: number;
      record_count: number;
      not_calculated_count: number;
    }[]
  >`
    select
      m.id as metric_id,
      m.code as metric_code,
      m.name as metric_name,
      coalesce(ps.code, s.code) as top_scope_code,
      coalesce(ps.name, s.name) as top_scope_name,
      cr.value_unit,
      coalesce(sum(cr.value) filter (where cr.approval_status = 'approved'), 0)::float as approved_value,
      coalesce(sum(cr.value), 0)::float as total_calculated_value,
      count(cr.esg_record_id)::int as record_count,
      count(*) filter (where cr.not_calculated)::int as not_calculated_count
    from public.consolidation_records cr
    join public.esg_metrics m on m.id = cr.metric_id
    join public.scopes s on s.id = cr.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    where cr.org_unit_id = ${orgUnitId}
      and cr.reporting_period_id = ${periodId}
    group by m.id, m.code, m.name, ps.code, s.code, ps.name, s.name, cr.value_unit
    order by top_scope_code, m.name`;

  // 4. Query all configured emissions metrics to show complete catalog
  const allEmissionsMetrics = await sql<
    {
      metric_id: string;
      metric_code: string;
      metric_name: string;
      top_scope_code: string;
      top_scope_name: string;
      unit: string;
    }[]
  >`
    select
      m.id as metric_id,
      m.code as metric_code,
      m.name as metric_name,
      coalesce(ps.code, s.code) as top_scope_code,
      coalesce(ps.name, s.name) as top_scope_name,
      m.unit
    from public.esg_metrics m
    join public.scopes s on s.id = m.scope_id
    left join public.scopes ps on ps.id = s.parent_scope_id
    where m.deleted_at is null
      and coalesce(ps.code, s.code) in ('SCOPE_1', 'SCOPE_2', 'SCOPE_3')
    order by top_scope_code, m.name`;

  const consolidationMap = new Map<string, typeof consolidationRows[0]>();
  let totalUncalculated = 0;

  for (const row of consolidationRows) {
    consolidationMap.set(row.metric_id, row);
    totalUncalculated += row.not_calculated_count;
  }

  // Build categories list
  const categories: BaselineCategory[] = [];
  const limitations: string[] = [];

  let scope1Total = 0;
  let scope2Total = 0;
  let scope3Total = 0;

  for (const m of allEmissionsMetrics) {
    const scopeCode = m.top_scope_code as ScopeCode;
    const existing = consolidationMap.get(m.metric_id);

    // Prefer approved value; if none approved but calculated exists, note it
    const rawVal = existing?.approved_value ?? 0;
    const emissionsTco2e = toTonnesCo2e(rawVal, existing?.value_unit ?? "tCO2e");
    const recordCount = existing?.record_count ?? 0;
    const isEligible = emissionsTco2e > 0;

    if (isEligible) {
      if (scopeCode === "SCOPE_1") scope1Total += emissionsTco2e;
      else if (scopeCode === "SCOPE_2") scope2Total += emissionsTco2e;
      else if (scopeCode === "SCOPE_3") scope3Total += emissionsTco2e;
    }

    categories.push({
      id: m.metric_id,
      code: m.metric_code,
      name: m.metric_name,
      scopeCode,
      scopeName: m.top_scope_name,
      baselineTco2e: Math.round(emissionsTco2e * 1000) / 1000,
      recordCount,
      isEligible,
    });
  }

  const grandTotal = scope1Total + scope2Total + scope3Total;

  // Compile data limitation notes
  if (grandTotal === 0) {
    limitations.push(
      "No approved emissions calculations found for this organization and reporting period.",
    );
  }
  if (totalUncalculated > 0) {
    limitations.push(
      `${totalUncalculated} record(s) in this scope are awaiting conversion factor calculation.`,
    );
  }
  const pendingApprovalRows = consolidationRows.filter(
    (r) => r.approved_value === 0 && r.total_calculated_value > 0,
  );
  if (pendingApprovalRows.length > 0) {
    limitations.push(
      `${pendingApprovalRows.length} activity category(ies) have calculations pending corporate approval.`,
    );
  }

  const scopeTotals: ScopeTotals = {
    scope1: Math.round(scope1Total * 1000) / 1000,
    scope2: Math.round(scope2Total * 1000) / 1000,
    scope3: Math.round(scope3Total * 1000) / 1000,
    total: Math.round(grandTotal * 1000) / 1000,
  };

  return {
    orgUnitId: orgUnit.id,
    orgUnitName: orgUnit.name,
    orgUnitCode: orgUnit.code,
    periodId: period.id,
    periodLabel: period.label,
    categories,
    scopeTotals,
    uncalculatedRecords: totalUncalculated,
    limitations,
  };
}
