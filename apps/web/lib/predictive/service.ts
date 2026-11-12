import "server-only";
import { db, type Tx } from "../db.ts";
import { generatePredictiveForecast, type GenerateForecastParams } from "./engine.ts";
import {
  type ConsumptionMetricType,
  type HistoricalDataPoint,
  type ModelEvaluationScorecard,
  type ModelTournamentEntry,
  type PredictiveAnomalyFinding,
  type PredictiveForecastOutput,
  type PredictiveForecastPoint,
  type PredictiveInsight,
} from "./types.ts";

type Sql = Tx | ReturnType<typeof db>;

export type PredictiveServiceParams = {
  orgUnitId: string;
  reportingPeriodId: string;
  metricType: ConsumptionMetricType;
  horizonSteps?: number;
  growthThresholdPct?: number;
};

export type MetricMetadata = {
  label: string;
  unit: string;
};

export const METRIC_CONFIGS: Record<ConsumptionMetricType, MetricMetadata> = {
  ELECTRICITY_KWH: {
    label: "Total Electricity Consumption",
    unit: "kWh",
  },
  FUEL_DIESEL_L: {
    label: "Fuel & Diesel Consumption",
    unit: "L",
  },
  WATER_KL: {
    label: "Water Consumption",
    unit: "kL",
  },
  WASTE_TONNES: {
    label: "Waste Disposed / Generated",
    unit: "Tonnes",
  },
  EMISSIONS_SCOPE_1: {
    label: "Scope 1 Direct GHG Emissions",
    unit: "tCO2e",
  },
  EMISSIONS_SCOPE_2: {
    label: "Scope 2 Location-Based Emissions",
    unit: "tCO2e",
  },
  EMISSIONS_SCOPE_3: {
    label: "Scope 3 Value Chain Emissions",
    unit: "tCO2e",
  },
  EMISSIONS_TOTAL: {
    label: "Total Gross GHG Emissions",
    unit: "tCO2e",
  },
};

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
 * Fetches chronological historical series for an org unit and metric type
 * across all periods leading up to the target reporting period.
 */
