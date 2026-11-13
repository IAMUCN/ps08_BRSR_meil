/**
 * Pure calculation logic for the EmeilSG Carbon Reduction Simulator.
 * No server dependencies — shared between client-side real-time recalculation and unit tests.
 *
 * Milestone 5:
 * - Renewable energy transition scenarios (PPA, on-site solar, displacement of grid power)
 * - Fuel switching & Scope 1 emissions reduction (diesel to EV/grid, thermal fuel switch)
 * - Water recycling & conservation scenarios (effluent recycling, ZLD)
 * - Waste circularity & landfill diversion scenarios (methane avoidance)
 * - Financial impact & Internal Carbon Pricing (ICP) CapEx payback acceleration
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

export const STANDARD_SIMULATOR_DISCLAIMER =
  "What-if simulations are exploratory scenario projections based on verified operational activity baselines and stated engineering/tariff assumptions. They do not constitute audited regulatory filings or guaranteed future emission reductions.";

/**
 * Converts a raw emission figure to metric tonnes (tCO2e).
 * EmeilSG rule: 1 t = 1000 kg.
 */
export function toTonnesCo2e(
  value: number | null | undefined,
  unit: string | null | undefined,
): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const u = unit?.trim().toLowerCase() ?? "";
  if (u === "kgco2e" || u === "kg") {
    return value / 1000;
  }
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
        {
          scopeCode: "SCOPE_1",
          scopeName: "Scope 1",
          baseline: baseline.scopeTotals.scope1,
          projected: baseline.scopeTotals.scope1,
          avoided: 0,
        },
        {
          scopeCode: "SCOPE_2",
          scopeName: "Scope 2",
          baseline: baseline.scopeTotals.scope2,
          projected: baseline.scopeTotals.scope2,
          avoided: 0,
        },
        {
          scopeCode: "SCOPE_3",
          scopeName: "Scope 3",
          baseline: baseline.scopeTotals.scope3,
          projected: baseline.scopeTotals.scope3,
          avoided: 0,
        },
      ],
    };
  }

  const B_cat = target.baselineTco2e;
  const A_cat = (B_cat * r) / 100;
  const P_cat = Math.max(0, B_cat - A_cat);

  const B_org = baseline.scopeTotals.total;
  const P_org = Math.max(0, B_org - A_cat);
  const overallReductionPercent = B_org > 0 ? (A_cat / B_org) * 100 : 0;

  const scopes: ScopeSimulationBreakdown[] = (["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const).map(
    (scCode) => {
      const scopeName =
        scCode === "SCOPE_1" ? "Scope 1" : scCode === "SCOPE_2" ? "Scope 2" : "Scope 3";
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

// ===========================================================================
// Milestone 5: Multi-Vector What-If Scenario Engine
// ===========================================================================

export type MultiVectorBaseline = {
  orgUnitId: string;
  orgUnitName: string;
  orgUnitCode: string;
  periodId: string;
  periodLabel: string;
  // Physical Quantities
  gridElectricityKwh: number;
  renewableElectricityKwh: number;
  totalElectricityKwh: number;
  renewableSharePct: number;
  fuelDieselL: number;
  waterKl: number;
  wasteTonnes: number;
  // Emissions Baselines (tCO2e)
  scope1Tco2e: number;
  scope2Tco2e: number;
  scope3Tco2e: number;
  totalTco2e: number;
  // Emission & Tariff Assumptions
  gridEmissionFactor: number; // tCO2e / kWh (CEA default 0.000716)
  dieselEmissionFactor: number; // tCO2e / L (default 0.00268)
  shadowPricePerTco2e: number; // INR (MEIL ICP default 2500)
  gridTariffInrPerKwh: number; // default 7.50 INR/kWh
  solarPpaTariffInrPerKwh: number; // default 3.80 INR/kWh
  dieselPriceInrPerL: number; // default 90.00 INR/L
  waterTariffInrPerKl: number; // default 40.00 INR/kL
  wasteDisposalCostInrPerTonne: number; // default 800.00 INR/tonne
};

export type MultiVectorScenarioInput = {
  scenarioName?: string;
  targetRenewableSharePct?: number; // e.g. 50 (50% renewable power)
  fuelSwitchPct?: number; // e.g. 30 (30% diesel reduced/electrified)
  targetCleanFuel?: "GRID_ELECTRICITY" | "EV" | "BIOMASS" | "SOLAR_BATTERY";
  waterRecycledPct?: number; // e.g. 25 (25% water recycling)
  wasteDivertedPct?: number; // e.g. 50 (50% landfill diversion)
  capexAmount?: number; // Optional project CapEx in INR
  discountRatePercent?: number; // default 8%
  shadowPriceOverride?: number; // Optional ICP override
};

export type MultiVectorFinancialImpact = {
  operationalAnnualSavings: number;
  carbonRiskAvoidedAnnual: number;
  totalAnnualBenefit: number;
  capexAmount: number | null;
  traditionalPaybackYears: number | null;
  carbonAdjustedPaybackYears: number | null;
  paybackAccelerationYears: number | null;
  /** No payback from the savings alone, but one with the carbon value (2026-11-13). */
  paysBackOnlyWithCarbon: boolean;
  fiveYearNpv: number | null;
  isGrounded: boolean;
  missingInputsExplanation?: string;
};

export type MultiVectorSimulationResult = {
  scenarioName: string;
  baseline: MultiVectorBaseline;
  projected: {
    gridElectricityKwh: number;
    renewableElectricityKwh: number;
    totalElectricityKwh: number;
    renewableSharePct: number;
    fuelDieselL: number;
    waterKl: number;
    wasteTonnes: number;
    scope1Tco2e: number;
    scope2Tco2e: number;
    scope3Tco2e: number;
    totalTco2e: number;
  };
  avoided: {
    gridElectricityKwh: number;
    fuelDieselL: number;
    waterKl: number;
    wasteTonnes: number;
    scope1Tco2e: number;
    scope2Tco2e: number;
    scope3Tco2e: number;
    totalTco2e: number;
    overallReductionPercent: number;
  };
  financialImpact: MultiVectorFinancialImpact;
  pathwaySummary: string;
  disclaimer: string;
};

/**
 * Simulates multi-vector decarbonization pathways across renewables, fuel switching,
 * water recycling, waste circularity, and ICP financial returns.
 */
export function simulateMultiVectorScenario(
  baseline: MultiVectorBaseline,
  input: MultiVectorScenarioInput,
): MultiVectorSimulationResult {
  const scenarioName = input.scenarioName || "Multi-Vector Decarbonization Scenario";

  // 1. Renewable Energy Transition
  const currentReShare = baseline.renewableSharePct;
  const targetReShare =
    input.targetRenewableSharePct !== undefined
      ? Math.max(currentReShare, Math.min(100, input.targetRenewableSharePct))
      : currentReShare;

  const totalElec = baseline.totalElectricityKwh;
  const projRenewableKwh = (totalElec * targetReShare) / 100;
  const projGridKwh = Math.max(0, totalElec - projRenewableKwh);
  const avoidedGridKwh = Math.max(0, baseline.gridElectricityKwh - projGridKwh);

  // Avoided Scope 2 Emissions
  const avoidedScope2 = Number((avoidedGridKwh * baseline.gridEmissionFactor).toFixed(3));
  const projScope2 = Math.max(0, Number((baseline.scope2Tco2e - avoidedScope2).toFixed(3)));

  // Electricity Tariff Savings (Displacing grid tariff with solar PPA)
  const tariffDiff = Math.max(0, baseline.gridTariffInrPerKwh - baseline.solarPpaTariffInrPerKwh);
  const electricityBillSavings = Math.round(avoidedGridKwh * tariffDiff);

  // 2. Fuel Switching & Scope 1 Reduction
  const fuelSwitchPct = Math.max(0, Math.min(100, input.fuelSwitchPct ?? 0));
  const avoidedDieselL = (baseline.fuelDieselL * fuelSwitchPct) / 100;
  const projDieselL = Math.max(0, baseline.fuelDieselL - avoidedDieselL);

  // Avoided Scope 1 Emissions
  const avoidedScope1 = Number((avoidedDieselL * baseline.dieselEmissionFactor).toFixed(3));
  const projScope1 = Math.max(0, Number((baseline.scope1Tco2e - avoidedScope1).toFixed(3)));

  // Fuel Cost Savings
  // If electrified: 1 L diesel ~ 3.0 kWh electric work, electric cost = 3.0 * solarPpaTariff
  let fuelOpexSavings = 0;
  if (input.targetCleanFuel === "EV" || input.targetCleanFuel === "GRID_ELECTRICITY") {
    const displacedFuelCost = avoidedDieselL * baseline.dieselPriceInrPerL;
    const additionalElecCost = avoidedDieselL * 3.0 * baseline.solarPpaTariffInrPerKwh;
    fuelOpexSavings = Math.max(0, Math.round(displacedFuelCost - additionalElecCost));
  } else {
    fuelOpexSavings = Math.round(avoidedDieselL * baseline.dieselPriceInrPerL * 0.7); // 30% net operational cost savings for biomass/clean fuels
  }

  // 3. Water Recycling & Conservation
  const waterRecycledPct = Math.max(0, Math.min(100, input.waterRecycledPct ?? 0));
  const avoidedWaterKl = (baseline.waterKl * waterRecycledPct) / 100;
  const projWaterKl = Math.max(0, baseline.waterKl - avoidedWaterKl);
  const waterSavingsInr = Math.round(avoidedWaterKl * baseline.waterTariffInrPerKl);

  // 4. Waste Circularity & Landfill Diversion (Scope 3 Category 5)
  const wasteDivertedPct = Math.max(0, Math.min(100, input.wasteDivertedPct ?? 0));
  const avoidedWasteTonnes = (baseline.wasteTonnes * wasteDivertedPct) / 100;
  const projWasteTonnes = Math.max(0, baseline.wasteTonnes - avoidedWasteTonnes);

  // Landfill methane avoidance factor: ~0.58 tCO2e per tonne municipal/commercial waste
  const avoidedScope3Methane = Number((avoidedWasteTonnes * 0.58).toFixed(3));
  const avoidedScope3 = Math.min(baseline.scope3Tco2e, avoidedScope3Methane);
  const projScope3 = Math.max(0, Number((baseline.scope3Tco2e - avoidedScope3).toFixed(3)));
  const wasteTippingSavingsInr = Math.round(
    avoidedWasteTonnes * baseline.wasteDisposalCostInrPerTonne,
  );

  // 5. Total Emissions & Reduction %
  const totalAvoidedTco2e = Number((avoidedScope1 + avoidedScope2 + avoidedScope3).toFixed(3));
  const totalProjTco2e = Math.max(0, Number((baseline.totalTco2e - totalAvoidedTco2e).toFixed(3)));
  const overallReductionPercent =
    baseline.totalTco2e > 0
      ? Number(((totalAvoidedTco2e / baseline.totalTco2e) * 100).toFixed(1))
      : 0;

  // 6. Financial Impact & Internal Carbon Pricing (ICP) Valuation
  const shadowPrice = input.shadowPriceOverride ?? baseline.shadowPricePerTco2e;
  const carbonRiskAvoidedAnnual = Math.round(totalAvoidedTco2e * shadowPrice);
  const operationalAnnualSavings =
    electricityBillSavings + fuelOpexSavings + waterSavingsInr + wasteTippingSavingsInr;
  const totalAnnualBenefit = operationalAnnualSavings + carbonRiskAvoidedAnnual;

  const capexAmount = input.capexAmount && input.capexAmount > 0 ? input.capexAmount : null;
  let traditionalPaybackYears: number | null = null;
  let carbonAdjustedPaybackYears: number | null = null;
  let paybackAccelerationYears: number | null = null;
  let fiveYearNpv: number | null = null;

  if (capexAmount) {
    if (operationalAnnualSavings > 0) {
      traditionalPaybackYears = Number((capexAmount / operationalAnnualSavings).toFixed(2));
    }
    if (totalAnnualBenefit > 0) {
      carbonAdjustedPaybackYears = Number((capexAmount / totalAnnualBenefit).toFixed(2));
    }
    if (traditionalPaybackYears && carbonAdjustedPaybackYears) {
      paybackAccelerationYears = Number(
        (traditionalPaybackYears - carbonAdjustedPaybackYears).toFixed(2),
      );
    }

    const discountRate = (input.discountRatePercent ?? 8.0) / 100;
    let npv = -capexAmount;
    for (let yr = 1; yr <= 5; yr++) {
      npv += totalAnnualBenefit / Math.pow(1 + discountRate, yr);
    }
    fiveYearNpv = Math.round(npv);
  }

  // 7. Dynamic Narrative Summary
  const initiatives: string[] = [];
  if (avoidedGridKwh > 0) {
    initiatives.push(
      `Transitioning to ${targetReShare}% renewable electricity displaces ${avoidedGridKwh.toLocaleString()} kWh of grid power, cutting Scope 2 emissions by ${avoidedScope2} tCO2e and saving ₹${electricityBillSavings.toLocaleString()} in utility bills`,
    );
  }
  if (avoidedDieselL > 0) {
    initiatives.push(
      `A ${fuelSwitchPct}% fuel reduction avoids ${avoidedDieselL.toLocaleString()} L of diesel, eliminating ${avoidedScope1} tCO2e in direct Scope 1 emissions`,
    );
  }
  if (avoidedWaterKl > 0) {
    initiatives.push(
      `Recycling ${waterRecycledPct}% of process water conserves ${avoidedWaterKl.toLocaleString()} kL of freshwater (saving ₹${waterSavingsInr.toLocaleString()})`,
    );
  }
  if (avoidedWasteTonnes > 0) {
    initiatives.push(
      `Diverting ${wasteDivertedPct}% of solid waste (${avoidedWasteTonnes.toFixed(1)} tonnes) eliminates ${avoidedScope3} tCO2e of landfill methane`,
    );
  }

  const pathwaySummary =
    initiatives.length > 0
      ? initiatives.join(". ") + "."
      : "Baseline operations maintained with zero simulated modifications.";

  return {
    scenarioName,
    baseline,
    projected: {
      gridElectricityKwh: Math.round(projGridKwh),
      renewableElectricityKwh: Math.round(projRenewableKwh),
      totalElectricityKwh: totalElec,
      renewableSharePct: targetReShare,
      fuelDieselL: Math.round(projDieselL),
      waterKl: Math.round(projWaterKl),
      wasteTonnes: Number(projWasteTonnes.toFixed(2)),
      scope1Tco2e: projScope1,
      scope2Tco2e: projScope2,
      scope3Tco2e: projScope3,
      totalTco2e: totalProjTco2e,
    },
    avoided: {
      gridElectricityKwh: Math.round(avoidedGridKwh),
      fuelDieselL: Math.round(avoidedDieselL),
      waterKl: Math.round(avoidedWaterKl),
      wasteTonnes: Number(avoidedWasteTonnes.toFixed(2)),
      scope1Tco2e: avoidedScope1,
      scope2Tco2e: avoidedScope2,
      scope3Tco2e: avoidedScope3,
      totalTco2e: totalAvoidedTco2e,
      overallReductionPercent,
    },
    financialImpact: {
      operationalAnnualSavings,
      carbonRiskAvoidedAnnual,
      totalAnnualBenefit,
      capexAmount,
      traditionalPaybackYears,
      carbonAdjustedPaybackYears,
      paybackAccelerationYears,
      paysBackOnlyWithCarbon:
        traditionalPaybackYears === null && carbonAdjustedPaybackYears !== null,
      fiveYearNpv,
      isGrounded: true,
      missingInputsExplanation: !capexAmount
        ? "Payback and CapEx NPV are omitted because capital expenditure was not specified. Operational and carbon ICP benefits reflect verified baselines and standard utility tariffs."
        : undefined,
    },
    pathwaySummary,
    disclaimer: STANDARD_SIMULATOR_DISCLAIMER,
  };
}

/**
 * Compares multi-vector decarbonization pathways: Baseline, Conservative, Moderate,
 * Ambitious, and Custom.
 */
export function buildMultiVectorPathwayComparison(
  baseline: MultiVectorBaseline,
  customInput?: MultiVectorScenarioInput,
): {
  baseline: MultiVectorSimulationResult;
  conservative: MultiVectorSimulationResult;
  moderate: MultiVectorSimulationResult;
  ambitious: MultiVectorSimulationResult;
  custom?: MultiVectorSimulationResult;
} {
  const baseResult = simulateMultiVectorScenario(baseline, {
    scenarioName: "Baseline (Current Operations)",
    targetRenewableSharePct: baseline.renewableSharePct,
    fuelSwitchPct: 0,
    waterRecycledPct: 0,
    wasteDivertedPct: 0,
  });

  const conservative = simulateMultiVectorScenario(baseline, {
    scenarioName: "Conservative Pathway",
    targetRenewableSharePct: Math.min(100, baseline.renewableSharePct + 15),
    fuelSwitchPct: 10,
    waterRecycledPct: 15,
    wasteDivertedPct: 25,
  });

  const moderate = simulateMultiVectorScenario(baseline, {
    scenarioName: "Moderate Pathway",
    targetRenewableSharePct: Math.min(100, baseline.renewableSharePct + 35),
    fuelSwitchPct: 25,
    waterRecycledPct: 30,
    wasteDivertedPct: 50,
  });

  const ambitious = simulateMultiVectorScenario(baseline, {
    scenarioName: "Ambitious Net-Zero Pathway",
    targetRenewableSharePct: 80,
    fuelSwitchPct: 50,
    waterRecycledPct: 60,
    wasteDivertedPct: 85,
  });

  const custom = customInput
    ? simulateMultiVectorScenario(baseline, {
        ...customInput,
        scenarioName: customInput.scenarioName || "Custom Scenario",
      })
    : undefined;

  return {
    baseline: baseResult,
    conservative,
    moderate,
    ambitious,
    custom,
  };
}
