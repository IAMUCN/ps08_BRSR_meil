/**
 * Feature Engine for TraceESG Decision & Suggestion Pipeline.
 *
 * Computes high-fidelity feature dictionaries using VERIFIED data only.
 * Enforces organizational size normalization (intensity metrics) and
 * data-quality / missing-evidence auditing.
 */

export type VerifiedRecordInput = {
  id: string;
  metricCode: string;
  scopeCode: "SCOPE_1" | "SCOPE_2" | "SCOPE_3" | null;
  value: number;
  valueUnit: string;
  calculatedTco2e?: number | null;
  verificationStatus: "draft" | "document_uploaded" | "ocr_completed" | "user_verified";
  validationStatus: "validated" | "flagged" | "failed";
  approvalStatus: "review_pending" | "approved" | "rejected";
  hasDocumentEvidence: boolean;
  ocrConfidence?: number | null; // 0-100
};

export type ActivityContext = {
  productionVolume?: number | null;
  productionUnit?: string | null;
  turnoverInrCr?: number | null;
  headcount?: number | null;
  floorAreaSqm?: number | null;
};

export type HistoricalPeriodObservation = {
  periodLabel: string;
  totalEmissionsTco2e: number;
  totalElectricityKwh?: number;
  waterConsumptionKl?: number;
};

export type EsgFeatureSet = {
  // Period & Scope Meta
  reportingPeriod: string;
  orgUnitId?: string;
  orgUnitName?: string;

  // Electricity & Energy Dynamics
  current_electricity: number;
  previous_electricity: number | null;
  electricity_growth: number | null;
  grid_electricity: number;
  renewable_electricity: number;
  renewable_share: number; // 0.0 - 1.0

  // Emissions & Scope Breakdown (tCO2e)
  scope1_emissions: number;
  scope2_emissions: number;
  scope3_emissions: number;
  total_emissions: number;
  previous_total_emissions: number | null;
  emissions_growth: number | null;
  scope1_contribution: number; // 0.0 - 1.0
  scope2_contribution: number; // 0.0 - 1.0
  scope3_contribution: number; // 0.0 - 1.0

  // Water Consumption Trends (kL)
  current_water_withdrawal: number;
  current_water_discharge: number;
  current_water_consumption: number; // withdrawal - discharge
  previous_water_consumption: number | null;
  water_consumption_growth: number | null;
  water_recycle_rate: number; // discharge recycled / withdrawal

  // Waste Generation Trends (tonnes)
  current_waste_generated: number;
  current_waste_recovered: number;
  previous_waste_generated: number | null;
  waste_growth: number | null;
  waste_recovery_share: number; // recovered / generated

  // Normalized Per-Unit Activity & Intensity (Size Adjustments)
  has_production_data: boolean;
  production_volume: number | null;
  production_unit: string | null;
  emissions_per_production_unit: number | null;
  previous_emissions_per_production_unit: number | null;
  production_intensity_growth: number | null;

  has_turnover_data: boolean;
  turnover_inr_cr: number | null;
  emissions_per_turnover_cr: number | null;

  has_headcount_data: boolean;
  headcount: number | null;
  emissions_per_employee: number | null;

  // Historical Averages & Anomalies
  historical_periods_evaluated: number;
  historical_average_emissions: number | null;
  historical_median_emissions: number | null;
  historical_std_dev_emissions: number | null;
  deviation_from_historical_avg: number | null; // (current - avg) / avg
  anomaly_z_score: number | null;

  // Data Quality & Verification Audit
  total_records_submitted: number;
  verified_records_count: number;
  unverified_pending_count: number;
  rejected_records_count: number;
  verification_rate: number; // 0.0 - 1.0
  evidence_coverage_percent: number; // % of verified records with documentary proof
  missing_evidence_count: number;
  ocr_low_confidence_count: number;
  data_quality_score: number; // 0 - 100
  data_quality_status: "EXCELLENT" | "SATISFACTORY" | "FLAGGED_DATA_GAPS" | "UNRELIABLE";
};

/**
 * Safely compute rate of change: (current - previous) / previous.
 * Returns null if previous is undefined, null, or zero.
 */