export async function getHistoricalSeriesForMetric(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    metricType: ConsumptionMetricType;
  },
): Promise<{
  orgUnitName: string;
  reportingPeriodLabel: string;
  metricConfig: MetricMetadata;
  series: HistoricalDataPoint[];
}> {
  const { orgUnitId, reportingPeriodId, metricType } = params;

  // 1. Fetch Org Unit
  const [orgUnit] = await sql<{ id: string; name: string }[]>`
    select id, name from public.org_units where id = ${orgUnitId} and deleted_at is null
  `;
  if (!orgUnit) {
    throw new Error(`Organization unit ${orgUnitId} not found.`);
  }

  // 2. Fetch all periods up to and including target period, chronologically ordered
  const [targetPeriod] = await sql<{ id: string; label: string; start_date: string }[]>`
    select id, label, start_date::text from public.reporting_periods where id = ${reportingPeriodId}
  `;
  if (!targetPeriod) {
    throw new Error(`Reporting period ${reportingPeriodId} not found.`);
  }

  const periods = await sql<{ id: string; label: string; start_date: string; end_date: string }[]>`
    select id, label, start_date::text, end_date::text
    from public.reporting_periods
    where start_date <= ${targetPeriod.start_date}
    order by start_date asc
  `;

  const metricConfig = METRIC_CONFIGS[metricType];
  const series: HistoricalDataPoint[] = [];

  // 3. Query historical data per period
  for (const period of periods) {
    let periodValue = 0;
    let hasVerified = false;

    if (metricType.startsWith("EMISSIONS_")) {
      // Query GHG Emissions from public.calculations
      const rows = await sql<
        {
          scope_code: string | null;
          tco2e: number;
          verification_status: string;
        }[]
      >`
        select
          coalesce(parent_scope.code, s.code) as scope_code,
          case
            when c.result_unit = 'tCO2e' then c.result_value::float
            when c.result_unit = 'kgCO2e' then (c.result_value / 1000.0)::float
            else c.result_value::float
          end as tco2e,
          r.verification_status::text as verification_status
        from public.esg_records r
        join public.esg_metrics m on m.id = r.metric_id
        left join public.scopes s on s.id = m.scope_id
        left join public.scopes parent_scope on parent_scope.id = s.parent_scope_id
        join public.calculations c on c.esg_record_id = r.id
        where r.org_unit_id = ${orgUnitId}
          and r.reporting_period_id = ${period.id}
      `;

      for (const row of rows) {
        if (row.verification_status === "verified") {
          hasVerified = true;
        }

        if (metricType === "EMISSIONS_TOTAL") {
          periodValue += row.tco2e || 0;
        } else if (metricType === "EMISSIONS_SCOPE_1" && row.scope_code === "SCOPE_1") {
          periodValue += row.tco2e || 0;
        } else if (metricType === "EMISSIONS_SCOPE_2" && row.scope_code === "SCOPE_2") {
          periodValue += row.tco2e || 0;
        } else if (metricType === "EMISSIONS_SCOPE_3" && row.scope_code === "SCOPE_3") {
          periodValue += row.tco2e || 0;
        }
      }
    } else {
      // Query physical activity quantities from public.esg_records
      let metricCodeCondition: string[] = [];
      if (metricType === "ELECTRICITY_KWH") {
        metricCodeCondition = ["GRID_ELECTRICITY", "RENEWABLE_ELECTRICITY"];
      } else if (metricType === "FUEL_DIESEL_L") {
        metricCodeCondition = ["DIESEL_CONSUMPTION", "PETROL_CONSUMPTION"];
      } else if (metricType === "WATER_KL") {
        metricCodeCondition = ["WATER_CONSUMPTION"];
      } else if (metricType === "WASTE_TONNES") {
        metricCodeCondition = ["WASTE_DISPOSED"];
      }

      const records = await sql<
        {
          metric_code: string;
          value: number;
          activity_unit: string;
          verification_status: string;
        }[]
      >`
        select
          m.code as metric_code,
          coalesce(r.activity_value_verified, r.activity_value_normalized, 0)::float as value,
          coalesce(r.activity_unit, m.unit) as activity_unit,
          r.verification_status::text as verification_status
        from public.esg_records r
        join public.esg_metrics m on m.id = r.metric_id
        where r.org_unit_id = ${orgUnitId}
          and r.reporting_period_id = ${period.id}
          and m.code in ${sql(metricCodeCondition)}
      `;

      for (const rec of records) {
        if (rec.verification_status === "verified") {
          hasVerified = true;
        }

        let val = rec.value || 0;
        // If waste is in kg, convert to Tonnes for standard ESG display
        if (metricType === "WASTE_TONNES" && rec.activity_unit?.toLowerCase() === "kg") {
          val = val / 1000.0;
        }
        periodValue += val;
      }
    }

    series.push({
      periodId: period.id,
      periodLabel: period.label,
      startDate: period.start_date,
      endDate: period.end_date,
      value: Number(periodValue.toFixed(2)),
      isVerified: hasVerified,
    });
  }

  return {
    orgUnitName: orgUnit.name,
    reportingPeriodLabel: targetPeriod.label,
    metricConfig,
    series,
  };
}

/**
 * Generates forward predictions, runs multi-model tournament, scans anomalies,
 * and persists the snapshot to public.predictive_forecast_snapshots.
 */
export async function generateAndSaveForecast(
  sql: Sql,
  params: PredictiveServiceParams,
): Promise<PredictiveForecastOutput> {
  const {
    orgUnitId,
    reportingPeriodId,
    metricType,
    horizonSteps = 3,
    growthThresholdPct = 0.15,
  } = params;

  const { orgUnitName, reportingPeriodLabel, metricConfig, series } =
    await getHistoricalSeriesForMetric(sql, { orgUnitId, reportingPeriodId, metricType });

  const forecastOutput = generatePredictiveForecast({
    orgUnitId,
    orgUnitName,
    reportingPeriodId,
    reportingPeriodLabel,
    metricType,
    metricLabel: metricConfig.label,
    unit: metricConfig.unit,
    historicalSeries: series,
    horizonSteps,
    growthThresholdPct,
  });

  // Persist snapshot to database
  await sql`
    insert into public.predictive_forecast_snapshots (
      org_unit_id,
      reporting_period_id,
      metric_type,
      champion_model,
      horizon_periods,
      evaluation_metrics,
      model_tournament,
      historical_data,
      predictions,
      anomaly_flags,
      predictive_insights,
      disclaimer,
      updated_at
    ) values (
      ${forecastOutput.orgUnitId},
      ${forecastOutput.reportingPeriodId},
      ${forecastOutput.metricType},
      ${forecastOutput.championModel},
      ${forecastOutput.forecastPoints.length},
      ${sql.json(forecastOutput.evaluationMetrics)},
      ${sql.json(forecastOutput.tournament)},
      ${sql.json(forecastOutput.historicalSeries)},
      ${sql.json(forecastOutput.forecastPoints)},
      ${sql.json(forecastOutput.anomaliesDetected)},
      ${sql.json(forecastOutput.insights)},
      ${forecastOutput.disclaimer},
      now()
    )
    on conflict (org_unit_id, reporting_period_id, metric_type)
    do update set
      champion_model = excluded.champion_model,
      horizon_periods = excluded.horizon_periods,
      evaluation_metrics = excluded.evaluation_metrics,
      model_tournament = excluded.model_tournament,
      historical_data = excluded.historical_data,
      predictions = excluded.predictions,
      anomaly_flags = excluded.anomaly_flags,
      predictive_insights = excluded.predictive_insights,
      disclaimer = excluded.disclaimer,
      updated_at = now()
  `;

  return forecastOutput;
}

