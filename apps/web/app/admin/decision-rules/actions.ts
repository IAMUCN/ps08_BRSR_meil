"use server";

import { runAction } from "@/lib/trpc/server";
import type { RuleCategory, RuleOperator, RuleSeverity, RuleStatus } from "@/lib/rules/engine";

export async function listRulesAction(filters?: { category?: RuleCategory; status?: RuleStatus }) {
  return runAction((api) => api.rules.list(filters));
}

export async function createRuleAction(input: {
  code: string;
  name: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  targetFeature: string;
  operator: RuleOperator;
  thresholdValue: number;
  thresholdUpper?: number | null;
  advisoryMessageTemplate: string;
}) {
  return runAction((api) => api.rules.create(input));
}

export async function updateRuleAction(input: {
  ruleId: string;
  name?: string;
  description?: string;
  severity?: RuleSeverity;
  thresholdValue?: number;
  thresholdUpper?: number | null;
  advisoryMessageTemplate?: string;
  status?: RuleStatus;
}) {
  return runAction((api) => api.rules.update(input));
}

export async function evaluateRulesAction(input: { orgUnitId: string; reportingPeriodId: string }) {
  return runAction((api) => api.rules.evaluate(input));
}

export async function getAuditHistoryAction(input: {
  orgUnitId: string;
  reportingPeriodId?: string;
  limit?: number;
}) {
  return runAction((api) => api.rules.auditHistory(input));
}

export async function getRoadmapAction(input: { orgUnitId: string; reportingPeriodId: string }) {
  return runAction((api) => api.suggestions.getRoadmap(input));
}

export async function generateRoadmapAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  useAi?: boolean;
  shadowPricePerTco2e?: number;
}) {
  return runAction((api) => api.suggestions.generate(input));
}

export async function updateSuggestionStatusAction(input: {
  suggestionDbId: string;
  status: "OPEN" | "IN_REVIEW" | "ACCEPTED" | "IMPLEMENTED" | "DISMISSED";
  notes?: string;
  assignedTo?: string;
}) {
  return runAction((api) => api.suggestions.updateStatus(input));
}

export async function getRiskReportAction(input: { orgUnitId: string; reportingPeriodId: string }) {
  return runAction((api) => api.risks.getReport(input));
}

export async function evaluateRisksAction(input: { orgUnitId: string; reportingPeriodId: string }) {
  return runAction((api) => api.risks.evaluate(input));
}

export async function getRecommendationsAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  weights?: { impact?: number; urgency?: number; feasibility?: number; confidence?: number };
}) {
  return runAction((api) => api.recommendations.getReport(input));
}

export async function generateRecommendationsAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  weights?: { impact?: number; urgency?: number; feasibility?: number; confidence?: number };
}) {
  return runAction((api) => api.recommendations.generate(input));
}

export async function updateRecommendationStatusAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  recommendationId: string;
  status: "open" | "in_review" | "approved" | "implemented" | "dismissed";
  assignedTo?: string | null;
}) {
  return runAction((api) => api.recommendations.updateStatus(input));
}

export async function askEsgAssistantAction(input: {
  query: string;
  orgUnitId: string;
  preferredProviderId?: "gemini" | "groq" | "nvidia_nim";
  maxEvidenceChunks?: number;
}) {
  return runAction((api) => api.rag.ask(input));
}

export async function searchEvidenceAction(input: {
  query: string;
  orgUnitId?: string;
  limit?: number;
  minSimilarity?: number;
}) {
  return runAction((api) => api.rag.search(input));
}

export async function reindexKnowledgeBaseAction(input?: {
  orgUnitId?: string;
  recordsLimit?: number;
  docsLimit?: number;
}) {
  return runAction((api) => api.rag.reindex(input ?? {}));
}

export async function getKnowledgeStatsAction() {
  return runAction((api) => api.rag.getStats());
}

// ---------------------------------------------------------------------------
// Milestone 4: Predictive Intelligence Actions
// ---------------------------------------------------------------------------