export function calculateGrowthRate(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Number(((current - previous) / previous).toFixed(4));
}

/**
 * Safely computes ratio: numerator / denominator. Clamped to [0, 1] when requested.
 */
export function calculateRatio(numerator: number, denominator: number, clampUnit = true): number {
  if (denominator <= 0) return 0;
  const val = numerator / denominator;
  if (!clampUnit) return Number(val.toFixed(4));
  return Number(Math.min(1, Math.max(0, val)).toFixed(4));
}

/**
 * Calculate statistical mean, median, standard deviation, and Z-score.
 */
export function calculateStatistics(
  currentValue: number,
  historicalValues: number[],
): {
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  zScore: number | null;
} {
  if (historicalValues.length === 0) {
    return { mean: null, median: null, stdDev: null, zScore: null };
  }

  const sorted = [...historicalValues].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const mean = Number((sum / n).toFixed(4));

  const mid = Math.floor(n / 2);
  const median =
    n % 2 !== 0 ? sorted[mid]! : Number(((sorted[mid - 1]! + sorted[mid]!) / 2).toFixed(4));

  if (n < 2) {
    return { mean, median, stdDev: null, zScore: null };
  }

  const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (n - 1);
  const stdDev = Number(Math.sqrt(variance).toFixed(4));

  const zScore = stdDev > 0 ? Number(((currentValue - mean) / stdDev).toFixed(4)) : 0;

  return { mean, median, stdDev, zScore };
}

/**
 * Main Pure Feature Extraction Pipeline.
 *
 * GUARANTEE: Emission and activity totals strictly use records where:
 * verificationStatus === "user_verified" AND approvalStatus === "approved"
 *
 * Unverified, draft, and pending records are strictly partitioned into
 * data-quality and missing-evidence auditing metrics.
 */
