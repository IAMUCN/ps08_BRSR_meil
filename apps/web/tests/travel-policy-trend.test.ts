import assert from "node:assert/strict";
import test from "node:test";

import { computeEsgFeatures, type VerifiedRecordInput } from "../lib/features/engine.ts";
import { evaluateRuleSet, type DecisionRule, STANDARD_DISCLAIMER } from "../lib/rules/engine.ts";
import { generateDecarbonizationSuggestions } from "../lib/suggestions/engine.ts";
import { simulateMultiVectorScenario, type MultiVectorBaseline } from "../lib/simulator/engine.ts";

// ============================================================================
// TEST 1: Year-Wise Carbon Emission Trend Pattern from Past Year Data
// ============================================================================
test("Carbon Emission Trend: detects multi-year trajectory and anomalous spike", () => {
  // Simulate 3 years of historical data:
  // FY 2024-25: 1,800 tCO2e
  // FY 2025-26: 1,950 tCO2e (+8.3% normal growth)
  // FY 2026-27: 2,650 tCO2e (+35.9% sharp surge due to unconstrained flight/travel expenses)
  const historicalSeries = [1800, 1950];

  // FY 2025-26 baseline features
  const prevPeriodFeatures = computeEsgFeatures({
    reportingPeriodLabel: "FY 2025-26",
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Corporate HQ & EPC Clusters",
    allSubmittedRecords: [
      {
        id: "rec-fy25-scope1",
        metricCode: "DIESEL_GENSET",
        scopeCode: "SCOPE_1",
        value: 100000,
        valueUnit: "L",
        calculatedTco2e: 268.0,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
      {
        id: "rec-fy25-scope2",
        metricCode: "GRID_ELECTRICITY",
        scopeCode: "SCOPE_2",
        value: 1200000,
        valueUnit: "kWh",
        calculatedTco2e: 859.2,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
      {
        id: "rec-fy25-scope3-travel",
        metricCode: "BUSINESS_TRAVEL_AIR",
        scopeCode: "SCOPE_3",
        value: 500000,
        valueUnit: "km",
        calculatedTco2e: 822.8, // Normal travel emissions
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
    ],
    historicalEmissionsSeries: [1800],
  });

  assert.equal(prevPeriodFeatures.total_emissions, 1950);
  assert.equal(prevPeriodFeatures.scope3_emissions, 822.8);

  // FY 2026-27 current period records where travel expenses & flights doubled
  const currentPeriodRecords: VerifiedRecordInput[] = [
    {
      id: "rec-fy26-scope1",
      metricCode: "DIESEL_GENSET",
      scopeCode: "SCOPE_1",
      value: 105000,
      valueUnit: "L",
      calculatedTco2e: 281.4,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
    },
    {
      id: "rec-fy26-scope2",
      metricCode: "GRID_ELECTRICITY",
      scopeCode: "SCOPE_2",
      value: 1250000,
      valueUnit: "kWh",
      calculatedTco2e: 895.0,
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
    },
    {
      id: "rec-fy26-scope3-travel-spike",
      metricCode: "BUSINESS_TRAVEL_AIR",
      scopeCode: "SCOPE_3",
      value: 900000,
      valueUnit: "km",
      calculatedTco2e: 1473.6, // Massive travel emissions spike! (+79.1%)
      verificationStatus: "user_verified",
      validationStatus: "validated",
      approvalStatus: "approved",
      hasDocumentEvidence: true,
    },
  ];

  const currentFeatures = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Corporate HQ & EPC Clusters",
    allSubmittedRecords: currentPeriodRecords,
    previousPeriodFeatures: prevPeriodFeatures,
    historicalEmissionsSeries: historicalSeries,
  });

  // Verify feature engine accurately calculates Year-Over-Year trajectory:
  assert.equal(currentFeatures.total_emissions, 2650);
  assert.equal(currentFeatures.scope3_emissions, 1473.6);
  assert.ok(
    currentFeatures.emissions_growth! > 0.35,
    `Overall emissions grew by ${(currentFeatures.emissions_growth! * 100).toFixed(1)}%`,
  );
  assert.ok(
    currentFeatures.scope3_growth! > 0.7,
    `Scope 3 travel grew by ${(currentFeatures.scope3_growth! * 100).toFixed(1)}%`,
  );
  assert.ok(
    currentFeatures.deviation_from_historical_avg! > 0.4,
    "Exceeds historical average by > 40%",
  );
  assert.ok(currentFeatures.anomaly_z_score! > 2.0, "Z-score flags severe statistical anomaly");
});

// ============================================================================
// TEST 2: Decision Rules Alert on Travel Expense & Scope 3 Surge
// ============================================================================
test("Decision Rules Engine: flags outsized travel and Scope 3 surge", () => {
  const travelAlertRule: DecisionRule = {
    id: "rule-travel-growth",
    code: "RULE_TRAVEL_GROWTH",
    name: "Business Travel & Scope 3 Escalation Guard",
    description: "Detects rapid escalation in corporate travel emissions (> 15% growth)",
    category: "EMISSIONS",
    version: 1,
    status: "ACTIVE",
    severity: "ACTION_REQUIRED",
    targetFeature: "scope3_growth",
    operator: ">",
    thresholdValue: 0.15, // 15% threshold
    advisoryMessageTemplate:
      "Scope 3 travel emissions grew by {actual_pct}, exceeding threshold of {threshold_pct}. Implement travel regulation policy.",
    disclaimer: STANDARD_DISCLAIMER,
  };

  const currentFeatures = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [
      {
        id: "rec-1",
        metricCode: "TRAVEL",
        scopeCode: "SCOPE_3",
        value: 1473.6,
        valueUnit: "tCO2e",
        calculatedTco2e: 1473.6,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
    ],
    previousPeriodFeatures: {
      reportingPeriod: "FY 2025-26",
      scope1_emissions: 0,
      scope2_emissions: 0,
      scope3_emissions: 822.8,
      total_emissions: 822.8,
      current_electricity: 0,
      previous_electricity: null,
      electricity_growth: null,
      grid_electricity: 0,
      renewable_electricity: 0,
      renewable_share: 0,
      previous_total_emissions: null,
      emissions_growth: null,
      scope1_contribution: 0,
      scope2_contribution: 0,
      scope3_contribution: 1.0,
      current_water_withdrawal: 0,
      current_water_discharge: 0,
      current_water_consumption: 0,
      previous_water_consumption: null,
      water_consumption_growth: null,
      water_recycle_rate: 0,
      current_waste_generated: 0,
      current_waste_recovered: 0,
      previous_waste_generated: null,
      waste_growth: null,
      waste_recovery_share: 0,
      has_production_data: false,
      production_volume: null,
      production_unit: null,
      emissions_per_production_unit: null,
      previous_emissions_per_production_unit: null,
      production_intensity_growth: null,
      has_turnover_data: false,
      turnover_inr_cr: null,
      emissions_per_turnover_cr: null,
      has_headcount_data: false,
      headcount: null,
      emissions_per_employee: null,
      historical_periods_evaluated: 0,
      historical_average_emissions: null,
      historical_median_emissions: null,
      historical_std_dev_emissions: null,
      deviation_from_historical_avg: null,
      anomaly_z_score: null,
      total_records_submitted: 1,
      verified_records_count: 1,
      unverified_pending_count: 0,
      rejected_records_count: 0,
      verification_rate: 1.0,
      evidence_coverage_percent: 100,
      missing_evidence_count: 0,
      ocr_low_confidence_count: 0,
      data_quality_score: 95,
      data_quality_status: "EXCELLENT",
    },
  });

  const evaluation = evaluateRuleSet([travelAlertRule], currentFeatures, ["rec-1"]);

  assert.equal(evaluation.triggeredCount, 1);
  const finding = evaluation.results[0];
  assert.equal(finding.triggered, true);
  assert.equal(finding.ruleCode, "RULE_TRAVEL_GROWTH");
  assert.equal(finding.severity, "ACTION_REQUIRED");
  assert.ok(finding.advisoryMessage.includes("grew by"));
  assert.ok(finding.disclaimer.includes("does not establish regulatory non-compliance"));
});

