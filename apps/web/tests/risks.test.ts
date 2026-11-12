import assert from "node:assert/strict";
import test from "node:test";
import type { EsgFeatureSet } from "../lib/features/engine.ts";
import {
  evaluateEsgRisks,
  RISK_CATEGORY_META,
  STANDARD_RISK_DISCLAIMER,
  type RiskEvaluationInput,
} from "../lib/risks/engine.ts";

function createBaselineFeatures(overrides: Partial<EsgFeatureSet> = {}): EsgFeatureSet {
  return {
    reportingPeriod: "FY 2026-27",
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Central Refinery EPC",
    current_electricity: 160000,
    previous_electricity: 160000,
    electricity_growth: 0.0,
    grid_electricity: 130000,
    renewable_electricity: 30000,
    renewable_share: 0.1875,
    scope1_emissions: 500,
    scope2_emissions: 400,
    scope3_emissions: 600,
    total_emissions: 1500,
    previous_total_emissions: 1500,
    emissions_growth: 0.0,
    scope1_contribution: 0.3333,
    scope2_contribution: 0.2667,
    scope3_contribution: 0.4,
    current_water_withdrawal: 10000,
    current_water_discharge: 3000,
    current_water_consumption: 7000,
    previous_water_consumption: 7000,
    water_consumption_growth: 0.0,
    water_recycle_rate: 0.3,
    current_waste_generated: 200,
    current_waste_recovered: 120,
    previous_waste_generated: 200,
    waste_growth: 0.0,
    waste_recovery_share: 0.6,
    has_production_data: true,
    production_volume: 10000,
    production_unit: "MT",
    emissions_per_production_unit: 0.15,
    previous_emissions_per_production_unit: 0.15,
    production_intensity_growth: 0.0,
    has_turnover_data: true,
    turnover_inr_cr: 100,
    emissions_per_turnover_cr: 15.0,
    has_headcount_data: true,
    headcount: 500,
    emissions_per_employee: 3.0,
    historical_periods_evaluated: 4,
    historical_average_emissions: 1500,
    historical_median_emissions: 1500,
    historical_std_dev_emissions: 50,
    deviation_from_historical_avg: 0.0,
    anomaly_z_score: 0.0,
    total_records_submitted: 100,
    verified_records_count: 100,
    unverified_pending_count: 0,
    rejected_records_count: 0,
    verification_rate: 1.0,
    evidence_coverage_percent: 100.0,
    missing_evidence_count: 0,
    ocr_low_confidence_count: 0,
    data_quality_score: 95,
    data_quality_status: "EXCELLENT",
    ...overrides,
  };
}

test("Risk Engine: perfectly clean baseline yields PASS across all 6 risk categories", () => {
  const input: RiskEvaluationInput = {
    features: createBaselineFeatures(),
    validationAnomalies: [],
    validationDuplicates: [],
    missingSubmissions: [],
    brsrReadiness: {
      totalIndicators: 50,
      completeCount: 50,
      partialCount: 0,
      missingEvidenceCount: 0,
      notMappedCount: 0,
    },
  };

  const report = evaluateEsgRisks(input);

  assert.equal(report.reportingPeriod, "FY 2026-27");
  assert.equal(report.orgUnitName, "MEIL Central Refinery EPC");
  assert.equal(report.overallRiskLevel, "PASS");
  assert.equal(report.overallRiskScore, 0);
  assert.equal(report.highOrCriticalCount, 0);
  assert.equal(report.disclaimer, STANDARD_RISK_DISCLAIMER);

  for (const cat of Object.keys(RISK_CATEGORY_META) as (keyof typeof RISK_CATEGORY_META)[]) {
    const item = report.categoryAssessments[cat];
    assert.equal(item.level, "PASS");
    assert.equal(item.detectionMethod, RISK_CATEGORY_META[cat].detectionMethod);
    assert.equal(item.categoryLabel, RISK_CATEGORY_META[cat].label);
  }
});

test("Risk Category 1 (Emissions increase): detects historical emissions growth and normalizes by production", () => {
  // Case A: Unchecked surge (> 35%)
  const surged = createBaselineFeatures({
    emissions_growth: 0.42,
    has_production_data: false,
  });
  const reportA = evaluateEsgRisks({ features: surged });
  const itemA = reportA.categoryAssessments.EMISSIONS_INCREASE;
  assert.equal(itemA.level, "CRITICAL");
  assert.equal(itemA.detectionMethod, "Historical comparison");
  assert.match(itemA.findings[0], /42\.0% YoY/);

  // Case B: Absolute emissions rose 25%, but production doubled so carbon intensity per unit declined
  const normalized = createBaselineFeatures({
    emissions_growth: 0.25,
    has_production_data: true,
    production_intensity_growth: -0.15, // Intensity dropped 15%
  });
  const reportB = evaluateEsgRisks({ features: normalized });
  const itemB = reportB.categoryAssessments.EMISSIONS_INCREASE;
  // Severity was downscaled from HIGH to MEDIUM due to production normalization
  assert.equal(itemB.level, "MEDIUM");
  assert.ok(itemB.findings.some((f) => f.includes("Production normalization note")));
});

