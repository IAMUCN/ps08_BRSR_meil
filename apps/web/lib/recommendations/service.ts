import "server-only";
import { db, type Tx } from "../db.ts";
import { getEsgFeaturesForUnit } from "../features/service.ts";
import { evaluateAndAuditDecisionRules } from "../rules/service.ts";
import { getRiskReport } from "../risks/service.ts";
import {
  generateRecommendations,
  type RecommendationsReport,
  type Recommendation,
  type RankingWeights,
} from "./engine.ts";

type Sql = Tx | ReturnType<typeof db>;

export type RecommendationsReportRow = {
  id: string;
  org_unit_id: string;
  reporting_period_id: string;
  total_count: number;
  weights_used: any;
  recommendations_data: any;
  features_snapshot: any;
  calibration_disclaimer: string;
  created_at: string;
  updated_at: string;
};

/**
 * Generates and saves ranked recommendations for an organization unit and reporting period.
 * Strictly adheres to formula: Score = 0.35I + 0.25U + 0.20F + 0.20D.
 * Never invents ungrounded financial savings or payback periods.
 */
export async function generateAndSaveRecommendations(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    weights?: Partial<RankingWeights>;
  },
): Promise<RecommendationsReport> {
  const { orgUnitId, reportingPeriodId, weights } = params;

  // 1. Fetch Verified Features (verified data only)
  const features = await getEsgFeaturesForUnit(sql, { orgUnitId, reportingPeriodId });

  // 2. Fetch Active Rule Evaluation Findings
  const ruleSummary = await evaluateAndAuditDecisionRules(sql, { orgUnitId, reportingPeriodId });

  // 3. Fetch Multi-Vector Risk Report
  const riskReport = await getRiskReport(sql, { orgUnitId, reportingPeriodId });

  // 4. Pure Generation and Weighted Ranking
  const report = generateRecommendations(features, ruleSummary.results, riskReport, {
    weights,
  });

  // 5. Persist into recommendations_reports (upsert)
  const recDataJson = JSON.stringify(report.recommendations);
  const weightsJson = JSON.stringify(report.weightsUsed);
  const featuresJson = JSON.stringify(features);

  await sql`
    insert into public.recommendations_reports (
      org_unit_id, reporting_period_id, total_count, weights_used,
      recommendations_data, features_snapshot, calibration_disclaimer, updated_at
    ) values (
      ${orgUnitId}, ${reportingPeriodId}, ${report.totalCount}, ${weightsJson}::jsonb,
      ${recDataJson}::jsonb, ${featuresJson}::jsonb, ${report.calibrationDisclaimer}, now()
    )
    on conflict (org_unit_id, reporting_period_id) do update set
      total_count = excluded.total_count,
      weights_used = excluded.weights_used,
      recommendations_data = excluded.recommendations_data,
      features_snapshot = excluded.features_snapshot,
      calibration_disclaimer = excluded.calibration_disclaimer,
      updated_at = now()
  `;

  return report;
}

/**
 * Loads an existing recommendations report or dynamically evaluates and saves one.
 */
export async function getRecommendationsReport(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    weights?: Partial<RankingWeights>;
  },
): Promise<RecommendationsReport> {
  const { orgUnitId, reportingPeriodId, weights } = params;

  const rows = await sql<RecommendationsReportRow[]>`
    select * from public.recommendations_reports
    where org_unit_id = ${orgUnitId} and reporting_period_id = ${reportingPeriodId}
    limit 1
  `;

  if (rows.length === 0 || weights) {
    return generateAndSaveRecommendations(sql, { orgUnitId, reportingPeriodId, weights });
  }

  const r = rows[0];
  const recsData =
    typeof r.recommendations_data === "string"
      ? JSON.parse(r.recommendations_data)
      : r.recommendations_data;
  const weightsData =
    typeof r.weights_used === "string" ? JSON.parse(r.weights_used) : r.weights_used;
  const featuresSnapshot =
    typeof r.features_snapshot === "string" ? JSON.parse(r.features_snapshot) : r.features_snapshot;

  const recs: Recommendation[] = Array.isArray(recsData) ? recsData : [];

  const byPriority = {
    critical: recs.filter((item) => item.priority === "critical").length,
    high: recs.filter((item) => item.priority === "high").length,
    medium: recs.filter((item) => item.priority === "medium").length,
    low: recs.filter((item) => item.priority === "low").length,
  };

  return {
    reportingPeriod: featuresSnapshot?.reportingPeriod ?? "Current Period",
    orgUnitId,
    orgUnitName: featuresSnapshot?.orgUnitName ?? "Selected Facility",
    recommendations: recs,
    weightsUsed: weightsData,
    totalCount: recs.length,
    byPriority,
    calibrationDisclaimer: r.calibration_disclaimer,
    generatedAt: r.updated_at,
  };
}

/**
 * Updates a recommendation's status and assignee in the saved report.
 */
export async function updateRecommendationStatus(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
    recommendationId: string;
    status: "open" | "in_review" | "approved" | "implemented" | "dismissed";
    assignedTo?: string | null;
  },
): Promise<RecommendationsReport> {
  const report = await getRecommendationsReport(sql, {
    orgUnitId: params.orgUnitId,
    reportingPeriodId: params.reportingPeriodId,
  });

  const target = report.recommendations.find((r) => r.id === params.recommendationId);
  if (target) {
    target.status = params.status;
    if (params.assignedTo !== undefined) {
      target.assigned_to = params.assignedTo;
    }
  }

  const recDataJson = JSON.stringify(report.recommendations);
  await sql`
    update public.recommendations_reports
    set recommendations_data = ${recDataJson}::jsonb,
        updated_at = now()
    where org_unit_id = ${params.orgUnitId}
      and reporting_period_id = ${params.reportingPeriodId}
  `;

  return report;
}
