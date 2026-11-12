import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeEsgFeatures,
  compareNormalizedEmissions,
  calculateGrowthRate,
  calculateStatistics,
  type VerifiedRecordInput,
  type ActivityContext,
} from "../lib/features/engine.ts";

test("calculateGrowthRate: handles standard growth, negative growth, zero, and missing previous values", () => {
  assert.equal(calculateGrowthRate(160000, 135000), 0.1852);
  assert.equal(calculateGrowthRate(90, 100), -0.1);
  assert.equal(calculateGrowthRate(100, 0), null);
  assert.equal(calculateGrowthRate(100, null), null);
  assert.equal(calculateGrowthRate(100, undefined), null);
});

test("calculateStatistics: computes accurate mean, median, stdDev, and zScore", () => {
  const history = [100, 120, 110, 130, 140];
  const stats = calculateStatistics(160, history);

  assert.equal(stats.mean, 120);
  assert.equal(stats.median, 120);
  assert.ok(stats.stdDev !== null && stats.stdDev > 15);
  assert.ok(stats.zScore !== null && stats.zScore > 2.0); // 160 is an anomaly (> 2.0 std deviations)
});

test("computeEsgFeatures: calculates verified features and ignores unverified or draft data", () => {
  const mockRecords: VerifiedRecordInput[] = [
    // 1. Verified Grid Electricity
    {
      id: "rec-1",
      metricCode: "GRID_ELECTRICITY",
      scopeCode: "SCOPE_2",
      value: 140800, // kWh
      valueUnit: "kWh",
      calculatedTco2e: 100.8,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
      ocrConfidence: 95,
    },
    // 2. Verified Renewable Electricity
    {
      id: "rec-2",
      metricCode: "RENEWABLE_ELECTRICITY",
      scopeCode: "SCOPE_2",
      value: 19200, // kWh
      valueUnit: "kWh",
      calculatedTco2e: 0.0,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
      ocrConfidence: 92,
    },
    // 3. Verified Diesel Fuel (Scope 1)
    {
      id: "rec-3",
      metricCode: "DIESEL_CONSUMPTION",
      scopeCode: "SCOPE_1",
      value: 165000, // L
      valueUnit: "L",
      calculatedTco2e: 442.2,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
      ocrConfidence: 88,
    },
    // 4. Verified Travel (Scope 3)
    {
      id: "rec-4",
      metricCode: "BUSINESS_TRAVEL_SPEND",
      scopeCode: "SCOPE_3",
      value: 50000,
      valueUnit: "INR",
      calculatedTco2e: 12.5,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
      ocrConfidence: 85,
    },
    // 5. UNVERIFIED / DRAFT record: MUST BE IGNORED from totals
    {
      id: "rec-fake",
      metricCode: "DIESEL_CONSUMPTION",
      scopeCode: "SCOPE_1",
      value: 999999, // Rogue large amount
      valueUnit: "L",
      calculatedTco2e: 2680.0,
      verificationStatus: "ocr_completed", // Not user verified!
      validationStatus: "flagged",
      approvalStatus: "review_pending", // Not approved!
      hasDocumentEvidence: false,
      ocrConfidence: 65,
    },
    // 6. REJECTED record: MUST BE IGNORED from totals
    {
      id: "rec-rejected",
      metricCode: "GRID_ELECTRICITY",
      scopeCode: "SCOPE_2",
      value: 500000,
      valueUnit: "kWh",
      calculatedTco2e: 350.0,
      verificationStatus: "user_verified",
      validationStatus: "failed",
      approvalStatus: "rejected",
      hasDocumentEvidence: false,
    },
  ];

  const prevPeriod = {
    current_electricity: 135000,
    total_emissions: 520.0,
    emissions_per_production_unit: 0.0245,
  };

  const activityContext: ActivityContext = {
    productionVolume: 25000,
    productionUnit: "MT",
    turnoverInrCr: 450,
    headcount: 1200,
  };

  const features = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    orgUnitName: "Polavaram Project",
    allSubmittedRecords: mockRecords,
    activityContext,
    previousPeriodFeatures: prevPeriod,
    historicalEmissionsSeries: [500, 510, 525, 515],
  });

  // Verify Electricity dynamics
  assert.equal(features.current_electricity, 160000); // 140800 + 19200
  assert.equal(features.previous_electricity, 135000);
  assert.equal(features.electricity_growth, 0.1852); // (160k - 135k) / 135k = 0.185185... -> 0.1852
  assert.equal(features.renewable_share, 0.12); // 19200 / 160000 = 0.12

  // Verify Emissions (unverified 2680 tCO2e must not be counted!)
  assert.equal(features.scope1_emissions, 442.2);
  assert.equal(features.scope2_emissions, 100.8);
  assert.equal(features.scope3_emissions, 12.5);
  assert.equal(features.total_emissions, 555.5);
  assert.equal(features.previous_total_emissions, 520.0);
  assert.equal(features.emissions_growth, 0.0683); // (555.5 - 520) / 520 = 0.068269... -> 0.0683
  assert.equal(features.scope1_contribution, 0.796); // 442.2 / 555.5
  assert.equal(features.scope2_contribution, 0.1815); // 100.8 / 555.5

  // Verify Per-Unit Activity & Production Intensity
  assert.equal(features.has_production_data, true);
  assert.equal(features.production_volume, 25000);
  assert.equal(features.production_unit, "MT");
  assert.equal(features.emissions_per_production_unit, 0.02222); // 555.5 / 25000
  assert.equal(features.production_intensity_growth, -0.0931); // (0.02222 - 0.0245) / 0.0245 = -0.09306...
  assert.equal(features.emissions_per_turnover_cr, 1.2344); // 555.5 / 450
  assert.equal(features.emissions_per_employee, 0.4629); // 555.5 / 1200

  // Verify Data Quality & Missing Evidence Tracking
  assert.equal(features.total_records_submitted, 6);
  assert.equal(features.verified_records_count, 4);
  assert.equal(features.unverified_pending_count, 1);
  assert.equal(features.rejected_records_count, 1);
  assert.equal(features.verification_rate, 0.6667); // 4/6
  assert.equal(features.evidence_coverage_percent, 100); // all 4 verified had evidence
  assert.equal(features.missing_evidence_count, 0);
  assert.equal(features.data_quality_status, "SATISFACTORY");
});