test("Risk Category 2 (Unusual consumption): reuses existing validation engine anomaly checks", () => {
  const features = createBaselineFeatures();
  const input: RiskEvaluationInput = {
    features,
    validationAnomalies: [
      {
        recordId: "rec-electricity-1",
        metricName: "Electricity Consumption",
        ruleType: "anomaly",
        result: "flagged",
        message: "160,000 is 2.5× above this project's usual level (median 64,000 over 4 periods).",
      },
      {
        recordId: "rec-diesel-2",
        metricName: "DG Set Diesel Fuel",
        ruleType: "anomaly",
        result: "flagged",
        message: "85,000 is 2.1× above this project's usual level.",
      },
    ],
  };

  const report = evaluateEsgRisks(input);
  const item = report.categoryAssessments.UNUSUAL_CONSUMPTION;

  assert.equal(item.detectionMethod, "Statistical anomaly detection");
  assert.equal(item.level, "HIGH");
  assert.equal(item.contributingRecordIds.length, 2);
  assert.ok(
    item.findings.some((f) => f.includes("Electricity Consumption: 160,000 is 2.5× above")),
  );
});

test("Risk Category 3 (Missing BRSR evidence): evaluates BRSR mapping readiness gaps", () => {
  const features = createBaselineFeatures({
    missing_evidence_count: 8,
    evidence_coverage_percent: 62.5,
  });

  const input: RiskEvaluationInput = {
    features,
    brsrReadiness: {
      totalIndicators: 60,
      completeCount: 35,
      partialCount: 10,
      missingEvidenceCount: 15, // 25% missing
      notMappedCount: 0,
    },
  };

  const report = evaluateEsgRisks(input);
  const item = report.categoryAssessments.MISSING_BRSR_EVIDENCE;

  assert.equal(item.detectionMethod, "Mapping readiness");
  assert.equal(item.level, "HIGH");
  assert.equal(item.metrics.missing_brsr_indicators, 15);
  assert.ok(item.findings.some((f) => f.includes("15 BRSR indicators lack approved evidence")));
});

test("Risk Category 4 (Duplicate invoices): reuses existing validation engine duplicate checks", () => {
  const features = createBaselineFeatures();
  const input: RiskEvaluationInput = {
    features,
    validationDuplicates: [
      {
        recordId: "rec-dup-1",
        metricName: "Electricity Consumption",
        invoiceNumber: "INV-MEIL-2026-991",
        message: "Another Electricity record already exists with invoice #INV-MEIL-2026-991.",
      },
      {
        recordId: "rec-dup-2",
        metricName: "High Speed Diesel",
        invoiceNumber: "INV-HSD-404",
        message: "Another Diesel record already exists with invoice #INV-HSD-404.",
      },
    ],
  };

  const report = evaluateEsgRisks(input);
  const item = report.categoryAssessments.DUPLICATE_INVOICES;

  assert.equal(item.detectionMethod, "Existing validation engine");
  assert.equal(item.level, "HIGH");
  assert.equal(item.contributingRecordIds.length, 2);
  assert.ok(item.findings.some((f) => f.includes("INV-MEIL-2026-991")));
});

test("Risk Category 5 (Incomplete reporting): reuses Submission Monitoring expectations", () => {
  const features = createBaselineFeatures({ unverified_pending_count: 5 });
  const input: RiskEvaluationInput = {
    features,
    missingSubmissions: [
      {
        orgUnitId: "unit-1",
        orgUnitName: "Project Alpha Site",
        metricName: "Scope 1 Stationary Combustion",
        categoryName: "Energy",
      },
      {
        orgUnitId: "unit-1",
        orgUnitName: "Project Alpha Site",
        metricName: "Water Withdrawal - Groundwater",
        categoryName: "Water",
      },
    ],
  };

  const report = evaluateEsgRisks(input);
  const item = report.categoryAssessments.INCOMPLETE_REPORTING;

  assert.equal(item.detectionMethod, "Submission monitoring");
  assert.equal(item.level, "MEDIUM");
  assert.equal(item.metrics.missing_expected_submissions, 2);
  assert.ok(
    item.findings.some((f) =>
      f.includes('Project Alpha Site missing "Scope 1 Stationary Combustion"'),
    ),
  );
});

test("Risk Category 6 (Unusual water usage): evaluates historical water trends and water anomalies", () => {
  const features = createBaselineFeatures({
    water_consumption_growth: 0.28, // 28% water growth
    water_recycle_rate: 0.12, // only 12% recycled
  });

  const input: RiskEvaluationInput = {
    features,
    validationAnomalies: [
      {
        recordId: "rec-water-1",
        metricName: "Water Withdrawal - Third Party Tanker",
        ruleType: "anomaly",
        result: "flagged",
        message: "Water withdrawal is 3.1× higher than historical median.",
        isWaterMetric: true,
      },
    ],
  };

  const report = evaluateEsgRisks(input);
  const item = report.categoryAssessments.UNUSUAL_WATER_USAGE;

  assert.equal(item.detectionMethod, "Historical anomaly analysis");
  assert.equal(item.level, "HIGH");
  assert.equal(item.contributingRecordIds.length, 1);
  assert.ok(item.findings.some((f) => f.includes("28.0%")));
});
