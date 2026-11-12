import { z } from "zod";
import type { EsgFeatureSet } from "../features/engine";
import type { RuleEvaluationResult } from "../rules/engine";
import type { RiskAssessmentReport } from "../risks/engine";

export const recommendationPriorityEnum = z.enum(["low", "medium", "high", "critical"]);
export type RecommendationPriority = z.infer<typeof recommendationPriorityEnum>;

export type RecommendationCategory =
  | "energy_efficiency"
  | "renewable_energy"
  | "fuel_and_fleet"
  | "materials_and_process"
  | "water_management"
  | "waste_management"
  | "data_governance"
  | string;

export const recommendationConfidenceEnum = z.enum(["low", "medium", "high"]);
export type RecommendationConfidence = z.infer<typeof recommendationConfidenceEnum>;

export type RankingWeights = {
  impact: number;
  urgency: number;
  feasibility: number;
  confidence: number;
};

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  impact: 0.35,
  urgency: 0.25,
  feasibility: 0.2,
  confidence: 0.2,
};

export const RANKING_CALIBRATION_NOTE =
  "These are proposed starting weights, not scientifically validated ESG standards. Calibrate them with domain experts and user feedback.";

export type RankingComponents = {
  impact: number; // 0 - 100
  urgency: number; // 0 - 100
  feasibility: number; // 0 - 100
  confidence: number; // 0 - 100
};

export type RecommendationRanking = {
  score: number; // 0 - 100
  rank: number;
  components: RankingComponents;
  weights: RankingWeights;
  calibrationNote: string;
};

export type Recommendation = {
  id: string;
  title: string;
  priority: RecommendationPriority;
  category: string;
  reason: string;
  evidence_ids: string[];
  expected_impact: number | null;
  impact_unit: string;
  estimated_cost: number | null;
  missing_inputs_explanation: string | null;
  confidence: RecommendationConfidence;
  requires_approval: boolean;
  ranking: RecommendationRanking;
  status?: "open" | "in_review" | "approved" | "implemented" | "dismissed";
  assigned_to?: string | null;
};

export type RecommendationsReport = {
  reportingPeriod: string;
  orgUnitId?: string;
  orgUnitName?: string;
  recommendations: Recommendation[];
  weightsUsed: RankingWeights;
  totalCount: number;
  byPriority: Record<RecommendationPriority, number>;
  calibrationDisclaimer: string;
  generatedAt: string;
};

export type RecommendationGeneratorOptions = {
  weights?: Partial<RankingWeights>;
  customFeasibilityOverrides?: Record<string, number>;
};

/**
 * Normalizes Urgency (U) to 0–100.
 */
export function calculateUrgencyScore(priority: RecommendationPriority): number {
  switch (priority) {
    case "critical":
      return 100;
    case "high":
      return 75;
    case "medium":
      return 50;
    case "low":
      return 25;
    default:
      return 50;
  }
}

/**
 * Normalizes Data Confidence (D) to 0–100.
 */
export function calculateConfidenceScore(
  confidence: RecommendationConfidence,
  dataQualityScore?: number | null,
): number {
  let base = 60;
  switch (confidence) {
    case "high":
      base = 90;
      break;
    case "medium":
      base = 65;
      break;
    case "low":
      base = 35;
      break;
  }

  if (typeof dataQualityScore === "number") {
    // Blend with verified data quality assurance score (0 - 100)
    return Math.round(base * 0.7 + dataQualityScore * 0.3);
  }
  return base;
}

/**
 * Computes transparent weighted score: Score = 0.35I + 0.25U + 0.20F + 0.20D
 * All components normalized to 0–100.
 */
export function computeRecommendationScore(
  components: RankingComponents,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): number {
  const sumWeights = weights.impact + weights.urgency + weights.feasibility + weights.confidence;
  const wI = weights.impact / (sumWeights || 1);
  const wU = weights.urgency / (sumWeights || 1);
  const wF = weights.feasibility / (sumWeights || 1);
  const wD = weights.confidence / (sumWeights || 1);

  const raw =
    wI * components.impact +
    wU * components.urgency +
    wF * components.feasibility +
    wD * components.confidence;
  return Number(Math.max(0, Math.min(100, raw)).toFixed(2));
}