test("computeEsgFeatures: detects missing evidence and flags data quality issues", () => {
  const recordsWithMissingEvidence: VerifiedRecordInput[] = [
    {
      id: "rec-1",
      metricCode: "DIESEL_CONSUMPTION",
      scopeCode: "SCOPE_1",
      value: 1000,
      valueUnit: "L",
      calculatedTco2e: 2.68,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: false, // MISSING EVIDENCE!
      ocrConfidence: 50, // LOW OCR CONFIDENCE!
    },
    {
      id: "rec-2",
      metricCode: "GRID_ELECTRICITY",
      scopeCode: "SCOPE_2",
      value: 5000,
      valueUnit: "kWh",
      calculatedTco2e: 3.58,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: false, // MISSING EVIDENCE!
      ocrConfidence: 60,
    },
  ];

  const features = computeEsgFeatures({
    reportingPeriodLabel: "October 2026",
    allSubmittedRecords: recordsWithMissingEvidence,
  });

  assert.equal(features.missing_evidence_count, 2);
  assert.equal(features.ocr_low_confidence_count, 2);
  assert.equal(features.evidence_coverage_percent, 0); // 0% evidence
  assert.ok(features.data_quality_score < 50);
  assert.equal(features.data_quality_status, "UNRELIABLE");
});

test("compareNormalizedEmissions: ensures absolute emissions are not compared without considering organizational size", () => {
  // Megaproject A (huge site, high absolute emissions, but efficient per unit)
  const siteA = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [
      {
        id: "1",
        metricCode: "GRID_ELECTRICITY",
        scopeCode: "SCOPE_2",
        value: 500000,
        valueUnit: "kWh",
        calculatedTco2e: 350.0,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
    ],
    activityContext: {
      productionVolume: 50000,
      productionUnit: "MT",
    },
  });

  // Small Plant B (small site, low absolute emissions, but inefficient per unit)
  const siteB = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [
      {
        id: "2",
        metricCode: "GRID_ELECTRICITY",
        scopeCode: "SCOPE_2",
        value: 150000,
        valueUnit: "kWh",
        calculatedTco2e: 105.0,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
    ],
    activityContext: {
      productionVolume: 10000,
      productionUnit: "MT",
    },
  });

  const comparison = compareNormalizedEmissions(siteA, siteB);

  // Absolute emissions of A is 3.33x B (350 vs 105)
  assert.equal(comparison.absoluteEmissionsRatio, 3.33);

  // But normalized intensity of A is 0.007 tCO2e/MT vs B's 0.0105 tCO2e/MT (-33.33% lower carbon per unit!)
  assert.equal(comparison.comparableBySize, true);
  assert.equal(comparison.intensityComparisonType, "production");
  assert.equal(comparison.intensityDifferencePercent, -33.33);
  assert.ok(comparison.advisoryNote.includes("Comparing per-unit production intensity"));
});

test("compareNormalizedEmissions: flags warning when size/activity data is completely missing", () => {
  const entity1 = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [],
  });

  const entity2 = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [],
  });

  const comp = compareNormalizedEmissions(entity1, entity2);
  assert.equal(comp.comparableBySize, false);
  assert.ok(
    comp.advisoryNote.includes(
      "Warning: Neither production volume nor financial turnover data is available",
    ),
  );
});
