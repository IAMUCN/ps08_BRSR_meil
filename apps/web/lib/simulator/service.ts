import "server-only";
import { db, type Tx } from "../db.ts";
import {
  toTonnesCo2e,
  type BaselineCategory,
  type BaselineData,
  type MultiVectorBaseline,
  type MultiVectorSimulationResult,
  type ScopeCode,
  type ScopeTotals,
} from "./engine.ts";

type Sql = Tx | ReturnType<typeof db>;

/**
 * Parses JSONB column safely from postgres.js.
 */
function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

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

  const consolidationMap = new Map<string, (typeof consolidationRows)[0]>();
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

    const rawVal =
      existing?.approved_value && existing.approved_value > 0
        ? existing.approved_value
        : existing?.total_calculated_value && existing.total_calculated_value > 0
          ? existing.total_calculated_value
          : 0;
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

/**
 * Retrieves the comprehensive multi-vector baseline for an org unit and period:
 * Electricity, Renewables, Fuel, Water, Waste, GHG Scopes, and active Shadow Carbon Price.
 */
export async function getMultiVectorBaseline(
  sql: Sql,
  params: {
    orgUnitId: string;
    periodId: string;
  },
): Promise<MultiVectorBaseline> {
  const { orgUnitId, periodId } = params;

  // 1. Fetch Org Unit and Period Details
  const [orgUnit] = await sql<{ id: string; name: string; code: string }[]>`
    select id, name, code from public.org_units where id = ${orgUnitId} and deleted_at is null
  `;
  if (!orgUnit) {
    throw new Error(`Organization unit ${orgUnitId} not found.`);
  }

  const [period] = await sql<{ id: string; label: string; start_date: string; end_date: string }[]>`
    select id, label, start_date::text, end_date::text from public.reporting_periods where id = ${periodId}
  `;
  if (!period) {
    throw new Error(`Reporting period ${periodId} not found.`);
  }

  // 2. Query physical activity quantities from public.esg_records
  const records = await sql<
    {
      metric_code: string;
      value: number;
      activity_unit: string;
    }[]
  >`
    select
      m.code as metric_code,
      coalesce(r.activity_value_verified, r.activity_value_normalized, 0)::float as value,
      coalesce(r.activity_unit, m.unit) as activity_unit
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    where r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${periodId}
  `;

  let gridElectricityKwh = 0;
  let renewableElectricityKwh = 0;
  let fuelDieselL = 0;
  let waterKl = 0;
  let wasteTonnes = 0;

  for (const r of records) {
    const val = r.value || 0;
    if (r.metric_code === "GRID_ELECTRICITY") {
      gridElectricityKwh += val;
    } else if (r.metric_code === "RENEWABLE_ELECTRICITY") {
      renewableElectricityKwh += val;
    } else if (r.metric_code === "DIESEL_CONSUMPTION") {
      fuelDieselL += val;
    } else if (r.metric_code === "WATER_CONSUMPTION") {
      waterKl += val;
    } else if (r.metric_code === "WASTE_DISPOSED") {
      // If in kg, convert to Tonnes
      wasteTonnes += r.activity_unit?.toLowerCase() === "kg" ? val / 1000.0 : val;
    }
  }

  const totalElectricityKwh = gridElectricityKwh + renewableElectricityKwh;
  const renewableSharePct =
    totalElectricityKwh > 0
      ? Number(((renewableElectricityKwh / totalElectricityKwh) * 100).toFixed(1))
      : 0;

  // 3. Query emissions totals per scope from public.calculations
  const emissionsRows = await sql<
    {
      scope_code: string | null;
      tco2e: number;
    }[]
  >`
    select
      coalesce(parent_scope.code, s.code) as scope_code,
      case
        when c.result_unit = 'tCO2e' then c.result_value::float
        when c.result_unit = 'kgCO2e' then (c.result_value / 1000.0)::float
        else c.result_value::float
      end as tco2e
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    left join public.scopes s on s.id = m.scope_id
    left join public.scopes parent_scope on parent_scope.id = s.parent_scope_id
    join public.calculations c on c.esg_record_id = r.id
    where r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${periodId}
  `;

  let scope1Tco2e = 0;
  let scope2Tco2e = 0;
  let scope3Tco2e = 0;

  for (const row of emissionsRows) {
    if (row.scope_code === "SCOPE_1") scope1Tco2e += row.tco2e || 0;
    else if (row.scope_code === "SCOPE_2") scope2Tco2e += row.tco2e || 0;
    else if (row.scope_code === "SCOPE_3") scope3Tco2e += row.tco2e || 0;
  }

  const totalTco2e = Number((scope1Tco2e + scope2Tco2e + scope3Tco2e).toFixed(3));

  // 4. Query active internal carbon price for org unit or fallback
  const [icpRow] = await sql<{ shadow_price_per_tco2e: number }[]>`
    select shadow_price_per_tco2e::float
    from public.internal_carbon_prices
    where (org_unit_id = ${orgUnitId} or org_unit_id is null)
      and is_active = true
    order by (org_unit_id is not null) desc
    limit 1
  `;
  const shadowPricePerTco2e = icpRow?.shadow_price_per_tco2e ?? 2500.0;

  return {
    orgUnitId: orgUnit.id,
    orgUnitName: orgUnit.name,
    orgUnitCode: orgUnit.code,
    periodId: period.id,
    periodLabel: period.label,
    gridElectricityKwh: Math.round(gridElectricityKwh),
    renewableElectricityKwh: Math.round(renewableElectricityKwh),
    totalElectricityKwh: Math.round(totalElectricityKwh),
    renewableSharePct,
    fuelDieselL: Math.round(fuelDieselL),
    waterKl: Math.round(waterKl),
    wasteTonnes: Number(wasteTonnes.toFixed(2)),
    scope1Tco2e: Number(scope1Tco2e.toFixed(3)),
    scope2Tco2e: Number(scope2Tco2e.toFixed(3)),
    scope3Tco2e: Number(scope3Tco2e.toFixed(3)),
    totalTco2e,
    gridEmissionFactor: 0.000716, // CEA National Grid baseline tCO2e/kWh
    dieselEmissionFactor: 0.00268, // tCO2e/L
    shadowPricePerTco2e,
    gridTariffInrPerKwh: 7.5,
    solarPpaTariffInrPerKwh: 3.8,
    dieselPriceInrPerL: 90.0,
    waterTariffInrPerKl: 40.0,
    wasteDisposalCostInrPerTonne: 800.0,
  };
}

