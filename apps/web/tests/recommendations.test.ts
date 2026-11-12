import assert from "node:assert/strict";
import test from "node:test";
import type { EsgFeatureSet } from "../lib/features/engine.ts";
import type { RuleEvaluationResult } from "../lib/rules/engine.ts";
import {
  generateRecommendations,
  computeRecommendationScore,
  calculateUrgencyScore,
  calculateConfidenceScore,
  DEFAULT_RANKING_WEIGHTS,
  RANKING_CALIBRATION_NOTE,
  type RankingComponents,
} from "../lib/recommendations/engine.ts";

function createMockFeatures(overrides: Partial<EsgFeatureSet> = {}): EsgFeatureSet {
  return {
    reportingPeriod: "FY 2026-27",
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Central Refinery EPC",
    current_electricity: 160000,
    previous_electricity: 135000,
    electricity_growth: 0.1852,
    grid_electricity: 140000,
    renewable_electricity: 20000,
    renewable_share: 0.125,
    scope1_emissions: 850,
    scope2_emissions: 450,
    scope3_emissions: 1200,
    total_emissions: 2500,
    previous_total_emissions: 2200,
    emissions_growth: 0.1364,
    scope1_contribution: 0.34,
    scope2_contribution: 0.18,
    scope3_contribution: 0.48,
    current_water_withdrawal: 12000,
    current_water_discharge: 2000,
    current_water_consumption: 10000,
    previous_water_consumption: 8000,
    water_consumption_growth: 0.25,
    water_recycle_rate: 0.1667,
    current_waste_generated: 450,
    current_waste_recovered: 150,
    previous_waste_generated: 380,
    waste_growth: 0.1842,
    waste_recovery_share: 0.3333,
    has_production_data: true,
    production_volume: 50000,
    production_unit: "MT",
    emissions_per_production_unit: 0.05,
    previous_emissions_per_production_unit: 0.048,
    production_intensity_growth: 0.0417,
    has_turnover_data: true,
    turnover_inr_cr: 250,
    emissions_per_turnover_cr: 10.0,
    has_headcount_data: true,
    headcount: 1200,
    emissions_per_employee: 2.0833,
    historical_periods_evaluated: 3,
    historical_average_emissions: 2250,
    historical_median_emissions: 2200,
    historical_std_dev_emissions: 150,
    deviation_from_historical_avg: 0.1111,
    anomaly_z_score: 1.67,
    total_records_submitted: 120,
    verified_records_count: 110,
    unverified_pending_count: 8,
    rejected_records_count: 2,
    verification_rate: 0.9167,
    evidence_coverage_percent: 87.5,
    missing_evidence_count: 5,
    ocr_low_confidence_count: 2,
    data_quality_score: 82,
    data_quality_status: "SATISFACTORY",
    ...overrides,
  };
}

function createMockRule(code: string, triggered: boolean): RuleEvaluationResult {
  return {
    ruleId: `rule-${code}`,
    ruleCode: code,
    ruleVersion: 1,
    ruleName: `Rule ${code}`,
    category: "ENERGY",
    severity: "WARNING",
    triggered,
    targetFeature: "electricity_growth",
    observedValue: 0.1852,
    thresholdValue: 0.15,
    operator: ">",
    advisoryMessage: "Electricity consumption exceeded threshold.",
    disclaimer: "Operational disclaimer",
    traceableRecordIds: ["rec-001", "rec-002"],
  };
}

