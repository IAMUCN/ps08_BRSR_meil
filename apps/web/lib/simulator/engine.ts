/**
 * Pure calculation logic for the TraceESG Carbon Reduction Simulator.
 * No server dependencies — shared between client-side real-time recalculation and unit tests.
 */

export type ScopeCode = "SCOPE_1" | "SCOPE_2" | "SCOPE_3";

export type BaselineCategory = {
  id: string;
  code: string;
  name: string;
  scopeCode: ScopeCode;
  scopeName: string;
  baselineTco2e: number;
  recordCount: number;
  isEligible: boolean;
};

export type ScopeTotals = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
};

export type BaselineData = {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitCode: string;
  periodId: string;
  periodLabel: string;
  categories: BaselineCategory[];
  scopeTotals: ScopeTotals;
  uncalculatedRecords: number;
  limitations: string[];
};

export type ScopeSimulationBreakdown = {
  scopeCode: ScopeCode;
  scopeName: string;
  baseline: number;
  projected: number;
  avoided: number;
};

export type SimulationResult = {
  scenarioName: string;
  targetCategoryId: string;
  targetCategoryName: string;
  targetScopeCode: ScopeCode;
  reductionPercent: number;
  categoryBaseline: number;
  categoryAvoided: number;
  categoryProjected: number;
  orgBaseline: number;
  orgAvoided: number;
  orgProjected: number;
  overallReductionPercent: number;
  scopes: ScopeSimulationBreakdown[];
};

export type ScenarioComparisonItem = {
  key: string;
  name: string;
  badge: "Conservative" | "Moderate" | "Ambitious" | "Custom";
  percent: number;
  categoryName: string;
  categoryBaseline: number;
  categoryProjected: number;
  categoryAvoided: number;
  orgBaseline: number;
  orgProjected: number;
  overallReductionPercent: number;
};

/**
 * Standard scenario assumptions for comparison.
 */
export const STANDARD_SCENARIOS = [
  { key: "conservative", name: "Conservative", percent: 5, badge: "Conservative" as const },
  { key: "moderate", name: "Moderate", percent: 15, badge: "Moderate" as const },
  { key: "ambitious", name: "Ambitious", percent: 25, badge: "Ambitious" as const },
];

/**
 * Converts a raw emission figure to metric tonnes (tCO2e).
 * TraceESG rule: 1 t = 1000 kg.
 */
export function toTonnesCo2e(value: number | null | undefined, unit: string | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const u = unit?.trim().toLowerCase() ?? "";
  if (u === "kgco2e" || u === "kg") {
    return value / 1000;
  }
  // Already in tonnes or standard unit
  return value;
}

/**
 * Validates and clamps a reduction percentage to [0, 100].
 */
export function validateReductionPercent(raw: unknown): {
  valid: boolean;
  value: number;
  error?: string;
} {
  const num = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, value: 0, error: "Reduction percentage must be a finite number." };
  }
  if (num < 0 || num > 100) {
    return {
      valid: false,
      value: Math.max(0, Math.min(100, num)),
      error: "Reduction percentage must be between 0% and 100%.",
    };
  }
  return { valid: true, value: num };
}

/**
 * Computes deterministic reduction simulation for a selected category or scope.
 *
 * Formulas:
 *   Avoided Category Emissions (A) = B_category * (r / 100)
 *   Projected Category Emissions (P) = B_category - A
 *   Projected Org Total = B_total - A
 *   Overall Org Reduction % = (A / B_total) * 100
 */