export async function getPredictiveForecastAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  metricType:
    | "ELECTRICITY_KWH"
    | "FUEL_DIESEL_L"
    | "WATER_KL"
    | "WASTE_TONNES"
    | "EMISSIONS_SCOPE_1"
    | "EMISSIONS_SCOPE_2"
    | "EMISSIONS_SCOPE_3"
    | "EMISSIONS_TOTAL";
}) {
  return runAction((api) => api.predictive.getSnapshot(input));
}

export async function runPredictiveForecastAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  metricType:
    | "ELECTRICITY_KWH"
    | "FUEL_DIESEL_L"
    | "WATER_KL"
    | "WASTE_TONNES"
    | "EMISSIONS_SCOPE_1"
    | "EMISSIONS_SCOPE_2"
    | "EMISSIONS_SCOPE_3"
    | "EMISSIONS_TOTAL";
  horizonSteps?: number;
  growthThresholdPct?: number;
}) {
  return runAction((api) => api.predictive.forecast(input));
}

export async function compareModelsAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  metricType:
    | "ELECTRICITY_KWH"
    | "FUEL_DIESEL_L"
    | "WATER_KL"
    | "WASTE_TONNES"
    | "EMISSIONS_SCOPE_1"
    | "EMISSIONS_SCOPE_2"
    | "EMISSIONS_SCOPE_3"
    | "EMISSIONS_TOTAL";
}) {
  return runAction((api) => api.predictive.compareModels(input));
}

export async function detectAnomaliesAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  metricType:
    | "ELECTRICITY_KWH"
    | "FUEL_DIESEL_L"
    | "WATER_KL"
    | "WASTE_TONNES"
    | "EMISSIONS_SCOPE_1"
    | "EMISSIONS_SCOPE_2"
    | "EMISSIONS_SCOPE_3"
    | "EMISSIONS_TOTAL";
}) {
  return runAction((api) => api.predictive.detectAnomalies(input));
}

// ---------------------------------------------------------------------------
// Milestone 5: What-If Simulator Actions
// ---------------------------------------------------------------------------

export async function getMultiVectorBaselineAction(input: { orgUnitId: string; periodId: string }) {
  return runAction((api) => api.simulator.multiVectorBaseline(input));
}

export async function runSimulationAction(input: {
  orgUnitId: string;
  periodId: string;
  scenarioName?: string;
  targetRenewableSharePct?: number;
  fuelSwitchPct?: number;
  targetCleanFuel?: "GRID_ELECTRICITY" | "EV" | "BIOMASS" | "SOLAR_BATTERY";
  waterRecycledPct?: number;
  wasteDivertedPct?: number;
  capexAmount?: number;
  discountRatePercent?: number;
  shadowPriceOverride?: number;
}) {
  return runAction((api) => api.simulator.simulate(input));
}

export async function comparePathwaysAction(input: {
  orgUnitId: string;
  periodId: string;
  customInput?: {
    scenarioName?: string;
    targetRenewableSharePct?: number;
    fuelSwitchPct?: number;
    waterRecycledPct?: number;
    wasteDivertedPct?: number;
    capexAmount?: number;
  };
}) {
  return runAction((api) => api.simulator.comparePathways(input));
}

export async function saveScenarioAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
  scenarioName: string;
  scenarioType:
    | "RENEWABLE_ENERGY"
    | "EMISSIONS_REDUCTION"
    | "WATER_CONSERVATION"
    | "WASTE_CIRCULARITY"
    | "BLENDED_PATHWAY"
    | "CUSTOM_CATEGORY";
  parameters: Record<string, unknown>;
  simulationResult: any;
}) {
  return runAction((api) => api.simulator.saveScenario(input));
}

export async function listSavedScenariosAction(input: {
  orgUnitId: string;
  reportingPeriodId: string;
}) {
  return runAction((api) => api.simulator.listSavedScenarios(input));
}