// ============================================================================
// TEST 3: Suggestion Engine Automatically Recommends Sustainable Travel Policy
// ============================================================================
test("Suggestion Engine: recommends Corporate Sustainable Travel Policy on expense spike", () => {
  const features = computeEsgFeatures({
    reportingPeriodLabel: "FY 2026-27",
    allSubmittedRecords: [
      {
        id: "rec-s1",
        metricCode: "DIESEL",
        scopeCode: "SCOPE_1",
        value: 100,
        valueUnit: "L",
        calculatedTco2e: 250,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
      {
        id: "rec-s2",
        metricCode: "ELEC",
        scopeCode: "SCOPE_2",
        value: 1000,
        valueUnit: "kWh",
        calculatedTco2e: 700,
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
      {
        id: "rec-s3",
        metricCode: "TRAVEL",
        scopeCode: "SCOPE_3",
        value: 5000,
        valueUnit: "km",
        calculatedTco2e: 1400, // Travel emissions dominant!
        verificationStatus: "user_verified",
        validationStatus: "validated",
        approvalStatus: "approved",
        hasDocumentEvidence: true,
      },
    ],
    previousPeriodFeatures: {
      reportingPeriod: "FY 2025-26",
      scope1_emissions: 240,
      scope2_emissions: 680,
      scope3_emissions: 800, // +75% growth in Scope 3!
      total_emissions: 1720,
      current_electricity: 1000,
      previous_electricity: null,
      electricity_growth: null,
      grid_electricity: 1000,
      renewable_electricity: 0,
      renewable_share: 0,
      previous_total_emissions: null,
      emissions_growth: null,
      scope1_contribution: 0.14,
      scope2_contribution: 0.39,
      scope3_contribution: 0.47,
      current_water_withdrawal: 0,
      current_water_discharge: 0,
      current_water_consumption: 0,
      previous_water_consumption: null,
      water_consumption_growth: null,
      water_recycle_rate: 0,
      current_waste_generated: 0,
      current_waste_recovered: 0,
      previous_waste_generated: null,
      waste_growth: null,
      waste_recovery_share: 0,
      has_production_data: false,
      production_volume: null,
      production_unit: null,
      emissions_per_production_unit: null,
      previous_emissions_per_production_unit: null,
      production_intensity_growth: null,
      has_turnover_data: false,
      turnover_inr_cr: null,
      emissions_per_turnover_cr: null,
      has_headcount_data: false,
      headcount: null,
      emissions_per_employee: null,
      historical_periods_evaluated: 0,
      historical_average_emissions: null,
      historical_median_emissions: null,
      historical_std_dev_emissions: null,
      deviation_from_historical_avg: null,
      anomaly_z_score: null,
      total_records_submitted: 3,
      verified_records_count: 3,
      unverified_pending_count: 0,
      rejected_records_count: 0,
      verification_rate: 1.0,
      evidence_coverage_percent: 100,
      missing_evidence_count: 0,
      ocr_low_confidence_count: 0,
      data_quality_score: 95,
      data_quality_status: "EXCELLENT",
    },
  });

  const ruleResults = [
    {
      ruleId: "rule-travel",
      ruleCode: "RULE_TRAVEL_GROWTH",
      ruleVersion: 1,
      ruleName: "Travel Surge Alert",
      category: "EMISSIONS" as const,
      severity: "ACTION_REQUIRED" as const,
      triggered: true,
      targetFeature: "scope3_growth",
      observedValue: 0.75,
      thresholdValue: 0.15,
      operator: ">" as const,
      advisoryMessage: "Travel emissions grew by 75%",
      disclaimer: STANDARD_DISCLAIMER,
      traceableRecordIds: ["rec-s3"],
    },
  ];

  const roadmap = generateDecarbonizationSuggestions(features, ruleResults);

  // Assert Corporate Sustainable Travel Policy suggestion is generated:
  const travelSuggestion = roadmap.suggestions.find((s) => s.id === "REC-TRAVEL-POLICY-09");
  assert.ok(travelSuggestion, "Must generate REC-TRAVEL-POLICY-09 recommendation");
  assert.equal(
    travelSuggestion.title,
    "Corporate Sustainable Travel Policy & Digital Collaboration Mandate",
  );
  assert.equal(travelSuggestion.category, "FLEET_AND_FUELS");
  assert.equal(travelSuggestion.investmentTier, "NO_COST"); // Policy change requires no CapEx
  assert.equal(travelSuggestion.paybackHorizon, "IMMEDIATE"); // Immediate OpEx savings

  // Check quantified emission reductions:
  // 25% of 1,400 tCO2e = 350 tCO2e
  assert.equal(travelSuggestion.potentialEmissionSavingsTco2e, 350);
  assert.ok(
    travelSuggestion.potentialPercentageReduction > 10,
    "Achieves > 10% reduction of company-wide emissions",
  );

  // Check concrete policy directives:
  assert.ok(
    travelSuggestion.actionSteps.some((step) => step.includes("Virtual First")),
    "Action steps must mandate Virtual First policy for routine meetings",
  );
  assert.ok(
    travelSuggestion.actionSteps.some(
      (step) => step.includes("train travel") || step.includes("rail"),
    ),
    "Action steps must mandate rail travel for corridors under 500 km",
  );
  assert.ok(
    travelSuggestion.actionSteps.some((step) => step.includes("Internal Carbon Price")),
    "Action steps must allocate Internal Carbon Price (ICP) to travel budgets",
  );
});

// ============================================================================
// TEST 4: What-If Simulator Quantifies Travel Reduction & Financial Payback
// ============================================================================
test("What-If Simulator: models travel reduction and carbon-adjusted OpEx savings", () => {
  const baseline: MultiVectorBaseline = {
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Corporate HQ",
    orgUnitCode: "MEIL-HQ",
    periodId: "p-fy26",
    periodLabel: "FY 2026-27",
    gridElectricityKwh: 500000,
    renewableElectricityKwh: 0,
    totalElectricityKwh: 500000,
    renewableSharePct: 0,
    fuelDieselL: 20000,
    waterKl: 5000,
    wasteTonnes: 20,
    scope1Tco2e: 53.6,
    scope2Tco2e: 358.0,
    scope3Tco2e: 600.0, // High Scope 3 travel baseline
    totalTco2e: 1011.6,
    gridEmissionFactor: 0.000716,
    dieselEmissionFactor: 0.00268,
    shadowPricePerTco2e: 2500, // ₹2,500/tCO2e shadow carbon price
    gridTariffInrPerKwh: 7.5,
    solarPpaTariffInrPerKwh: 3.8,
    dieselPriceInrPerL: 90.0,
    waterTariffInrPerKl: 40.0,
    wasteDisposalCostInrPerTonne: 800.0,
  };

  // Simulate policy: 25% ground fuel/transit reduction with 0 CapEx
  const simulation = simulateMultiVectorScenario(baseline, {
    scenarioName: "Corporate Sustainable Travel Policy",
    fuelSwitchPct: 25, // Reduced ground transport & taxi fleet
    capexAmount: 0, // Policy change is CapEx neutral!
  });

  // Verified calculations:
  // Avoided Scope 1 = 20,000 * 0.25 * 0.00268 = 13.4 tCO2e
  assert.equal(simulation.avoided.fuelDieselL, 5000);
  assert.equal(simulation.avoided.scope1Tco2e, 13.4);

  // Fuel OpEx savings: 5,000 L * ₹90/L * 0.7 net clean fuel factor = ₹315,000
  assert.equal(simulation.financialImpact.operationalAnnualSavings, 315000);

  // Carbon shadow value avoided: 13.4 tCO2e * ₹2,500/tCO2e = ₹33,500
  assert.equal(simulation.financialImpact.carbonRiskAvoidedAnnual, 33500);

  // Total annual benefit: ₹315,000 + ₹33,500 = ₹348,500
  assert.equal(simulation.financialImpact.totalAnnualBenefit, 348500);

  // Payback with 0 CapEx is null (pure OpEx savings with no investment required to amortize)
  assert.equal(simulation.financialImpact.traditionalPaybackYears, null);
  assert.equal(simulation.financialImpact.carbonAdjustedPaybackYears, null);

  // If company invests ₹100,000 in virtual conferencing hardware/software:
  const capexSim = simulateMultiVectorScenario(baseline, {
    scenarioName: "Travel Policy with Virtual Conferencing Setup",
    fuelSwitchPct: 25,
    capexAmount: 100000,
  });

  // Payback: ₹100,000 / ₹315,000 = 0.32 yrs (~3.8 months)
  assert.equal(capexSim.financialImpact.traditionalPaybackYears, 0.32);
  // Carbon-adjusted payback: ₹100,000 / ₹348,500 = 0.29 yrs
  assert.equal(capexSim.financialImpact.carbonAdjustedPaybackYears, 0.29);
});