test("Recommendation Engine D: matches exact specified schema and does NOT invent ungrounded savings", () => {
  const features = createMockFeatures();
  const rules = [createMockRule("RULE_ELEC_GROWTH_THRESHOLD", true)];

  const report = generateRecommendations(features, rules);
  assert.ok(report.recommendations.length > 0);

  const elecRec = report.recommendations.find((r) => r.id === "REC-ELEC-01");
  assert.ok(elecRec);

  // Exact schema checks:
  assert.equal(elecRec.title, "Investigate electricity consumption");
  assert.equal(elecRec.priority, "high");
  assert.equal(elecRec.category, "energy_efficiency");
  assert.match(elecRec.reason, /threshold/i);
  assert.deepEqual(elecRec.evidence_ids, ["rec-001", "rec-002"]);
  assert.equal(elecRec.expected_impact, null);
  assert.equal(elecRec.impact_unit, "not_estimated");
  assert.equal(elecRec.estimated_cost, null);
  assert.equal(elecRec.requires_approval, true);

  // Must explain why necessary inputs are missing
  assert.ok(elecRec.missing_inputs_explanation !== null);
  assert.match(elecRec.missing_inputs_explanation, /missing|audit/i);
});

test("Recommendation Ranking E: applies formula Score = 0.35I + 0.25U + 0.20F + 0.20D exactly", () => {
  const components: RankingComponents = {
    impact: 80,
    urgency: 75,
    feasibility: 70,
    confidence: 65,
  };

  // Expected: 0.35*80 + 0.25*75 + 0.20*70 + 0.20*65 = 28 + 18.75 + 14 + 13 = 73.75
  const score = computeRecommendationScore(components, DEFAULT_RANKING_WEIGHTS);
  assert.equal(score, 73.75);

  // Urgency mapping checks
  assert.equal(calculateUrgencyScore("critical"), 100);
  assert.equal(calculateUrgencyScore("high"), 75);
  assert.equal(calculateUrgencyScore("medium"), 50);
  assert.equal(calculateUrgencyScore("low"), 25);

  // Confidence mapping checks
  assert.ok(calculateConfidenceScore("high") >= 80);
  assert.ok(calculateConfidenceScore("medium") >= 50);
  assert.ok(calculateConfidenceScore("low") <= 45);
});

test("Recommendation Ranking E: sorts recommendations descending by score and assigns sequential ranks", () => {
  const features = createMockFeatures({
    data_quality_score: 40,
    missing_evidence_count: 10,
  });
  const rules = [
    createMockRule("RULE_ELEC_GROWTH_THRESHOLD", true),
    createMockRule("RULE_DATA_QUALITY_AUDIT", true),
  ];

  const report = generateRecommendations(features, rules);

  // Must contain multiple recommendations
  assert.ok(report.recommendations.length >= 2);

  // Must be sorted descending by ranking.score
  for (let i = 0; i < report.recommendations.length - 1; i++) {
    const curr = report.recommendations[i];
    const next = report.recommendations[i + 1];
    assert.ok(
      curr.ranking.score >= next.ranking.score,
      `Rank ${curr.ranking.rank} (score ${curr.ranking.score}) should be >= Rank ${next.ranking.rank} (score ${next.ranking.score})`,
    );
    assert.equal(curr.ranking.rank, i + 1);
  }

  // Last item has rank === totalCount
  assert.equal(
    report.recommendations[report.recommendations.length - 1].ranking.rank,
    report.recommendations.length,
  );

  // Calibration note must be present
  assert.equal(report.calibrationDisclaimer, RANKING_CALIBRATION_NOTE);
  assert.equal(report.recommendations[0].ranking.calibrationNote, RANKING_CALIBRATION_NOTE);
});

test("Recommendation Ranking E: supports transparent custom weight calibration", () => {
  const components: RankingComponents = {
    impact: 100,
    urgency: 0,
    feasibility: 0,
    confidence: 0,
  };

  // If weights are 100% on impact
  const pureImpactScore = computeRecommendationScore(components, {
    impact: 1.0,
    urgency: 0.0,
    feasibility: 0.0,
    confidence: 0.0,
  });
  assert.equal(pureImpactScore, 100);

  // 50% Impact, 50% Urgency
  const halfScore = computeRecommendationScore(
    { impact: 80, urgency: 60, feasibility: 0, confidence: 0 },
    {
      impact: 0.5,
      urgency: 0.5,
      feasibility: 0,
      confidence: 0,
    },
  );
  assert.equal(halfScore, 70);
});