/**
 * Saves a what-if scenario simulation snapshot into public.what_if_scenario_simulations.
 */
export async function saveScenarioSimulation(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    scenarioName: string;
    scenarioType: string;
    parameters: Record<string, unknown>;
    simulationResult: MultiVectorSimulationResult;
    userId?: string | null;
  },
): Promise<string> {
  const {
    orgUnitId,
    reportingPeriodId,
    scenarioName,
    scenarioType,
    parameters,
    simulationResult,
    userId = null,
  } = params;

  const [row] = await sql<{ id: string }[]>`
    insert into public.what_if_scenario_simulations (
      org_unit_id,
      reporting_period_id,
      scenario_name,
      scenario_type,
      parameters,
      baseline_metrics,
      simulated_metrics,
      financial_impact,
      disclaimer,
      created_by,
      updated_at
    ) values (
      ${orgUnitId},
      ${reportingPeriodId},
      ${scenarioName},
      ${scenarioType},
      ${sql.json(parameters as any)},
      ${sql.json(simulationResult.baseline as any)},
      ${sql.json({
        projected: simulationResult.projected,
        avoided: simulationResult.avoided,
      } as any)},
      ${sql.json(simulationResult.financialImpact as any)},
      ${simulationResult.disclaimer},
      ${userId},
      now()
    )
    returning id
  `;

  return row.id;
}

/**
 * Lists saved what-if scenario simulations for an org unit and reporting period.
 */
export async function listSavedScenarios(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
  },
): Promise<
  Array<{
    id: string;
    scenarioName: string;
    scenarioType: string;
    parameters: Record<string, unknown>;
    baselineMetrics: Record<string, unknown>;
    simulatedMetrics: Record<string, unknown>;
    financialImpact: Record<string, unknown>;
    disclaimer: string;
    createdAt: string;
  }>
> {
  const { orgUnitId, reportingPeriodId } = params;

  const rows = await sql<
    {
      id: string;
      scenario_name: string;
      scenario_type: string;
      parameters: unknown;
      baseline_metrics: unknown;
      simulated_metrics: unknown;
      financial_impact: unknown;
      disclaimer: string;
      created_at: string;
    }[]
  >`
    select
      id,
      scenario_name,
      scenario_type,
      parameters,
      baseline_metrics,
      simulated_metrics,
      financial_impact,
      disclaimer,
      created_at::text as created_at
    from public.what_if_scenario_simulations
    where org_unit_id = ${orgUnitId}
      and reporting_period_id = ${reportingPeriodId}
    order by created_at desc
  `;

  return rows.map((r) => ({
    id: r.id,
    scenarioName: r.scenario_name,
    scenarioType: r.scenario_type,
    parameters: parseJson(r.parameters, {}),
    baselineMetrics: parseJson(r.baseline_metrics, {}),
    simulatedMetrics: parseJson(r.simulated_metrics, {}),
    financialImpact: parseJson(r.financial_impact, {}),
    disclaimer: r.disclaimer,
    createdAt: r.created_at,
  }));
}
