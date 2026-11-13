import "server-only";
import { db, type Tx } from "../db.ts";
import { getEsgFeaturesForUnit } from "../features/service.ts";
import {
  evaluateEsgRisks,
  type RiskAssessmentReport,
  type CategoryRiskAssessment,
  type ExistingValidationAnomaly,
  type ExistingDuplicateFinding,
  type ExistingMissingSubmission,
  type ExistingBrsrReadinessSummary,
} from "./engine.ts";

type Sql = Tx | ReturnType<typeof db>;

export type RiskEvaluationReportRow = {
  id: string;
  org_unit_id: string;
  reporting_period_id: string;
  overall_risk_level: string;
  overall_risk_score: number;
  high_or_critical_count: number;
  executive_summary: string;
  disclaimer: string;
  category_assessments: any;
  features_snapshot: any;
  evaluated_at: string;
  created_at: string;
};

/**
 * Runs the EmeilSG Risk Engine by reusing existing validation engine anomalies,
 * duplicate flags, BRSR mapping readiness, and submission monitoring.
 */
export async function evaluateAndSaveRisks(
  sql: Sql,
  params: {
    orgUnitId: string;
    reportingPeriodId: string;
  },
): Promise<RiskAssessmentReport> {
  const { orgUnitId, reportingPeriodId } = params;

  // 1. Fetch Verified Features from Feature Engine
  const features = await getEsgFeaturesForUnit(sql, { orgUnitId, reportingPeriodId });

  // 2. Reuse Existing Validation Engine Anomaly Checks
  const anomalyRows = await sql<
    {
      record_id: string;
      metric_name: string;
      metric_code: string;
      rule_type: string;
      result: string;
      message: string;
      is_water_metric: boolean;
    }[]
  >`
    select vr.esg_record_id as record_id, m.name as metric_name, m.code as metric_code,
           vr.rule_type::text as rule_type, vr.result::text as result, vr.message,
           (cat.name ilike '%water%' or m.code ilike '%water%' or m.name ilike '%water%') as is_water_metric
    from public.validation_results vr
    join public.esg_records r on r.id = vr.esg_record_id
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_categories cat on cat.id = m.category_id
    where r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${reportingPeriodId}
      and vr.rule_type = 'anomaly'
      and vr.result in ('flagged', 'fail')
    order by vr.evaluated_at desc
  `;

  const validationAnomalies: ExistingValidationAnomaly[] = anomalyRows.map((r) => ({
    recordId: r.record_id,
    metricName: r.metric_name,
    metricCode: r.metric_code,
    ruleType: r.rule_type,
    result: r.result === "fail" ? "fail" : "flagged",
    message: r.message,
    isWaterMetric: Boolean(r.is_water_metric),
  }));

  // 3. Reuse Existing Validation Engine Duplicate Invoices & Flags
  const duplicateRows = await sql<
    {
      record_id: string;
      metric_name: string;
      invoice_number: string | null;
      message: string | null;
    }[]
  >`
    select r.id as record_id, m.name as metric_name,
           coalesce(f.verified_value, f.extracted_value, d.file_name) as invoice_number,
           coalesce(vr.message, 'Flagged by duplicate check in validation engine') as message
    from public.esg_records r
    join public.esg_metrics m on m.id = r.metric_id
    left join public.esg_record_documents erd on erd.esg_record_id = r.id
    left join public.documents d on d.id = erd.document_id
    left join public.ocr_extractions ox on ox.document_id = d.id
    left join public.ocr_fields f on f.ocr_extraction_id = ox.id and f.field_key in ('invoice_number', 'bill_number', 'invoice_no')
    left join public.validation_results vr on vr.esg_record_id = r.id and (vr.message ilike '%invoice%' or vr.message ilike '%duplicate%')
    where r.org_unit_id = ${orgUnitId}
      and r.reporting_period_id = ${reportingPeriodId}
      and (r.is_duplicate_flag = true or vr.id is not null)
    order by r.created_at desc
  `;

  const validationDuplicates: ExistingDuplicateFinding[] = duplicateRows.map((r) => ({
    recordId: r.record_id,
    metricName: r.metric_name,
    invoiceNumber: r.invoice_number,
    message: r.message ?? "Duplicate submission detected",
  }));

  // 4. Reuse Submission Monitoring Expectations
  const missingRows = await sql<
    {
      org_unit_id: string;
      org_unit_name: string;
      metric_name: string;
      category_name: string;
    }[]
  >`
    select e.org_unit_id, o.name as org_unit_name, m.name as metric_name, cat.name as category_name
    from public.submission_expectations e
    join public.org_unit_tree t on t.descendant_id = e.org_unit_id and t.ancestor_id = ${orgUnitId}
    join public.esg_metrics m on m.id = e.metric_id and m.deleted_at is null
    join public.reporting_periods p on p.id = ${reportingPeriodId}
      and p.period_type::text = m.frequency::text
    join public.org_units o on o.id = e.org_unit_id and o.deleted_at is null
    join public.esg_categories cat on cat.id = m.category_id
    where not exists (
      select 1 from public.esg_records r
      where r.org_unit_id = e.org_unit_id
        and r.metric_id = e.metric_id
        and r.reporting_period_id = ${reportingPeriodId}
        and r.verification_status = 'user_verified'
    )
    order by o.name, m.name
  `;
  const missingSubs: ExistingMissingSubmission[] = missingRows.map((m) => ({
    orgUnitId: m.org_unit_id,
    orgUnitName: m.org_unit_name,
    metricName: m.metric_name,
    categoryName: m.category_name,
  }));

  // 5. Reuse BRSR Mapping Readiness
  const [indicators, mappings, approvedCounts] = await Promise.all([
    sql<{ id: string }[]>`select id from public.brsr_indicators where deleted_at is null`,
    sql<{ indicator_id: string; metric_id: string }[]>`
      select brsr_indicator_id as indicator_id, esg_metric_id as metric_id from public.brsr_metric_mappings
    `,
    sql<{ metric_id: string; approved_count: number }[]>`
      select metric_id, count(*)::int as approved_count
      from public.esg_records
      where org_unit_id = ${orgUnitId}
        and reporting_period_id = ${reportingPeriodId}
        and verification_status = 'user_verified'
        and approval_status = 'approved'
      group by metric_id
    `,
  ]);

  const approvedMap = new Map(approvedCounts.map((a) => [a.metric_id, a.approved_count]));
  let completeCount = 0;
  let partialCount = 0;
  let missingEvidenceCount = 0;
  let notMappedCount = 0;

  for (const ind of indicators) {
    const indicatorMappings = mappings.filter((m) => m.indicator_id === ind.id);
    const metricsForInd = indicatorMappings.map((m) => ({
      applicable: true,
      approved: approvedMap.get(m.metric_id) ?? 0,
    }));

    let status: "complete" | "partial" | "missing" | "not_mapped" = "not_mapped";
    if (metricsForInd.length === 0) {
      status = "not_mapped";
    } else {
      const approvedCount = metricsForInd.filter((m) => m.approved > 0).length;
      if (approvedCount === metricsForInd.length) status = "complete";
      else if (approvedCount > 0) status = "partial";
      else status = "missing";
    }

    if (status === "complete") completeCount++;
    else if (status === "partial") partialCount++;
    else if (status === "missing") missingEvidenceCount++;
    else if (status === "not_mapped") notMappedCount++;
  }

  const brsrReadiness: ExistingBrsrReadinessSummary = {
    totalIndicators: indicators.length,
    completeCount,
    partialCount,
    missingEvidenceCount,
    notMappedCount,
  };

  // 6. Pure Risk Engine Evaluation
  const report = evaluateEsgRisks({
    features,
    validationAnomalies,
    validationDuplicates,
    missingSubmissions: missingSubs,
    brsrReadiness,
  });

  // 7. Persist Assessment in risk_evaluation_reports (upsert)
  const categoryAssessmentsJson = JSON.stringify(report.categoryAssessments);
  const featuresJson = JSON.stringify(features);

  await sql`
    insert into public.risk_evaluation_reports (
      org_unit_id, reporting_period_id, overall_risk_level, overall_risk_score,
      high_or_critical_count, executive_summary, disclaimer,
      category_assessments, features_snapshot, evaluated_at
    ) values (
      ${orgUnitId}, ${reportingPeriodId}, ${report.overallRiskLevel}, ${report.overallRiskScore},
      ${report.highOrCriticalCount}, ${report.executiveSummary}, ${report.disclaimer},
      ${categoryAssessmentsJson}::jsonb, ${featuresJson}::jsonb, now()
    )
    on conflict (org_unit_id, reporting_period_id) do update set
      overall_risk_level = excluded.overall_risk_level,
      overall_risk_score = excluded.overall_risk_score,
      high_or_critical_count = excluded.high_or_critical_count,
      executive_summary = excluded.executive_summary,
      disclaimer = excluded.disclaimer,
      category_assessments = excluded.category_assessments,
      features_snapshot = excluded.features_snapshot,
      evaluated_at = now()
  `;

  return report;
}