export function calculateSimulation({
  baseline,
  targetCategoryId,
  reductionPercent,
  scenarioName = "Hypothetical Scenario",
}: {
  baseline: BaselineData;
  targetCategoryId: string;
  reductionPercent: number;
  scenarioName?: string;
}): SimulationResult {
  const { value: r } = validateReductionPercent(reductionPercent);
  const target = baseline.categories.find((c) => c.id === targetCategoryId);

  // If no category selected or category not found, return zero-reduction projection
  if (!target) {
    const orgTotal = baseline.scopeTotals.total;
    return {
      scenarioName,
      targetCategoryId: "",
      targetCategoryName: "None Selected",
      targetScopeCode: "SCOPE_1",
      reductionPercent: 0,
      categoryBaseline: 0,
      categoryAvoided: 0,
      categoryProjected: 0,
      orgBaseline: orgTotal,
      orgAvoided: 0,
      orgProjected: orgTotal,
      overallReductionPercent: 0,
      scopes: [
        { scopeCode: "SCOPE_1", scopeName: "Scope 1", baseline: baseline.scopeTotals.scope1, projected: baseline.scopeTotals.scope1, avoided: 0 },
        { scopeCode: "SCOPE_2", scopeName: "Scope 2", baseline: baseline.scopeTotals.scope2, projected: baseline.scopeTotals.scope2, avoided: 0 },
        { scopeCode: "SCOPE_3", scopeName: "Scope 3", baseline: baseline.scopeTotals.scope3, projected: baseline.scopeTotals.scope3, avoided: 0 },
      ],
    };
  }

  const B_cat = target.baselineTco2e;
  const A_cat = (B_cat * r) / 100;
  const P_cat = Math.max(0, B_cat - A_cat);

  const B_org = baseline.scopeTotals.total;
  const P_org = Math.max(0, B_org - A_cat);
  const overallReductionPercent = B_org > 0 ? (A_cat / B_org) * 100 : 0;

  // Compute breakdown per scope
  const scopes: ScopeSimulationBreakdown[] = (["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const).map(
    (scCode) => {
      const scopeName = scCode === "SCOPE_1" ? "Scope 1" : scCode === "SCOPE_2" ? "Scope 2" : "Scope 3";
      const scBase =
        scCode === "SCOPE_1"
          ? baseline.scopeTotals.scope1
          : scCode === "SCOPE_2"
            ? baseline.scopeTotals.scope2
            : baseline.scopeTotals.scope3;

      const scAvoided = target.scopeCode === scCode ? A_cat : 0;
      const scProjected = Math.max(0, scBase - scAvoided);

      return {
        scopeCode: scCode,
        scopeName,
        baseline: scBase,
        projected: scProjected,
        avoided: scAvoided,
      };
    },
  );

  return {
    scenarioName,
    targetCategoryId: target.id,
    targetCategoryName: target.name,
    targetScopeCode: target.scopeCode,
    reductionPercent: r,
    categoryBaseline: B_cat,
    categoryAvoided: A_cat,
    categoryProjected: P_cat,
    orgBaseline: B_org,
    orgAvoided: A_cat,
    orgProjected: P_org,
    overallReductionPercent,
    scopes,
  };
}

/**
 * Builds the 3 standard comparison scenarios (Conservative, Moderate, Ambitious)
 * plus the current custom assumption.
 */
export function buildScenarioComparison({
  baseline,
  targetCategoryId,
  customPercent,
}: {
  baseline: BaselineData;
  targetCategoryId: string;
  customPercent: number;
}): ScenarioComparisonItem[] {
  const target = baseline.categories.find((c) => c.id === targetCategoryId);
  const categoryName = target?.name ?? "Selected Category";
  const B_cat = target?.baselineTco2e ?? 0;
  const B_org = baseline.scopeTotals.total;

  const scenarios: ScenarioComparisonItem[] = STANDARD_SCENARIOS.map((std) => {
    const A = (B_cat * std.percent) / 100;
    const P_cat = Math.max(0, B_cat - A);
    const P_org = Math.max(0, B_org - A);
    const overall = B_org > 0 ? (A / B_org) * 100 : 0;

    return {
      key: std.key,
      name: `${std.name} (${std.percent}%)`,
      badge: std.badge,
      percent: std.percent,
      categoryName,
      categoryBaseline: B_cat,
      categoryProjected: P_cat,
      categoryAvoided: A,
      orgBaseline: B_org,
      orgProjected: P_org,
      overallReductionPercent: overall,
    };
  });

  // If custom percent is different from standard presets, add custom row
  const isCustomPreset = STANDARD_SCENARIOS.some((s) => s.percent === customPercent);
  if (!isCustomPreset) {
    const A_custom = (B_cat * customPercent) / 100;
    const P_cat_custom = Math.max(0, B_cat - A_custom);
    const P_org_custom = Math.max(0, B_org - A_custom);
    const overall_custom = B_org > 0 ? (A_custom / B_org) * 100 : 0;

    scenarios.push({
      key: "custom",
      name: `Custom Scenario (${customPercent}%)`,
      badge: "Custom",
      percent: customPercent,
      categoryName,
      categoryBaseline: B_cat,
      categoryProjected: P_cat_custom,
      categoryAvoided: A_custom,
      orgBaseline: B_org,
      orgProjected: P_org_custom,
      overallReductionPercent: overall_custom,
    });
  }

  return scenarios;
}