export function computeEsgFeatures(options: {
  reportingPeriodLabel: string;
  orgUnitId?: string;
  orgUnitName?: string;
  allSubmittedRecords: VerifiedRecordInput[];
  activityContext?: ActivityContext;
  previousPeriodFeatures?: Partial<EsgFeatureSet> | null;
  historicalEmissionsSeries?: number[]; // past periods total tCO2e
}): EsgFeatureSet {
  const {
    reportingPeriodLabel,
    orgUnitId,
    orgUnitName,
    allSubmittedRecords,
    activityContext = {},
    previousPeriodFeatures = null,
    historicalEmissionsSeries = [],
  } = options;

  // 1. Partition verified vs unverified records
  const totalSubmitted = allSubmittedRecords.length;
  const verifiedRecords: VerifiedRecordInput[] = [];
  let unverifiedPendingCount = 0;
  let rejectedCount = 0;
  let missingEvidenceCount = 0;
  let ocrLowConfidenceCount = 0;

  for (const record of allSubmittedRecords) {
    if (record.approvalStatus === "rejected") {
      rejectedCount++;
      continue;
    }

    const isVerifiedAndApproved =
      record.verificationStatus === "user_verified" && record.approvalStatus === "approved";

    if (isVerifiedAndApproved) {
      verifiedRecords.push(record);
      if (!record.hasDocumentEvidence) {
        missingEvidenceCount++;
      }
      if (
        record.ocrConfidence !== null &&
        record.ocrConfidence !== undefined &&
        record.ocrConfidence < 80
      ) {
        ocrLowConfidenceCount++;
      }
    } else {
      unverifiedPendingCount++;
    }
  }

  // 2. Aggregate Electricity Dynamics (VERIFIED ONLY)
  let gridElectricityKwh = 0;
  let renewableElectricityKwh = 0;

  // 3. Aggregate Emissions by Scope (VERIFIED ONLY)
  let scope1Tco2e = 0;
  let scope2Tco2e = 0;
  let scope3Tco2e = 0;

  // 4. Aggregate Water (VERIFIED ONLY)
  let waterWithdrawalKl = 0;
  let waterDischargeKl = 0;

  // 5. Aggregate Waste (VERIFIED ONLY)
  let wasteGeneratedTonnes = 0;
  let wasteRecoveredTonnes = 0;

  for (const r of verifiedRecords) {
    const tco2e = r.calculatedTco2e ?? 0;
    if (r.scopeCode === "SCOPE_1") scope1Tco2e += tco2e;
    else if (r.scopeCode === "SCOPE_2") scope2Tco2e += tco2e;
    else if (r.scopeCode === "SCOPE_3") scope3Tco2e += tco2e;

    const metric = r.metricCode.toUpperCase();

    // Electricity
    if (metric === "GRID_ELECTRICITY") {
      gridElectricityKwh += r.value;
    } else if (metric === "RENEWABLE_ELECTRICITY") {
      renewableElectricityKwh += r.value;
    }

    // Water
    if (metric === "WATER_CONSUMPTION") {
      waterWithdrawalKl += r.value;
    } else if (metric === "WATER_DISCHARGE") {
      waterDischargeKl += r.value;
    }

    // Waste
    if (metric === "WASTE_DISPOSED" || metric === "WASTE_GENERATED") {
      wasteGeneratedTonnes += r.value;
    } else if (metric === "WASTE_RECOVERED" || metric === "WASTE_RECYCLED") {
      wasteRecoveredTonnes += r.value;
    }
  }

  const totalElectricity = gridElectricityKwh + renewableElectricityKwh;
  const renewableShare = calculateRatio(renewableElectricityKwh, totalElectricity);
  const prevElectricity = previousPeriodFeatures?.current_electricity ?? null;
  const electricityGrowth = calculateGrowthRate(totalElectricity, prevElectricity);

  // Emissions totals
  const totalEmissions = Number((scope1Tco2e + scope2Tco2e + scope3Tco2e).toFixed(4));
  const prevTotalEmissions = previousPeriodFeatures?.total_emissions ?? null;
  const emissionsGrowth = calculateGrowthRate(totalEmissions, prevTotalEmissions);

  const scope1Share = calculateRatio(scope1Tco2e, totalEmissions);
  const scope2Share = calculateRatio(scope2Tco2e, totalEmissions);
  const scope3Share = calculateRatio(scope3Tco2e, totalEmissions);

  // Water Trends
  const waterConsumptionKl = Math.max(0, Number((waterWithdrawalKl - waterDischargeKl).toFixed(4)));
  const prevWaterConsumption = previousPeriodFeatures?.current_water_consumption ?? null;
  const waterGrowth = calculateGrowthRate(waterConsumptionKl, prevWaterConsumption);
  const waterRecycleRate = calculateRatio(waterDischargeKl, waterWithdrawalKl);

  // Waste Trends
  const prevWaste = previousPeriodFeatures?.current_waste_generated ?? null;
  const wasteGrowth = calculateGrowthRate(wasteGeneratedTonnes, prevWaste);
  const wasteRecoveryShare = calculateRatio(wasteRecoveredTonnes, wasteGeneratedTonnes);

  // 6. Size Normalization & Production Intensity Metrics
  // Rule: Never compare absolute emissions without considering organizational size / activity
  const prodVolume = activityContext.productionVolume ?? null;
  const hasProd = prodVolume !== null && prodVolume > 0;
  const emissionsPerProdUnit = hasProd ? Number((totalEmissions / prodVolume!).toFixed(6)) : null;

  const prevEmissionsPerProdUnit = previousPeriodFeatures?.emissions_per_production_unit ?? null;
  const prodIntensityGrowth = calculateGrowthRate(
    emissionsPerProdUnit ?? 0,
    prevEmissionsPerProdUnit,
  );

  const turnoverCr = activityContext.turnoverInrCr ?? null;
  const hasTurnover = turnoverCr !== null && turnoverCr > 0;
  const emissionsPerTurnover = hasTurnover
    ? Number((totalEmissions / turnoverCr!).toFixed(4))
    : null;

  const headcount = activityContext.headcount ?? null;
  const hasHeadcount = headcount !== null && headcount > 0;
  const emissionsPerEmployee = hasHeadcount
    ? Number((totalEmissions / headcount!).toFixed(4))
    : null;

  // 7. Historical Series & Anomalies
  const stats = calculateStatistics(totalEmissions, historicalEmissionsSeries);
  const devRatio =
    stats.mean !== null && stats.mean > 0
      ? Number(((totalEmissions - stats.mean) / stats.mean).toFixed(4))
      : null;

  // 8. Data Quality & Evidence Verification Audit
  const verifiedCount = verifiedRecords.length;
  const verificationRate =
    totalSubmitted > 0 ? Number((verifiedCount / totalSubmitted).toFixed(4)) : 1.0;
  const evidenceCoverage =
    verifiedCount > 0
      ? Number(((verifiedCount - missingEvidenceCount) / verifiedCount).toFixed(4))
      : 1.0;

  // Quality scoring model (0 - 100)
  // Verification (35pts) + Evidence attached (35pts) + OCR Quality (20pts) + Anomaly stability (10pts)
  let qualityScore = 0;
  qualityScore += verificationRate * 35;
  qualityScore += evidenceCoverage * 35;

  const highConfidenceOcrRate =
    verifiedCount > 0 ? (verifiedCount - ocrLowConfidenceCount) / verifiedCount : 1.0;
  qualityScore += highConfidenceOcrRate * 20;

  // Anomaly penalty: if Z-score is extreme (> 2.5), deduct stability points
  if (stats.zScore !== null && Math.abs(stats.zScore) > 2.5) {
    qualityScore += 2; // severe deviation
  } else {
    qualityScore += 10;
  }
  const finalQualityScore = Number(Math.min(100, Math.max(0, qualityScore)).toFixed(1));

  let dataQualityStatus: EsgFeatureSet["data_quality_status"] = "EXCELLENT";
  if (finalQualityScore < 50 || verificationRate < 0.5) {
    dataQualityStatus = "UNRELIABLE";
  } else if (finalQualityScore < 75 || missingEvidenceCount > 3) {
    dataQualityStatus = "FLAGGED_DATA_GAPS";
  } else if (finalQualityScore < 90) {
    dataQualityStatus = "SATISFACTORY";
  }

  return {
    reportingPeriod: reportingPeriodLabel,
    orgUnitId,
    orgUnitName,

    current_electricity: totalElectricity,
    previous_electricity: prevElectricity,
    electricity_growth: electricityGrowth,
    grid_electricity: gridElectricityKwh,
    renewable_electricity: renewableElectricityKwh,
    renewable_share: renewableShare,

    scope1_emissions: Number(scope1Tco2e.toFixed(4)),
    scope2_emissions: Number(scope2Tco2e.toFixed(4)),
    scope3_emissions: Number(scope3Tco2e.toFixed(4)),
    total_emissions: totalEmissions,
    previous_total_emissions: prevTotalEmissions,
    emissions_growth: emissionsGrowth,
    scope1_contribution: scope1Share,
    scope2_contribution: scope2Share,
    scope3_contribution: scope3Share,

    current_water_withdrawal: waterWithdrawalKl,
    current_water_discharge: waterDischargeKl,
    current_water_consumption: waterConsumptionKl,
    previous_water_consumption: prevWaterConsumption,
    water_consumption_growth: waterGrowth,
    water_recycle_rate: waterRecycleRate,

    current_waste_generated: wasteGeneratedTonnes,
    current_waste_recovered: wasteRecoveredTonnes,
    previous_waste_generated: prevWaste,
    waste_growth: wasteGrowth,
    waste_recovery_share: wasteRecoveryShare,

    has_production_data: hasProd,
    production_volume: prodVolume,
    production_unit: activityContext.productionUnit ?? null,
    emissions_per_production_unit: emissionsPerProdUnit,
    previous_emissions_per_production_unit: prevEmissionsPerProdUnit,
    production_intensity_growth: prodIntensityGrowth,

    has_turnover_data: hasTurnover,
    turnover_inr_cr: turnoverCr,
    emissions_per_turnover_cr: emissionsPerTurnover,

    has_headcount_data: hasHeadcount,
    headcount,
    emissions_per_employee: emissionsPerEmployee,

    historical_periods_evaluated: historicalEmissionsSeries.length,
    historical_average_emissions: stats.mean,
    historical_median_emissions: stats.median,
    historical_std_dev_emissions: stats.stdDev,
    deviation_from_historical_avg: devRatio,
    anomaly_z_score: stats.zScore,

    total_records_submitted: totalSubmitted,
    verified_records_count: verifiedCount,
    unverified_pending_count: unverifiedPendingCount,
    rejected_records_count: rejectedCount,
    verification_rate: verificationRate,
    evidence_coverage_percent: Number((evidenceCoverage * 100).toFixed(1)),
    missing_evidence_count: missingEvidenceCount,
    ocr_low_confidence_count: ocrLowConfidenceCount,
    data_quality_score: finalQualityScore,
    data_quality_status: dataQualityStatus,
  };
}

