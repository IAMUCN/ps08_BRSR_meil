import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateRule,
  evaluateRuleSet,
  compareOperator,
  formatAdvisoryMessage,
  STANDARD_DISCLAIMER,
  type DecisionRule,
} from "../lib/rules/engine.ts";
import type { EsgFeatureSet } from "../lib/features/engine.ts";

const mockFeatures: EsgFeatureSet = {
  reportingPeriod: "FY 2026-27",
  orgUnitId: "unit-123",
  orgUnitName: "Polavaram Project",

  current_electricity: 160000,
  previous_electricity: 135000,
  electricity_growth: 0.1852, // 18.52% growth
  grid_electricity: 140800,
  renewable_electricity: 19200,
  renewable_share: 0.12, // 12% renewable

  scope1_emissions: 442.2,
  scope2_emissions: 100.8,
  scope3_emissions: 12.5,
  total_emissions: 555.5,
  previous_total_emissions: 520.0,
  emissions_growth: 0.0683, // 6.83% growth
  scope1_contribution: 0.796,
  scope2_contribution: 0.1815,
  scope3_contribution: 0.0225,

  current_water_withdrawal: 15000,
  current_water_discharge: 4500,
  current_water_consumption: 10500,
  previous_water_consumption: 8000,
  water_consumption_growth: 0.3125, // 31.25% surge
  water_recycle_rate: 0.3,

  current_waste_generated: 65.0,
  current_waste_recovered: 42.0,
  previous_waste_generated: 60.0,
  waste_growth: 0.0833,
  waste_recovery_share: 0.6462,

  has_production_data: true,
  production_volume: 25000,
  production_unit: "MT",
  emissions_per_production_unit: 0.02222,
  previous_emissions_per_production_unit: 0.0245,
  production_intensity_growth: -0.0931,
  has_turnover_data: true,
  turnover_inr_cr: 450,
  emissions_per_turnover_cr: 1.2344,
  has_headcount_data: true,
  headcount: 1200,
  emissions_per_employee: 0.4629,

  historical_periods_evaluated: 4,
  historical_average_emissions: 512.5,
  historical_median_emissions: 512.5,
  historical_std_dev_emissions: 10.4,
  deviation_from_historical_avg: 0.0839,
  anomaly_z_score: 2.12,

  total_records_submitted: 6,
  verified_records_count: 5,
  unverified_pending_count: 1,
  rejected_records_count: 0,
  verification_rate: 0.8333,
  evidence_coverage_percent: 100.0,
  missing_evidence_count: 0,
  ocr_low_confidence_count: 0,
  data_quality_score: 93.3,
  data_quality_status: "EXCELLENT",
};

test("compareOperator: tests all threshold comparison operators independently", () => {
  assert.equal(compareOperator(0.1852, ">", 0.15), true);
  assert.equal(compareOperator(0.1, ">", 0.15), false);
  assert.equal(compareOperator(0.15, ">=", 0.15), true);
  assert.equal(compareOperator(0.08, "<", 0.1), true);
  assert.equal(compareOperator(0.12, "<=", 0.12), true);
  assert.equal(compareOperator(0.5, "==", 0.5), true);
  assert.equal(compareOperator(0.5, "!=", 0.51), true);

  // Range checks
  assert.equal(compareOperator(0.25, "OUTSIDE_RANGE", 0.1, 0.2), true); // > upper
  assert.equal(compareOperator(0.05, "OUTSIDE_RANGE", 0.1, 0.2), true); // < lower
  assert.equal(compareOperator(0.15, "OUTSIDE_RANGE", 0.1, 0.2), false); // inside range

  // Null handling
  assert.equal(compareOperator(null, ">", 0.15), false);
});

test("formatAdvisoryMessage: replaces placeholders with actual values and percentages", () => {
  const template = "Electricity growth of {actual_pct} exceeded threshold of {threshold_pct}.";
  const result = formatAdvisoryMessage(template, 0.1852, 0.15);
  assert.equal(result, "Electricity growth of 18.52% exceeded threshold of 15.0%.");
});

