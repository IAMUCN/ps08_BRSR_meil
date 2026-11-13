import { z } from "zod";
import type { EsgFeatureSet } from "../features/engine";

export const riskCategoryEnum = z.enum([
  "EMISSIONS_INCREASE",
  "UNUSUAL_CONSUMPTION",
  "MISSING_BRSR_EVIDENCE",
  "DUPLICATE_INVOICES",
  "INCOMPLETE_REPORTING",
  "UNUSUAL_WATER_USAGE",
]);
export type RiskCategory = z.infer<typeof riskCategoryEnum>;

export const riskLevelEnum = z.enum(["PASS", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type RiskLevel = z.infer<typeof riskLevelEnum>;

export const RISK_CATEGORY_META: Record<
  RiskCategory,
  { label: string; detectionMethod: string; description: string; weight: number }
> = {
  EMISSIONS_INCREASE: {
    label: "Emissions increase",
    detectionMethod: "Historical comparison",
    description:
      "Evaluates growth in total and per-unit normalized emissions across reporting periods.",
    weight: 0.25,
  },
  UNUSUAL_CONSUMPTION: {
    label: "Unusual consumption",
    detectionMethod: "Statistical anomaly detection",
    description:
      "Detects statistical outliers and variance against historical median activity levels.",
    weight: 0.2,
  },
  MISSING_BRSR_EVIDENCE: {
    label: "Missing BRSR evidence",
    detectionMethod: "Mapping readiness",
    description:
      "Audits unverified records, low OCR confidence, and unbacked BRSR Core indicators.",
    weight: 0.2,
  },
  DUPLICATE_INVOICES: {
    label: "Duplicate invoices",
    detectionMethod: "Existing validation engine",
    description:
      "Identifies duplicate invoice numbers and redundant submissions across periods and units.",
    weight: 0.15,
  },
  INCOMPLETE_REPORTING: {
    label: "Incomplete reporting",
    detectionMethod: "Submission monitoring",
    description:
      "Tracks expected activity submissions that have not been filed by assigned site owners.",
    weight: 0.1,
  },
  UNUSUAL_WATER_USAGE: {
    label: "Unusual water usage",
    detectionMethod: "Historical anomaly analysis",
    description: "Monitors spikes in net water withdrawal and deficits in recycled water ratios.",
    weight: 0.1,
  },
};

export type ExistingValidationAnomaly = {
  recordId: string;
  metricName: string;
  metricCode?: string;
  ruleType: string;
  result: "flagged" | "fail";
  message: string;
  isWaterMetric?: boolean;
};

export type ExistingDuplicateFinding = {
  recordId: string;
  metricName: string;
  invoiceNumber?: string | null;
  message: string;
};

export type ExistingMissingSubmission = {
  orgUnitId: string;
  orgUnitName: string;
  metricName: string;
  categoryName: string;
};

export type ExistingBrsrReadinessSummary = {
  totalIndicators: number;
  completeCount: number;
  partialCount: number;
  missingEvidenceCount: number;
  notMappedCount: number;
};

export type RiskEvaluationInput = {
  features: EsgFeatureSet;
  validationAnomalies?: ExistingValidationAnomaly[];
  validationDuplicates?: ExistingDuplicateFinding[];
  missingSubmissions?: ExistingMissingSubmission[];
  brsrReadiness?: ExistingBrsrReadinessSummary;
};

export type CategoryRiskAssessment = {
  category: RiskCategory;
  categoryLabel: string;
  detectionMethod: string;
  level: RiskLevel;
  score: number; // 0 to 100
  title: string;
  summary: string;
  findings: string[];
  contributingRecordIds: string[];
  metrics: Record<string, number | string | null>;
  recommendedRemediation: string;
};

export type RiskAssessmentReport = {
  reportingPeriod: string;
  orgUnitId?: string;
  orgUnitName?: string;
  overallRiskLevel: RiskLevel;
  overallRiskScore: number; // 0 - 100
  categoryAssessments: Record<RiskCategory, CategoryRiskAssessment>;
  assessmentsList: CategoryRiskAssessment[];
  highOrCriticalCount: number;
  executiveSummary: string;
  disclaimer: string;
  evaluatedAt: string;
};

export const STANDARD_RISK_DISCLAIMER =
  "This assesses operational and reporting compliance risks. It supports internal audit and does not establish regulatory penalties.";

/**
 * Pure Risk Engine for EmeilSG.
 * Reuses existing historical anomaly checks, validation outcomes, BRSR readiness mappings,
 * and submission monitoring without implementing competing duplicate or anomaly subsystems.
 */
export function evaluateEsgRisks(input: RiskEvaluationInput): RiskAssessmentReport {
  const {
    features,
    validationAnomalies = [],
    validationDuplicates = [],
    missingSubmissions = [],
    brsrReadiness = {
      totalIndicators: 0,
      completeCount: 0,
      partialCount: 0,
      missingEvidenceCount: 0,
      notMappedCount: 0,
    },
  } = input;

  // 1. Category: EMISSIONS_INCREASE (Historical comparison)
  const emissionsMeta = RISK_CATEGORY_META.EMISSIONS_INCREASE;
  const growth = features.emissions_growth;
  const zScore = features.anomaly_z_score;
  const intensityGrowth = features.production_intensity_growth;

  let emissionsLevel: RiskLevel = "PASS";
  let emissionsScore = 0;
  const emissionsFindings: string[] = [];

  if (growth !== null && growth > 0.35) {
    emissionsLevel = "CRITICAL";
    emissionsScore = 90;
    emissionsFindings.push(`Total verified emissions surged by ${(growth * 100).toFixed(1)}% YoY.`);
  } else if ((growth !== null && growth > 0.2) || (zScore !== null && zScore > 2.0)) {
    emissionsLevel = "HIGH";
    emissionsScore = 75;
    emissionsFindings.push(
      growth !== null
        ? `Total verified emissions increased by ${(growth * 100).toFixed(1)}% YoY.`
        : `Emissions z-score (${zScore?.toFixed(2)}) indicates statistical divergence from historical baseline.`,
    );
  } else if ((growth !== null && growth > 0.1) || (zScore !== null && zScore > 1.2)) {
    emissionsLevel = "MEDIUM";
    emissionsScore = 50;
    emissionsFindings.push(
      growth !== null
        ? `Moderate emissions increase of ${(growth * 100).toFixed(1)}% detected.`
        : `Emissions sit slightly above historical average.`,
    );
  } else if (growth !== null && growth > 0.0) {
    emissionsLevel = "LOW";
    emissionsScore = 25;
    emissionsFindings.push(`Mild emissions growth of ${(growth * 100).toFixed(1)}% observed.`);
  } else {
    emissionsFindings.push(
      "Emissions trajectory is stable or declining compared to historical periods.",
    );
  }

  // Production size normalization adjustment
  if (features.has_production_data && intensityGrowth !== null) {
    if (intensityGrowth <= 0.02 && emissionsLevel !== "PASS") {
      emissionsFindings.push(
        `Production normalization note: Absolute emissions rose, but carbon intensity per unit (${features.emissions_per_production_unit} tCO2e/${features.production_unit ?? "unit"}) grew by only ${(intensityGrowth * 100).toFixed(1)}%.`,
      );
      if (emissionsLevel === "CRITICAL") emissionsLevel = "HIGH";
      else if (emissionsLevel === "HIGH") emissionsLevel = "MEDIUM";
      emissionsScore = Math.max(10, emissionsScore - 15);
    } else if (intensityGrowth > 0.15) {
      emissionsFindings.push(
        `Warning: Carbon intensity per unit output escalated by ${(intensityGrowth * 100).toFixed(1)}%, indicating efficiency regression.`,
      );
    }
  }

  const emissionsAssessment: CategoryRiskAssessment = {
    category: "EMISSIONS_INCREASE",
    categoryLabel: emissionsMeta.label,
    detectionMethod: emissionsMeta.detectionMethod,
    level: emissionsLevel,
    score: emissionsScore,
    title:
      emissionsLevel === "PASS"
        ? "Emissions Trajectory Stable"
        : `${emissionsLevel} Risk: GHG Emissions Escalation`,
    summary:
      emissionsFindings[0] ??
      "Historical comparison completed against preceding reporting periods.",
    findings: emissionsFindings,
    contributingRecordIds: [],
    metrics: {
      emissions_growth: growth,
      anomaly_z_score: zScore,
      production_intensity_growth: intensityGrowth,
      total_emissions_tco2e: features.total_emissions,
      previous_total_emissions_tco2e: features.previous_total_emissions,
    },
    recommendedRemediation:
      emissionsLevel === "PASS"
        ? "Maintain current energy efficiency benchmarks."
        : "Conduct equipment energy audit and accelerate captive renewable off-take to curb scope expansion.",
  };

  // 2. Category: UNUSUAL_CONSUMPTION (Statistical anomaly detection)
  const consumptionMeta = RISK_CATEGORY_META.UNUSUAL_CONSUMPTION;
  const nonWaterAnomalies = validationAnomalies.filter((a) => !a.isWaterMetric);
  let consumptionLevel: RiskLevel = "PASS";
  let consumptionScore = 0;
  const consumptionFindings: string[] = [];

  const failingAnomalies = nonWaterAnomalies.filter((a) => a.result === "fail");
  const flaggedAnomalies = nonWaterAnomalies.filter((a) => a.result === "flagged");

  if (failingAnomalies.length > 0 || nonWaterAnomalies.length >= 4) {
    consumptionLevel = "CRITICAL";
    consumptionScore = 95;
    consumptionFindings.push(
      `Detected ${nonWaterAnomalies.length} statistical anomaly checks from validation engine (${failingAnomalies.length} hard failures).`,
    );
  } else if (nonWaterAnomalies.length >= 2 || Math.abs(features.anomaly_z_score ?? 0) >= 2.0) {
    consumptionLevel = "HIGH";
    consumptionScore = 70;
    consumptionFindings.push(
      `Detected ${nonWaterAnomalies.length} statistical anomaly flags from validation engine.`,
    );
  } else if (nonWaterAnomalies.length === 1 || Math.abs(features.anomaly_z_score ?? 0) >= 1.4) {
    consumptionLevel = "MEDIUM";
    consumptionScore = 45;
    consumptionFindings.push(
      `Detected 1 statistical consumption anomaly requiring validation queue acknowledgment.`,
    );
  } else {
    consumptionFindings.push("No statistical consumption anomalies flagged by validation engine.");
  }

  for (const anom of nonWaterAnomalies.slice(0, 3)) {
    consumptionFindings.push(`${anom.metricName}: ${anom.message}`);
  }

  const consumptionAssessment: CategoryRiskAssessment = {
    category: "UNUSUAL_CONSUMPTION",
    categoryLabel: consumptionMeta.label,
    detectionMethod: consumptionMeta.detectionMethod,
    level: consumptionLevel,
    score: consumptionScore,
    title:
      consumptionLevel === "PASS"
        ? "Activity Consumption In Normal Range"
        : `${consumptionLevel} Risk: Statistical Consumption Outlier`,
    summary:
      consumptionFindings[0] ?? "Statistical anomaly analysis completed on submitted records.",
    findings: consumptionFindings,
    contributingRecordIds: nonWaterAnomalies.map((a) => a.recordId),
    metrics: {
      total_anomalies_flagged: nonWaterAnomalies.length,
      anomaly_z_score: features.anomaly_z_score,
      electricity_growth: features.electricity_growth,
    },
    recommendedRemediation:
      consumptionLevel === "PASS"
        ? "No anomaly resolution required."
        : "Review flagged records in the Validation Queue and inspect facility sub-meter calibration.",
  };

  // 3. Category: MISSING_BRSR_EVIDENCE (Mapping readiness)
  const evidenceMeta = RISK_CATEGORY_META.MISSING_BRSR_EVIDENCE;
  const totalBrsr = brsrReadiness.totalIndicators;
  const missingBrsr = brsrReadiness.missingEvidenceCount;
  const partialBrsr = brsrReadiness.partialCount;
  const missingRatio = totalBrsr > 0 ? missingBrsr / totalBrsr : 0;
  const coveragePct = features.evidence_coverage_percent;

  let evidenceLevel: RiskLevel = "PASS";
  let evidenceScore = 0;
  const evidenceFindings: string[] = [];

  if (missingRatio >= 0.35 || coveragePct < 50 || features.missing_evidence_count > 15) {
    evidenceLevel = "CRITICAL";
    evidenceScore = 90;
    evidenceFindings.push(
      `Severe evidence gap: ${missingBrsr} of ${totalBrsr} mapped BRSR indicators have zero verified evidence (${(missingRatio * 100).toFixed(0)}% missing).`,
    );
  } else if (missingRatio >= 0.15 || coveragePct < 75 || features.missing_evidence_count > 5) {
    evidenceLevel = "HIGH";
    evidenceScore = 70;
    evidenceFindings.push(
      `${missingBrsr} BRSR indicators lack approved evidence; document coverage is at ${coveragePct.toFixed(1)}%.`,
    );
  } else if (missingBrsr > 0 || partialBrsr > 0 || features.missing_evidence_count > 0) {
    evidenceLevel = "MEDIUM";
    evidenceScore = 45;
    evidenceFindings.push(
      `${missingBrsr} indicators missing evidence, ${partialBrsr} partially fulfilled (${features.missing_evidence_count} unbacked records).`,
    );
  } else {
    evidenceFindings.push("All applicable BRSR indicators have complete documentary evidence.");
  }

  evidenceFindings.push(
    `Data Quality Assurance Score: ${features.data_quality_score}/100 (${features.data_quality_status}). Evidence proof coverage: ${coveragePct.toFixed(1)}%.`,
  );

  const evidenceAssessment: CategoryRiskAssessment = {
    category: "MISSING_BRSR_EVIDENCE",
    categoryLabel: evidenceMeta.label,
    detectionMethod: evidenceMeta.detectionMethod,
    level: evidenceLevel,
    score: evidenceScore,
    title:
      evidenceLevel === "PASS"
        ? "BRSR Evidence Readiness Complete"
        : `${evidenceLevel} Risk: Inadequate BRSR Evidence Proof`,
    summary:
      evidenceFindings[0] ?? "Assessed documentary evidence against mapped BRSR Core indicators.",
    findings: evidenceFindings,
    contributingRecordIds: [],
    metrics: {
      missing_brsr_indicators: missingBrsr,
      partial_brsr_indicators: partialBrsr,
      total_brsr_indicators: totalBrsr,
      missing_evidence_records: features.missing_evidence_count,
      evidence_coverage_percent: coveragePct,
      data_quality_score: features.data_quality_score,
    },
    recommendedRemediation:
      evidenceLevel === "PASS"
        ? "Maintain current digital document retention protocol."
        : "Upload third-party utility invoices and test certificates for unbacked indicators before audit closure.",
  };

  // 4. Category: DUPLICATE_INVOICES (Existing validation engine)
  const duplicateMeta = RISK_CATEGORY_META.DUPLICATE_INVOICES;
  const duplicateCount = validationDuplicates.length;
  let duplicateLevel: RiskLevel = "PASS";
  let duplicateScore = 0;
  const duplicateFindings: string[] = [];

  if (duplicateCount >= 5) {
    duplicateLevel = "CRITICAL";
    duplicateScore = 95;
    duplicateFindings.push(
      `Detected ${duplicateCount} duplicate invoice submissions across facility records.`,
    );
  } else if (duplicateCount >= 2) {
    duplicateLevel = "HIGH";
    duplicateScore = 75;
    duplicateFindings.push(`Detected ${duplicateCount} duplicate invoice submissions.`);
  } else if (duplicateCount === 1) {
    duplicateLevel = "MEDIUM";
    duplicateScore = 50;
    duplicateFindings.push(`Detected 1 duplicate invoice flagged by existing validation engine.`);
  } else {
    duplicateFindings.push("No duplicate invoices detected by validation engine checks.");
  }

  for (const dup of validationDuplicates.slice(0, 3)) {
    duplicateFindings.push(
      dup.invoiceNumber
        ? `Invoice #${dup.invoiceNumber} (${dup.metricName}): ${dup.message}`
        : `${dup.metricName}: ${dup.message}`,
    );
  }

  const duplicateAssessment: CategoryRiskAssessment = {
    category: "DUPLICATE_INVOICES",
    categoryLabel: duplicateMeta.label,
    detectionMethod: duplicateMeta.detectionMethod,
    level: duplicateLevel,
    score: duplicateScore,
    title:
      duplicateLevel === "PASS"
        ? "Invoice Uniqueness Verified"
        : `${duplicateLevel} Risk: Duplicate Invoices Flagged`,
    summary:
      duplicateFindings[0] ??
      "Evaluated invoice uniqueness using existing validation engine check results.",
    findings: duplicateFindings,
    contributingRecordIds: validationDuplicates.map((d) => d.recordId),
    metrics: {
      duplicate_invoices_count: duplicateCount,
    },
    recommendedRemediation:
      duplicateLevel === "PASS"
        ? "No duplicate remediation needed."
        : "Reject or deduplicate redundant records in the Validation Queue to avoid double counting emissions.",
  };

  // 5. Category: INCOMPLETE_REPORTING (Submission monitoring)
  const submissionMeta = RISK_CATEGORY_META.INCOMPLETE_REPORTING;
  const missingCount = missingSubmissions.length;
  let submissionLevel: RiskLevel = "PASS";
  let submissionScore = 0;
  const submissionFindings: string[] = [];

  if (missingCount >= 8) {
    submissionLevel = "CRITICAL";
    submissionScore = 90;
    submissionFindings.push(
      `Major reporting gap: ${missingCount} expected activity submissions remain unfiled for this period.`,
    );
  } else if (missingCount >= 4) {
    submissionLevel = "HIGH";
    submissionScore = 70;
    submissionFindings.push(
      `${missingCount} expected submissions are missing from submission monitoring.`,
    );
  } else if (missingCount >= 1) {
    submissionLevel = "MEDIUM";
    submissionScore = 40;
    submissionFindings.push(
      `${missingCount} expected activity submission(s) pending upload from site assignees.`,
    );
  } else {
    submissionFindings.push("All expected activity submissions have been filed.");
  }

  for (const sub of missingSubmissions.slice(0, 3)) {
    submissionFindings.push(
      `${sub.orgUnitName} missing "${sub.metricName}" (${sub.categoryName}).`,
    );
  }

  const submissionAssessment: CategoryRiskAssessment = {
    category: "INCOMPLETE_REPORTING",
    categoryLabel: submissionMeta.label,
    detectionMethod: submissionMeta.detectionMethod,
    level: submissionLevel,
    score: submissionScore,
    title:
      submissionLevel === "PASS"
        ? "Submission Pipeline 100% Filed"
        : `${submissionLevel} Risk: Missing Expected Submissions`,
    summary:
      submissionFindings[0] ??
      "Audited unfiled submissions using Submission Monitoring expectations.",
    findings: submissionFindings,
    contributingRecordIds: [],
    metrics: {
      missing_expected_submissions: missingCount,
      unverified_pending_count: features.unverified_pending_count,
    },
    recommendedRemediation:
      submissionLevel === "PASS"
        ? "All submissions on track."
        : "Dispatch automated submission reminder notices to responsible site project managers.",
  };

  // 6. Category: UNUSUAL_WATER_USAGE (Historical anomaly analysis)
  const waterMeta = RISK_CATEGORY_META.UNUSUAL_WATER_USAGE;
  const waterAnomalies = validationAnomalies.filter((a) => a.isWaterMetric);
  const waterGrowth = features.water_consumption_growth;
  const waterRecycle = features.water_recycle_rate;

  let waterLevel: RiskLevel = "PASS";
  let waterScore = 0;
  const waterFindings: string[] = [];

  if (
    waterAnomalies.some((a) => a.result === "fail") ||
    (waterGrowth !== null && waterGrowth > 0.35)
  ) {
    waterLevel = "CRITICAL";
    waterScore = 90;
    waterFindings.push(
      waterGrowth !== null
        ? `Net water consumption spiked by ${(waterGrowth * 100).toFixed(1)}% YoY.`
        : `Critical water consumption anomaly detected by validation engine.`,
    );
  } else if (
    waterAnomalies.length > 0 ||
    (waterGrowth !== null && waterGrowth > 0.2) ||
    waterRecycle < 0.15
  ) {
    waterLevel = "HIGH";
    waterScore = 70;
    waterFindings.push(
      waterGrowth !== null
        ? `Water consumption increased by ${(waterGrowth * 100).toFixed(1)}% with low recycling rate (${(waterRecycle * 100).toFixed(1)}%).`
        : `Water usage anomaly flagged by validation engine.`,
    );
  } else if ((waterGrowth !== null && waterGrowth > 0.1) || waterRecycle < 0.25) {
    waterLevel = "MEDIUM";
    waterScore = 40;
    waterFindings.push(
      `Moderate water consumption growth (${waterGrowth !== null ? (waterGrowth * 100).toFixed(1) + "%" : "N/A"}) or below-target recycle rate (${(waterRecycle * 100).toFixed(1)}%).`,
    );
  } else {
    waterFindings.push(
      "Water consumption trends and recycling ratios remain within historical parameters.",
    );
  }

  for (const anom of waterAnomalies.slice(0, 2)) {
    waterFindings.push(`Validation flag: ${anom.metricName} — ${anom.message}`);
  }

  const waterAssessment: CategoryRiskAssessment = {
    category: "UNUSUAL_WATER_USAGE",
    categoryLabel: waterMeta.label,
    detectionMethod: waterMeta.detectionMethod,
    level: waterLevel,
    score: waterScore,
    title:
      waterLevel === "PASS"
        ? "Water Usage Trends Normal"
        : `${waterLevel} Risk: Water Consumption Anomaly`,
    summary:
      waterFindings[0] ??
      "Historical anomaly analysis completed on water withdrawal and discharge.",
    findings: waterFindings,
    contributingRecordIds: waterAnomalies.map((a) => a.recordId),
    metrics: {
      water_consumption_growth: waterGrowth,
      water_recycle_rate: waterRecycle,
      current_water_consumption_kl: features.current_water_consumption,
      water_anomalies_flagged: waterAnomalies.length,
    },
    recommendedRemediation:
      waterLevel === "PASS"
        ? "Continue closed-loop water conservation protocols."
        : "Verify ultrasonic flow meter calibration and inspect pipeline hydrostatic test loops for leakage.",
  };

  // Compile Assessments
  const categoryAssessments: Record<RiskCategory, CategoryRiskAssessment> = {
    EMISSIONS_INCREASE: emissionsAssessment,
    UNUSUAL_CONSUMPTION: consumptionAssessment,
    MISSING_BRSR_EVIDENCE: evidenceAssessment,
    DUPLICATE_INVOICES: duplicateAssessment,
    INCOMPLETE_REPORTING: submissionAssessment,
    UNUSUAL_WATER_USAGE: waterAssessment,
  };

  const assessmentsList = Object.values(categoryAssessments);

  // Overall Risk Score: Weighted average
  let overallScore = 0;
  for (const item of assessmentsList) {
    overallScore += item.score * RISK_CATEGORY_META[item.category].weight;
  }
  overallScore = Math.round(overallScore);

  // Overall Risk Level
  const highOrCriticalCount = assessmentsList.filter(
    (a) => a.level === "HIGH" || a.level === "CRITICAL",
  ).length;

  let overallRiskLevel: RiskLevel = "PASS";
  if (assessmentsList.some((a) => a.level === "CRITICAL") || overallScore >= 70) {
    overallRiskLevel = "CRITICAL";
  } else if (assessmentsList.some((a) => a.level === "HIGH") || overallScore >= 50) {
    overallRiskLevel = "HIGH";
  } else if (assessmentsList.some((a) => a.level === "MEDIUM") || overallScore >= 30) {
    overallRiskLevel = "MEDIUM";
  } else if (overallScore > 10) {
    overallRiskLevel = "LOW";
  }

  const executiveSummary = [
    `Comprehensive ESG & BRSR Risk Assessment for ${features.reportingPeriod} (${features.orgUnitName ?? "Consolidated Group"}):`,
    `Assessed 6 risk categories yielding an aggregate risk score of ${overallScore}/100 (${overallRiskLevel} RISK).`,
    highOrCriticalCount > 0
      ? `Flagged ${highOrCriticalCount} high/critical risk domains requiring immediate intervention before statutory filing: ${assessmentsList
          .filter((a) => a.level === "HIGH" || a.level === "CRITICAL")
          .map((a) => a.categoryLabel)
          .join(", ")}.`
      : "All operational and reporting risk vectors are within standard acceptable tolerances.",
    `Audit Disclaimer: ${STANDARD_RISK_DISCLAIMER}`,
  ].join(" ");

  return {
    reportingPeriod: features.reportingPeriod,
    orgUnitId: features.orgUnitId,
    orgUnitName: features.orgUnitName,
    overallRiskLevel,
    overallRiskScore: overallScore,
    categoryAssessments,
    assessmentsList,
    highOrCriticalCount,
    executiveSummary,
    disclaimer: STANDARD_RISK_DISCLAIMER,
    evaluatedAt: new Date().toISOString(),
  };
}