/**
 * Retrieves existing predictive forecast snapshot from database.
 */
export async function getForecastSnapshot(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    metricType: ConsumptionMetricType;
  },
): Promise<PredictiveForecastOutput | null> {
  const { orgUnitId, reportingPeriodId, metricType } = params;

  const [row] = await sql<
    {
      id: string;
      org_unit_id: string;
      org_unit_name: string;
      reporting_period_id: string;
      reporting_period_label: string;
      metric_type: string;
      champion_model: string;
      horizon_periods: number;
      evaluation_metrics: unknown;
      model_tournament: unknown;
      historical_data: unknown;
      predictions: unknown;
      anomaly_flags: unknown;
      predictive_insights: unknown;
      disclaimer: string;
      created_at: string;
    }[]
  >`
    select
      s.id,
      s.org_unit_id,
      u.name as org_unit_name,
      s.reporting_period_id,
      p.label as reporting_period_label,
      s.metric_type,
      s.champion_model,
      s.horizon_periods,
      s.evaluation_metrics,
      s.model_tournament,
      s.historical_data,
      s.predictions,
      s.anomaly_flags,
      s.predictive_insights,
      s.disclaimer,
      s.created_at::text as created_at
    from public.predictive_forecast_snapshots s
    join public.org_units u on u.id = s.org_unit_id
    join public.reporting_periods p on p.id = s.reporting_period_id
    where s.org_unit_id = ${orgUnitId}
      and s.reporting_period_id = ${reportingPeriodId}
      and s.metric_type = ${metricType}
  `;

  if (!row) return null;

  const metricConfig = METRIC_CONFIGS[metricType];
  const historical = parseJson<HistoricalDataPoint[]>(row.historical_data, []);
  const tournament = parseJson<ModelTournamentEntry[]>(row.model_tournament, []);
  const predictions = parseJson<PredictiveForecastPoint[]>(row.predictions, []);
  const anomalies = parseJson<PredictiveAnomalyFinding[]>(row.anomaly_flags, []);
  const insights = parseJson<PredictiveInsight[]>(row.predictive_insights, []);
  const evaluation = parseJson<ModelEvaluationScorecard>(row.evaluation_metrics, {
    r2: 0,
    rmse: 0,
    mae: 0,
    mape: 0,
    directionalAccuracy: 0,
    sampleCount: historical.length,
  });

  return {
    orgUnitId: row.org_unit_id,
    orgUnitName: row.org_unit_name,
    reportingPeriodId: row.reporting_period_id,
    reportingPeriodLabel: row.reporting_period_label,
    metricType,
    metricLabel: metricConfig.label,
    unit: metricConfig.unit,
    historicalSeries: historical,
    forecastPoints: predictions,
    championModel: row.champion_model as any,
    championModelName: tournament.find((t) => t.isChampion)?.modelName ?? row.champion_model,
    evaluationMetrics: evaluation,
    tournament,
    anomaliesDetected: anomalies,
    insights,
    dataQuality: {
      totalHistoricalPeriods: historical.length,
      sufficientData: historical.length >= 3,
      coverageRatio: Number((historical.length / 3).toFixed(2)),
    },
    disclaimer: row.disclaimer,
    generatedAt: row.created_at,
  };
}
