import assert from "node:assert/strict";
import test from "node:test";
import type { EsgFeatureSet } from "../lib/features/engine.ts";
import type { RuleEvaluationResult } from "../lib/rules/engine.ts";
import {
  generateDecarbonizationSuggestions,
  enrichRoadmapWithAi,
  STANDARD_SUGGESTION_DISCLAIMER,
} from "../lib/suggestions/engine.ts";

function createMockFeatures(overrides: Partial<EsgFeatureSet> = {}): EsgFeatureSet {
  return {
    reportingPeriod: "FY 2026-27",
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "MEIL Central EPC Division",
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

function createMockRuleResults(triggeredCodes: string[]): RuleEvaluationResult[] {
  return triggeredCodes.map((code) => ({
    ruleId: `rule-${code}`,
    ruleCode: code,
    ruleVersion: 1,
    ruleName: `Rule ${code}`,
    category: "ENERGY",
    severity: "WARNING",
    triggered: true,
    targetFeature: "electricity_growth",
    observedValue: 0.1852,
    thresholdValue: 0.1,
    operator: ">",
    advisoryMessage: `Triggered advisory for ${code}`,
    disclaimer: "Operational disclaimer",
    traceableRecordIds: ["rec-1", "rec-2"],
  }));
}

test("generateDecarbonizationSuggestions: produces valid prioritized suggestions with disclaimer", () => {
  const features = createMockFeatures();
  const ruleResults = createMockRuleResults([
    "ELEC_GROWTH_ALERT",
    "WATER_CONSUMPTION_SURGE",
    "WASTE_RECOVERY_DEFICIT",
  ]);

  const roadmap = generateDecarbonizationSuggestions(features, ruleResults);

  assert.equal(roadmap.reportingPeriod, "FY 2026-27");
  assert.equal(roadmap.orgUnitName, "MEIL Central EPC Division");
  assert.ok(roadmap.totalSuggestions >= 5);
  assert.ok(roadmap.totalPotentialReductionTco2e > 0);
  assert.equal(roadmap.aiEnriched, false);

  // Every suggestion must carry the standard disclaimer
  for (const s of roadmap.suggestions) {
    assert.equal(s.regulatoryDisclaimer, STANDARD_SUGGESTION_DISCLAIMER);
    assert.ok(s.actionSteps.length > 0);
    assert.ok(s.technicalPrerequisites.length > 0);
  }

  // Check specific expected suggestions
  const solarSuggestion = roadmap.suggestions.find((s) => s.id === "REC-SOLAR-PPA-01");
  assert.ok(solarSuggestion);
  assert.equal(solarSuggestion.category, "RENEWABLE_POWER");
  assert.equal(solarSuggestion.priority, "HIGH");
  assert.equal(solarSuggestion.triggeredByRuleCode, "ELEC_GROWTH_ALERT");

  const waterSuggestion = roadmap.suggestions.find((s) => s.id === "REC-WATER-ZLD-06");
  assert.ok(waterSuggestion);
  assert.equal(waterSuggestion.category, "WATER_CONSERVATION");
  assert.equal(waterSuggestion.priority, "HIGH");

  const wasteSuggestion = roadmap.suggestions.find((s) => s.id === "REC-WASTE-CIRCULAR-07");
  assert.ok(wasteSuggestion);
  assert.equal(wasteSuggestion.category, "CIRCULAR_WASTE");
  assert.equal(wasteSuggestion.priority, "HIGH");
});

test("generateDecarbonizationSuggestions: triggers Scope 1 and Scope 3 dominance initiatives", () => {
  const features = createMockFeatures({
    scope1_emissions: 1800,
    scope1_contribution: 0.6,
    scope3_emissions: 2200,
    scope3_contribution: 0.73,
    total_emissions: 3000,
  });
  const ruleResults = createMockRuleResults(["SCOPE1_DOMINANCE", "SCOPE3_DOMINANCE"]);

  const roadmap = generateDecarbonizationSuggestions(features, ruleResults);

  const bessSuggestion = roadmap.suggestions.find((s) => s.id === "REC-BESS-DG-03");
  assert.ok(bessSuggestion);
  assert.equal(bessSuggestion.priority, "CRITICAL");
  assert.equal(bessSuggestion.triggeredByRuleCode, "SCOPE1_DOMINANCE");
  assert.ok(bessSuggestion.potentialEmissionSavingsTco2e > 0);

  const greenProcure = roadmap.suggestions.find((s) => s.id === "REC-GREEN-PROCURE-05");
  assert.ok(greenProcure);
  assert.equal(greenProcure.priority, "CRITICAL");
  assert.equal(greenProcure.triggeredByRuleCode, "SCOPE3_DOMINANCE");
  assert.ok(greenProcure.potentialEmissionSavingsTco2e > 0);
});

test("generateDecarbonizationSuggestions: triggers data quality governance when evidence is missing", () => {
  const features = createMockFeatures({
    data_quality_score: 45,
    missing_evidence_count: 12,
  });
  const ruleResults = createMockRuleResults(["DATA_QUALITY_AUDIT_RISK"]);

  const roadmap = generateDecarbonizationSuggestions(features, ruleResults);

  const dataGov = roadmap.suggestions.find((s) => s.id === "REC-DATA-QUALITY-08");
  assert.ok(dataGov);
  assert.equal(dataGov.category, "GOVERNANCE_DATA_QUALITY");
  assert.equal(dataGov.priority, "CRITICAL");
  assert.equal(dataGov.investmentTier, "NO_COST");
  assert.equal(dataGov.potentialEmissionSavingsTco2e, 0); // Governance action, no direct tCO2e reduction
});

test("generateDecarbonizationSuggestions: carbon-adjusted payback accelerates financial ROI", () => {
  const features = createMockFeatures();
  const roadmap = generateDecarbonizationSuggestions(features, [], { shadowPricePerTco2e: 2500 });

  const solar = roadmap.suggestions.find((s) => s.id === "REC-SOLAR-PPA-01");
  assert.ok(solar);
  assert.ok(solar.estimatedPaybackYears !== null);
  assert.ok(solar.carbonAdjustedPaybackYears !== null);
  // Carbon adjusted payback is strictly faster than traditional payback
  assert.ok(solar.carbonAdjustedPaybackYears < solar.estimatedPaybackYears);
});

test("enrichRoadmapWithAi: attaches AI commentary when model succeeds", async () => {
  const features = createMockFeatures();
  const roadmap = generateDecarbonizationSuggestions(features, []);

  const fakeModel = async () => ({
    content:
      "Executive Analysis: Prioritize Solar PPA and BESS hybrid microgrid to achieve 22% decarbonization by Q3.",
    model: "openai/gpt-oss-120b",
  });

  const enriched = await enrichRoadmapWithAi(
    roadmap,
    features,
    fakeModel,
    new AbortController().signal,
  );

  assert.equal(enriched.aiEnriched, true);
  assert.match(enriched.aiRationale!, /Solar PPA and BESS/);
});

test("enrichRoadmapWithAi: gracefully falls back to deterministic summary on model failure", async () => {
  const features = createMockFeatures();
  const roadmap = generateDecarbonizationSuggestions(features, []);

  const failingModel = async () => {
    throw new Error("Provider timeout 503");
  };

  const enriched = await enrichRoadmapWithAi(
    roadmap,
    features,
    failingModel,
    new AbortController().signal,
  );

  assert.equal(enriched.aiEnriched, false);
  assert.equal(enriched.aiRationale, undefined);
  assert.ok(enriched.executiveSummary.length > 0);
});