/**
 * Loads an existing risk assessment report or dynamically evaluates and saves one.
 */
export async function getRiskReport(
  sql: Sql,
  params: { orgUnitId: string; reportingPeriodId: string },
): Promise<RiskAssessmentReport> {
  const { orgUnitId, reportingPeriodId } = params;

  const rows = await sql<RiskEvaluationReportRow[]>`
    select * from public.risk_evaluation_reports
    where org_unit_id = ${orgUnitId} and reporting_period_id = ${reportingPeriodId}
    limit 1
  `;

  if (rows.length === 0) {
    return evaluateAndSaveRisks(sql, { orgUnitId, reportingPeriodId });
  }

  const r = rows[0];
  const categoryAssessments =
    typeof r.category_assessments === "string"
      ? JSON.parse(r.category_assessments)
      : r.category_assessments;
  const featuresSnapshot =
    typeof r.features_snapshot === "string" ? JSON.parse(r.features_snapshot) : r.features_snapshot;
  const assessmentsList = Object.values(categoryAssessments) as CategoryRiskAssessment[];

  return {
    reportingPeriod: featuresSnapshot?.reportingPeriod ?? "Current Period",
    orgUnitId,
    orgUnitName: featuresSnapshot?.orgUnitName ?? "Selected Facility",
    overallRiskLevel: r.overall_risk_level as any,
    overallRiskScore: Number(r.overall_risk_score),
    categoryAssessments,
    assessmentsList,
    highOrCriticalCount: Number(r.high_or_critical_count),
    executiveSummary: r.executive_summary,
    disclaimer: r.disclaimer,
    evaluatedAt: r.evaluated_at,
  };
}