test("evaluateRule: detects electricity growth threshold and attaches audit disclaimer", () => {
  const electricityRuleV1: DecisionRule = {
    id: "rule-1",
    code: "RULE_ELEC_GROWTH",
    name: "Electricity Growth Threshold Guard",
    description: "Detects rapid increase in electricity consumption.",
    category: "ENERGY",
    version: 1,
    status: "ACTIVE",
    severity: "WARNING",
    targetFeature: "electricity_growth",
    operator: ">",
    thresholdValue: 0.15, // 15% threshold
    advisoryMessageTemplate:
      "Electricity consumption grew by {actual_pct}, exceeding threshold of {threshold_pct}. Review peak loads.",
    disclaimer: STANDARD_DISCLAIMER,
  };

  const traceableRecords = ["doc-rec-1", "doc-rec-2"];
  const result = evaluateRule(electricityRuleV1, mockFeatures, traceableRecords);

  assert.equal(result.triggered, true);
  assert.equal(result.observedValue, 0.1852);
  assert.equal(result.ruleVersion, 1);
  assert.equal(result.severity, "WARNING");
  assert.ok(result.advisoryMessage.includes("18.52%"));
  assert.ok(result.advisoryMessage.includes("15.0%"));
  assert.equal(result.disclaimer, STANDARD_DISCLAIMER);
  assert.ok(result.disclaimer.includes("does not establish regulatory non-compliance"));
  assert.deepEqual(result.traceableRecordIds, traceableRecords);
});

test("evaluateRule: handles versioned rules and threshold adjustments", () => {
  // Version 2 adjusted by Admin from 15% to 20%
  const electricityRuleV2: DecisionRule = {
    id: "rule-1-v2",
    code: "RULE_ELEC_GROWTH",
    name: "Electricity Growth Threshold Guard",
    description: "Admin raised threshold to 20% for peak summer season.",
    category: "ENERGY",
    version: 2,
    status: "ACTIVE",
    severity: "WARNING",
    targetFeature: "electricity_growth",
    operator: ">",
    thresholdValue: 0.2, // 20% threshold
    advisoryMessageTemplate: "Electricity grew by {actual_pct}.",
  };

  // With 18.52% growth, V2 should NOT trigger (since 18.52% <= 20%)
  const resultV2 = evaluateRule(electricityRuleV2, mockFeatures);
  assert.equal(resultV2.triggered, false);
  assert.equal(resultV2.ruleVersion, 2);
  assert.ok(resultV2.advisoryMessage.includes("Threshold not exceeded"));
});

test("evaluateRuleSet: evaluates full suite of configurable operational rules", () => {
  const rules: DecisionRule[] = [
    // 1. Electricity growth (> 15%) -> TRIGGERED (18.52%)
    {
      id: "r1",
      code: "RULE_ELEC_GROWTH",
      name: "Electricity Growth Guard",
      description: "Energy spike check",
      category: "ENERGY",
      version: 1,
      status: "ACTIVE",
      severity: "WARNING",
      targetFeature: "electricity_growth",
      operator: ">",
      thresholdValue: 0.15,
      advisoryMessageTemplate: "Electricity grew by {actual_pct}.",
    },
    // 2. Renewable share (< 10%) -> NOT TRIGGERED (12% >= 10%)
    {
      id: "r2",
      code: "RULE_RENEWABLE_MIN",
      name: "Minimum Renewable Target",
      description: "Target 10% renewables",
      category: "ENERGY",
      version: 1,
      status: "ACTIVE",
      severity: "ACTION_REQUIRED",
      targetFeature: "renewable_share",
      operator: "<",
      thresholdValue: 0.1,
      advisoryMessageTemplate: "Renewable share {actual_pct} is below target {threshold_pct}.",
    },
    // 3. Water surge (> 20%) -> TRIGGERED (31.25%)
    {
      id: "r3",
      code: "RULE_WATER_SURGE",
      name: "Water Surge Guard",
      description: "Water consumption surge check",
      category: "WATER",
      version: 1,
      status: "ACTIVE",
      severity: "CRITICAL_REVIEW",
      targetFeature: "water_consumption_growth",
      operator: ">",
      thresholdValue: 0.2,
      advisoryMessageTemplate: "Water consumption surged by {actual_pct}.",
    },
    // 4. Inactive/Superseded rule -> MUST NOT BE EVALUATED
    {
      id: "r-old",
      code: "RULE_OLD",
      name: "Old Rule",
      description: "Superseded",
      category: "EMISSIONS",
      version: 1,
      status: "SUPERSEDED",
      severity: "INFO",
      targetFeature: "emissions_growth",
      operator: ">",
      thresholdValue: 0.01,
      advisoryMessageTemplate: "Old",
    },
  ];

  const summary = evaluateRuleSet(rules, mockFeatures, ["rec-1", "rec-2"]);

  assert.equal(summary.rulesEvaluated, 3); // 3 active rules
  assert.equal(summary.triggeredCount, 2); // Electricity and Water triggered
  assert.equal(summary.bySeverity.WARNING, 1);
  assert.equal(summary.bySeverity.CRITICAL_REVIEW, 1);
  assert.equal(summary.bySeverity.ACTION_REQUIRED, 0);

  // Verify all triggered results include the non-compliance disclaimer
  for (const res of summary.results) {
    assert.ok(res.disclaimer.includes("does not establish regulatory non-compliance"));
  }
});