/**
 * Generates transparent recommendations from verified features, triggered rules, and risk evaluations.
 * Adheres strictly to the rule: "Don't invent financial savings, reductions or payback periods.
 * If necessary inputs are missing, return null and explain what is missing."
 */
export function generateRecommendations(
  features: EsgFeatureSet,
  ruleResults: RuleEvaluationResult[] = [],
  riskReport?: RiskAssessmentReport | null,
  options: RecommendationGeneratorOptions = {},
): RecommendationsReport {
  const weights: RankingWeights = {
    ...DEFAULT_RANKING_WEIGHTS,
    ...options.weights,
  };

  const triggeredRules = new Map(
    ruleResults.filter((r) => r.triggered).map((r) => [r.ruleCode, r]),
  );
  const rawList: Omit<Recommendation, "ranking">[] = [];

  const verifiedEvidenceIds = (
    ruleResults.find((r) => r.traceableRecordIds.length > 0)?.traceableRecordIds ?? []
  ).slice(0, 10);

  // 1. Electricity Surge Recommendation
  if (
    triggeredRules.has("RULE_ELEC_GROWTH_THRESHOLD") ||
    triggeredRules.has("ELEC_GROWTH_ALERT") ||
    (features.electricity_growth !== null && features.electricity_growth > 0.15)
  ) {
    const rule =
      triggeredRules.get("RULE_ELEC_GROWTH_THRESHOLD") ?? triggeredRules.get("ELEC_GROWTH_ALERT");
    rawList.push({
      id: "REC-ELEC-01",
      title: "Investigate electricity consumption",
      priority: "high",
      category: "energy_efficiency",
      reason: "Consumption exceeded the configured threshold.",
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Sub-meter hourly breakdown and equipment baseline ratings are missing. Conduct a sub-facility energy audit before estimating kWh or tCO2e reduction.",
      confidence: features.data_quality_score >= 80 ? "high" : "medium",
      requires_approval: true,
    });
  }

  // 2. Low Renewable Share Recommendation
  if (
    features.renewable_share < 0.2 ||
    triggeredRules.has("RULE_RENEWABLE_TARGET") ||
    triggeredRules.has("LOW_RENEWABLE_SHARE")
  ) {
    const rule =
      triggeredRules.get("RULE_RENEWABLE_TARGET") ?? triggeredRules.get("LOW_RENEWABLE_SHARE");
    rawList.push({
      id: "REC-RENEWABLE-02",
      title: "Assess Green Energy Open Access (GEOA) solar off-take",
      priority: "medium",
      category: "renewable_energy",
      reason: `Renewable electricity share sits at ${(features.renewable_share * 100).toFixed(1)}%, below the 20% operational threshold.`,
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "State DISCOM wheeling tariff schedule and grid interconnection capacity study are required to compute financial savings and exact contracted tCO2e avoided.",
      confidence: "medium",
      requires_approval: true,
    });
  }

  // 3. Diesel Generator / Scope 1 Dominance Recommendation
  if (
    features.scope1_contribution > 0.35 ||
    triggeredRules.has("RULE_SCOPE1_DOMINANCE") ||
    triggeredRules.has("SCOPE1_DOMINANCE")
  ) {
    const rule =
      triggeredRules.get("RULE_SCOPE1_DOMINANCE") ?? triggeredRules.get("SCOPE1_DOMINANCE");
    rawList.push({
      id: "REC-SCOPE1-03",
      title: "Deploy mobile BESS peak-shaving for site diesel generators",
      priority: "high",
      category: "fuel_and_fleet",
      reason:
        "Scope 1 emissions from stationary diesel generation represent over 35% of facility carbon footprint.",
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Hourly diesel generator load curves and site duty-cycle telematics are required to size the battery capacity and estimate avoided fuel litres.",
      confidence: "medium",
      requires_approval: true,
    });
  }

  // 4. Scope 3 / Supply Chain Cement & Steel Sourcing
  if (
    features.scope3_contribution > 0.55 ||
    triggeredRules.has("RULE_SCOPE3_DOMINANCE") ||
    triggeredRules.has("SCOPE3_DOMINANCE")
  ) {
    const rule =
      triggeredRules.get("RULE_SCOPE3_DOMINANCE") ?? triggeredRules.get("SCOPE3_DOMINANCE");
    rawList.push({
      id: "REC-SCOPE3-04",
      title: "Mandate low-carbon blended cement (GGBS/Fly Ash) in project BOQs",
      priority: "high",
      category: "materials_and_process",
      reason: "Scope 3 value chain emissions exceed 55% of total carbon boundary.",
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Structural engineering mix designs and supplier Environmental Product Declarations (EPDs) are required to verify replacement ratios under IS 456.",
      confidence: "medium",
      requires_approval: true,
    });
  }

  // 5. Water Consumption Surge / Anomaly
  if (
    (features.water_consumption_growth !== null && features.water_consumption_growth > 0.15) ||
    triggeredRules.has("RULE_WATER_SURGE_THRESHOLD") ||
    triggeredRules.has("WATER_CONSUMPTION_SURGE") ||
    Boolean(
      riskReport?.categoryAssessments?.UNUSUAL_WATER_USAGE?.level &&
      riskReport.categoryAssessments.UNUSUAL_WATER_USAGE.level !== "PASS",
    )
  ) {
    const rule =
      triggeredRules.get("RULE_WATER_SURGE_THRESHOLD") ??
      triggeredRules.get("WATER_CONSUMPTION_SURGE");
    const risk = riskReport?.categoryAssessments?.UNUSUAL_WATER_USAGE;
    rawList.push({
      id: "REC-WATER-05",
      title: "Audit water intake metering and inspect pipeline leakage",
      priority: "high",
      category: "water_management",
      reason: `Net water consumption increased by ${features.water_consumption_growth !== null ? (features.water_consumption_growth * 100).toFixed(1) + "%" : "anomalous levels"}.`,
      evidence_ids: rule?.traceableRecordIds.length
        ? rule.traceableRecordIds
        : (risk?.contributingRecordIds ?? []),
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Ultrasonic flow meter calibration certificates and pipe hydrostatic test logs are required to isolate leakage volume.",
      confidence: "medium",
      requires_approval: true,
    });
  }

  // 6. Waste Recycling Deficit
  if (
    features.waste_recovery_share < 0.5 ||
    triggeredRules.has("RULE_WASTE_RECOVERY_DEFICIT") ||
    triggeredRules.has("WASTE_RECOVERY_DEFICIT")
  ) {
    const rule =
      triggeredRules.get("RULE_WASTE_RECOVERY_DEFICIT") ??
      triggeredRules.get("WASTE_RECOVERY_DEFICIT");
    rawList.push({
      id: "REC-WASTE-06",
      title: "Establish on-site C&D waste crushing for granular sub-base (GSB)",
      priority: "medium",
      category: "waste_management",
      reason: `Waste recovery share is at ${(features.waste_recovery_share * 100).toFixed(1)}%, falling below the 50% recovery benchmark.`,
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Excavation concrete batching records and mobile jaw crusher hire rates are required to determine net avoided landfill haulage costs.",
      confidence: "medium",
      requires_approval: true,
    });
  }

  // 7. Data Quality & Missing Evidence Governance
  if (
    features.data_quality_score < 75 ||
    features.missing_evidence_count > 0 ||
    triggeredRules.has("RULE_DATA_QUALITY_AUDIT") ||
    triggeredRules.has("DATA_QUALITY_AUDIT_RISK") ||
    Boolean(
      riskReport?.categoryAssessments?.MISSING_BRSR_EVIDENCE?.level &&
      riskReport.categoryAssessments.MISSING_BRSR_EVIDENCE.level !== "PASS",
    )
  ) {
    const rule =
      triggeredRules.get("RULE_DATA_QUALITY_AUDIT") ??
      triggeredRules.get("DATA_QUALITY_AUDIT_RISK");
    rawList.push({
      id: "REC-DATA-07",
      title: "Enforce mandatory OCR invoice validation gate",
      priority: "critical",
      category: "data_governance",
      reason:
        "Records missing documentary proof pose qualification risk for SEBI BRSR reasonable assurance.",
      evidence_ids: rule?.traceableRecordIds.length ? rule.traceableRecordIds : verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Governance control action: outcome is measured in audit readiness assurance score (0–100) rather than physical GHG emissions reduction.",
      confidence: "high",
      requires_approval: true,
    });
  }

  // 8. Duplicate Invoice Deduplication
  if (
    riskReport?.categoryAssessments?.DUPLICATE_INVOICES?.level &&
    riskReport.categoryAssessments.DUPLICATE_INVOICES.level !== "PASS"
  ) {
    const risk = riskReport.categoryAssessments.DUPLICATE_INVOICES;
    rawList.push({
      id: "REC-DUP-08",
      title: "Deduplicate redundant invoice submissions in Validation Queue",
      priority: "high",
      category: "data_governance",
      reason: "Duplicate invoice numbers detected across submissions.",
      evidence_ids: risk.contributingRecordIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Corrective accounting action: eliminates artificial GHG double counting across historical ledger records.",
      confidence: "high",
      requires_approval: true,
    });
  }

  // Fallback: If no anomalies or alerts triggered
  if (rawList.length === 0) {
    rawList.push({
      id: "REC-GENERAL-00",
      title: "Maintain continuous energy and emissions telemetry",
      priority: "low",
      category: "energy_efficiency",
      reason:
        "All operational parameters and verification coverage currently conform to baseline standards.",
      evidence_ids: verifiedEvidenceIds,
      expected_impact: null,
      impact_unit: "not_estimated",
      estimated_cost: null,
      missing_inputs_explanation:
        "Routine supervisory monitoring: no specific equipment replacement proposed.",
      confidence: "high",
      requires_approval: false,
    });
  }

  // Rank recommendations using the weighted formula: Score = 0.35I + 0.25U + 0.20F + 0.20D
  const rankedItems = rawList.map((item) => {
    // 1. Potential Impact (I, 0 - 100)
    let impactScore = 50;
    if (item.category === "data_governance") impactScore = item.priority === "critical" ? 85 : 70;
    else if (item.category === "energy_efficiency" || item.category === "fuel_and_fleet")
      impactScore = 80;
    else if (item.category === "renewable_energy" || item.category === "materials_and_process")
      impactScore = 75;
    else if (item.category === "water_management" || item.category === "waste_management")
      impactScore = 65;

    // 2. Urgency (U, 0 - 100)
    const urgencyScore = calculateUrgencyScore(item.priority);

    // 3. Feasibility (F, 0 - 100)
    let feasibilityScore = 70;
    if (item.category === "data_governance")
      feasibilityScore = 90; // Workflow/policy changes are high feasibility
    else if (item.category === "energy_efficiency" || item.category === "water_management")
      feasibilityScore = 75; // Moderate feasibility
    else if (item.category === "fuel_and_fleet" || item.category === "renewable_energy")
      feasibilityScore = 60; // CapEx involved
    else if (item.category === "materials_and_process") feasibilityScore = 55; // Vendor supply-chain negotiation

    // 4. Data Confidence (D, 0 - 100)
    const confidenceScore = calculateConfidenceScore(item.confidence, features.data_quality_score);

    const components: RankingComponents = {
      impact: impactScore,
      urgency: urgencyScore,
      feasibility: feasibilityScore,
      confidence: confidenceScore,
    };

    const score = computeRecommendationScore(components, weights);

    return {
      ...item,
      ranking: {
        score,
        rank: 0, // Assigned after sorting
        components,
        weights,
        calibrationNote: RANKING_CALIBRATION_NOTE,
      },
    };
  });

  // Sort by score descending
  rankedItems.sort((a, b) => b.ranking.score - a.ranking.score);

  // Assign sequential rank numbers (1, 2, 3...)
  rankedItems.forEach((item, idx) => {
    item.ranking.rank = idx + 1;
  });

  const byPriority: Record<RecommendationPriority, number> = {
    critical: rankedItems.filter((r) => r.priority === "critical").length,
    high: rankedItems.filter((r) => r.priority === "high").length,
    medium: rankedItems.filter((r) => r.priority === "medium").length,
    low: rankedItems.filter((r) => r.priority === "low").length,
  };

  return {
    reportingPeriod: features.reportingPeriod,
    orgUnitId: features.orgUnitId,
    orgUnitName: features.orgUnitName,
    recommendations: rankedItems,
    weightsUsed: weights,
    totalCount: rankedItems.length,
    byPriority,
    calibrationDisclaimer: RANKING_CALIBRATION_NOTE,
    generatedAt: new Date().toISOString(),
  };
}