/**
 * Organizational Size & Intensity Comparison Helper.
 * Enforces the rule: "Never compare absolute emissions without considering organizational size or activity."
 */
export function compareNormalizedEmissions(
  entityA: EsgFeatureSet,
  entityB: EsgFeatureSet,
): {
  comparableBySize: boolean;
  intensityComparisonType: "production" | "turnover" | "headcount" | "none";
  intensityDifferencePercent: number | null;
  absoluteEmissionsRatio: number;
  advisoryNote: string;
} {
  const absRatio =
    entityB.total_emissions > 0
      ? Number((entityA.total_emissions / entityB.total_emissions).toFixed(2))
      : 0;

  // Check 1: Production output intensity
  if (
    entityA.has_production_data &&
    entityB.has_production_data &&
    entityA.production_unit === entityB.production_unit &&
    entityA.emissions_per_production_unit &&
    entityB.emissions_per_production_unit
  ) {
    const diff = Number(
      (
        ((entityA.emissions_per_production_unit - entityB.emissions_per_production_unit) /
          entityB.emissions_per_production_unit) *
        100
      ).toFixed(2),
    );
    return {
      comparableBySize: true,
      intensityComparisonType: "production",
      intensityDifferencePercent: diff,
      absoluteEmissionsRatio: absRatio,
      advisoryNote: `Comparing per-unit production intensity (${entityA.production_unit}): Entity A has ${diff >= 0 ? "+" : ""}${diff}% carbon intensity per unit produced relative to Entity B.`,
    };
  }

  // Check 2: Turnover intensity
  if (
    entityA.has_turnover_data &&
    entityB.has_turnover_data &&
    entityA.emissions_per_turnover_cr &&
    entityB.emissions_per_turnover_cr
  ) {
    const diff = Number(
      (
        ((entityA.emissions_per_turnover_cr - entityB.emissions_per_turnover_cr) /
          entityB.emissions_per_turnover_cr) *
        100
      ).toFixed(2),
    );
    return {
      comparableBySize: true,
      intensityComparisonType: "turnover",
      intensityDifferencePercent: diff,
      absoluteEmissionsRatio: absRatio,
      advisoryNote: `Comparing revenue carbon intensity: Entity A emits ${diff >= 0 ? "+" : ""}${diff}% tCO2e per ₹ Cr turnover compared to Entity B.`,
    };
  }

  // Check 3: Headcount intensity
  if (
    entityA.has_headcount_data &&
    entityB.has_headcount_data &&
    entityA.emissions_per_employee &&
    entityB.emissions_per_employee
  ) {
    const diff = Number(
      (
        ((entityA.emissions_per_employee - entityB.emissions_per_employee) /
          entityB.emissions_per_employee) *
        100
      ).toFixed(2),
    );
    return {
      comparableBySize: true,
      intensityComparisonType: "headcount",
      intensityDifferencePercent: diff,
      absoluteEmissionsRatio: absRatio,
      advisoryNote: `Comparing per-employee carbon intensity: Entity A emits ${diff >= 0 ? "+" : ""}${diff}% tCO2e per employee compared to Entity B.`,
    };
  }

  return {
    comparableBySize: false,
    intensityComparisonType: "none",
    intensityDifferencePercent: null,
    absoluteEmissionsRatio: absRatio,
    advisoryNote:
      "Warning: Neither production volume nor financial turnover data is available for both entities. Comparing absolute emissions directly may be misleading if entities operate at different scales.",
  };
}
