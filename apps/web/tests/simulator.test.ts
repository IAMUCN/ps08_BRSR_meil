import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMultiVectorPathwayComparison,
  buildScenarioComparison,
  calculateSimulation,
  simulateMultiVectorScenario,
  toTonnesCo2e,
  validateReductionPercent,
  type BaselineData,
  type MultiVectorBaseline,
} from "../lib/simulator/engine.ts";

const mockBaseline: BaselineData = {
  orgUnitId: "11111111-1111-1111-1111-111111111111",
  orgUnitName: "MEIL Corporate HQ",
  orgUnitCode: "MEIL-HQ",
  periodId: "22222222-2222-2222-2222-222222222222",
  periodLabel: "FY 2026-27",
  categories: [
    {
      id: "cat-diesel",
      code: "DIESEL_CONSUMPTION",
      name: "Diesel Consumption (Stationary)",
      scopeCode: "SCOPE_1",
      scopeName: "Scope 1",
      baselineTco2e: 400,
      recordCount: 5,
      isEligible: true,
    },
    {
      id: "cat-petrol",
      code: "PETROL_CONSUMPTION",
      name: "Petrol Consumption",
      scopeCode: "SCOPE_1",
      scopeName: "Scope 1",
      baselineTco2e: 100,
      recordCount: 2,
      isEligible: true,
    },
    {
      id: "cat-grid",
      code: "GRID_ELECTRICITY",
      name: "Grid Electricity Consumption",
      scopeCode: "SCOPE_2",
      scopeName: "Scope 2",
      baselineTco2e: 300,
      recordCount: 8,
      isEligible: true,
    },
    {
      id: "cat-travel",
      code: "BUSINESS_TRAVEL",
      name: "Commercial Air Travel",
      scopeCode: "SCOPE_3",
      scopeName: "Scope 3",
      baselineTco2e: 200,
      recordCount: 4,
      isEligible: true,
    },
    {
      id: "cat-zero",
      code: "PROCESS_CO2",
      name: "Process Emissions",
      scopeCode: "SCOPE_1",
      scopeName: "Scope 1",
      baselineTco2e: 0,
      recordCount: 0,
      isEligible: false,
    },
  ],
  scopeTotals: {
    scope1: 500, // 400 + 100
    scope2: 300, // 300
    scope3: 200, // 200
    total: 1000, // 500 + 300 + 200
  },
  uncalculatedRecords: 0,
  limitations: [],
};

test("simulator unit conversion: correctly normalizes kgCO2e and tCO2e", () => {
  assert.equal(toTonnesCo2e(1000, "kgCO2e"), 1);
  assert.equal(toTonnesCo2e(500, "kg"), 0.5);
  assert.equal(toTonnesCo2e(250000, "kgco2e"), 250);
  assert.equal(toTonnesCo2e(12.5, "tCO2e"), 12.5);
  assert.equal(toTonnesCo2e(0, "kgCO2e"), 0);
  assert.equal(toTonnesCo2e(null, "kgCO2e"), 0);
  assert.equal(toTonnesCo2e(undefined, "kgCO2e"), 0);
});

test("simulator validation: validates and clamps reduction percentages to [0, 100]", () => {
  assert.deepEqual(validateReductionPercent(15), { valid: true, value: 15 });
  assert.deepEqual(validateReductionPercent(0), { valid: true, value: 0 });
  assert.deepEqual(validateReductionPercent(100), { valid: true, value: 100 });

  // Out of range
  const under = validateReductionPercent(-10);
  assert.equal(under.valid, false);
  assert.equal(under.value, 0);

  const over = validateReductionPercent(120);
  assert.equal(over.valid, false);
  assert.equal(over.value, 100);

  // NaN / invalid strings
  const invalid = validateReductionPercent("not-a-number");
  assert.equal(invalid.valid, false);
  assert.equal(invalid.value, 0);
});

test("simulator calculation: computes correct avoided and projected emissions for target category", () => {
  // Category baseline: Diesel = 400 tCO2e
  // Reduction: 15%
  // Avoided: 400 * 0.15 = 60 tCO2e
  // Projected category: 400 - 60 = 340 tCO2e
  // Org total baseline: 1000 tCO2e
  // Org total projected: 1000 - 60 = 940 tCO2e
  // Overall org reduction %: 60 / 1000 * 100 = 6%
  const result = calculateSimulation({
    baseline: mockBaseline,
    targetCategoryId: "cat-diesel",
    reductionPercent: 15,
  });

  assert.equal(result.targetCategoryId, "cat-diesel");
  assert.equal(result.targetCategoryName, "Diesel Consumption (Stationary)");
  assert.equal(result.reductionPercent, 15);
  assert.equal(result.categoryBaseline, 400);
  assert.equal(result.categoryAvoided, 60);
  assert.equal(result.categoryProjected, 340);

  assert.equal(result.orgBaseline, 1000);
  assert.equal(result.orgAvoided, 60);
  assert.equal(result.orgProjected, 940);
  assert.equal(result.overallReductionPercent, 6);
});

test("simulator invariance: unaffected scopes and categories remain strictly unchanged", () => {
  const result = calculateSimulation({
    baseline: mockBaseline,
    targetCategoryId: "cat-diesel", // Scope 1
    reductionPercent: 20, // Avoided = 80 tCO2e
  });

  const sc1 = result.scopes.find((s) => s.scopeCode === "SCOPE_1");
  const sc2 = result.scopes.find((s) => s.scopeCode === "SCOPE_2");
  const sc3 = result.scopes.find((s) => s.scopeCode === "SCOPE_3");

  // Scope 1 affected: baseline 500, avoided 80 -> projected 420
  assert.equal(sc1?.baseline, 500);
  assert.equal(sc1?.avoided, 80);
  assert.equal(sc1?.projected, 420);

  // Scope 2 untouched: baseline 300, avoided 0 -> projected 300
  assert.equal(sc2?.baseline, 300);
  assert.equal(sc2?.avoided, 0);
  assert.equal(sc2?.projected, 300);

  // Scope 3 untouched: baseline 200, avoided 0 -> projected 200
  assert.equal(sc3?.baseline, 200);
  assert.equal(sc3?.avoided, 0);
  assert.equal(sc3?.projected, 200);
});

test("simulator boundary 0%: projected equals baseline and avoided is zero", () => {
  const result = calculateSimulation({
    baseline: mockBaseline,
    targetCategoryId: "cat-grid", // Scope 2 (300 tCO2e)
    reductionPercent: 0,
  });

  assert.equal(result.categoryBaseline, 300);
  assert.equal(result.categoryAvoided, 0);
  assert.equal(result.categoryProjected, 300);
  assert.equal(result.orgProjected, 1000);
  assert.equal(result.overallReductionPercent, 0);
});

test("simulator boundary 100%: projected category is zero and avoided equals baseline", () => {
  const result = calculateSimulation({
    baseline: mockBaseline,
    targetCategoryId: "cat-grid", // Scope 2 (300 tCO2e)
    reductionPercent: 100,
  });

  assert.equal(result.categoryBaseline, 300);
  assert.equal(result.categoryAvoided, 300);
  assert.equal(result.categoryProjected, 0);
  assert.equal(result.orgProjected, 700);
  // Overall org reduction %: 300 / 1000 = 30%
  assert.equal(result.overallReductionPercent, 30);
});

test("simulator safety: zero organization baseline handles division by zero safely", () => {
  const zeroBaseline: BaselineData = {
    ...mockBaseline,
    scopeTotals: { scope1: 0, scope2: 0, scope3: 0, total: 0 },
    categories: [
      {
        id: "cat-empty",
        code: "GRID",
        name: "Grid",
        scopeCode: "SCOPE_2",
        scopeName: "Scope 2",
        baselineTco2e: 0,
        recordCount: 0,
        isEligible: false,
      },
    ],
  };

  const result = calculateSimulation({
    baseline: zeroBaseline,
    targetCategoryId: "cat-empty",
    reductionPercent: 25,
  });

  assert.equal(result.categoryAvoided, 0);
  assert.equal(result.categoryProjected, 0);
  assert.equal(result.overallReductionPercent, 0);
});

test("simulator comparison: builds conservative, moderate, ambitious, and custom scenarios", () => {
  // Grid electricity baseline = 300 tCO2e, Org baseline = 1000 tCO2e
  const scenarios = buildScenarioComparison({
    baseline: mockBaseline,
    targetCategoryId: "cat-grid",
    customPercent: 18, // custom percent different from standard 5%, 15%, 25%
  });

  assert.equal(scenarios.length, 4, "Should have 3 standard presets + 1 custom row");

  // Conservative (5%)
  const cons = scenarios.find((s) => s.key === "conservative");
  assert.ok(cons);
  assert.equal(cons.percent, 5);
  assert.equal(cons.categoryAvoided, 15); // 300 * 0.05
  assert.equal(cons.categoryProjected, 285);
  assert.equal(cons.orgProjected, 985); // 1000 - 15
  assert.equal(cons.overallReductionPercent, 1.5); // 15 / 1000 * 100

  // Moderate (15%)
  const mod = scenarios.find((s) => s.key === "moderate");
  assert.ok(mod);
  assert.equal(mod.percent, 15);
  assert.equal(mod.categoryAvoided, 45); // 300 * 0.15
  assert.equal(mod.categoryProjected, 255);
  assert.equal(mod.orgProjected, 955);
  assert.equal(mod.overallReductionPercent, 4.5);

  // Ambitious (25%)
  const amb = scenarios.find((s) => s.key === "ambitious");
  assert.ok(amb);
  assert.equal(amb.percent, 25);
  assert.equal(amb.categoryAvoided, 75); // 300 * 0.25
  assert.equal(amb.categoryProjected, 225);
  assert.equal(amb.orgProjected, 925);
  assert.equal(amb.overallReductionPercent, 7.5);

  // Custom (18%)
  const custom = scenarios.find((s) => s.key === "custom");
  assert.ok(custom);
  assert.equal(custom.percent, 18);
  assert.equal(custom.categoryAvoided, 54); // 300 * 0.18
  assert.equal(custom.categoryProjected, 246);
  assert.equal(custom.orgProjected, 946);
  assert.equal(custom.overallReductionPercent, 5.4);
});

const mockMultiVectorBaseline: MultiVectorBaseline = {
  orgUnitId: "11111111-1111-1111-1111-111111111111",
  orgUnitName: "MEIL Corporate HQ",
  orgUnitCode: "MEIL-HQ",
  periodId: "22222222-2222-2222-2222-222222222222",
  periodLabel: "FY 2026-27",
  gridElectricityKwh: 900000,
  renewableElectricityKwh: 100000,
  totalElectricityKwh: 1000000,
  renewableSharePct: 10.0,
  fuelDieselL: 50000,
  waterKl: 20000,
  wasteTonnes: 100,
  scope1Tco2e: 134.0, // 50,000 L * 0.00268
  scope2Tco2e: 644.4, // 900,000 kWh * 0.000716
  scope3Tco2e: 58.0, // 100 tonnes * 0.58
  totalTco2e: 836.4,
  gridEmissionFactor: 0.000716,
  dieselEmissionFactor: 0.00268,
  shadowPricePerTco2e: 2500, // ₹2,500 / tCO2e
  gridTariffInrPerKwh: 7.5,
  solarPpaTariffInrPerKwh: 3.8,
  dieselPriceInrPerL: 90.0,
  waterTariffInrPerKl: 40.0,
  wasteDisposalCostInrPerTonne: 800.0,
};

test("Multi-Vector Simulator: Renewable Energy PPA displacement and tariff savings", () => {
  const result = simulateMultiVectorScenario(mockMultiVectorBaseline, {
    scenarioName: "60% Solar PPA Transition",
    targetRenewableSharePct: 60, // From 10% to 60%
  });

  // Displaced grid = 900,000 - 400,000 = 500,000 kWh
  assert.equal(result.avoided.gridElectricityKwh, 500000);
  assert.equal(result.projected.gridElectricityKwh, 400000);
  assert.equal(result.projected.renewableElectricityKwh, 600000);
  assert.equal(result.projected.renewableSharePct, 60);

  // Avoided Scope 2: 500,000 * 0.000716 = 358 tCO2e
  assert.equal(result.avoided.scope2Tco2e, 358);
  assert.equal(result.projected.scope2Tco2e, 286.4);

  // Financial Tariff Savings: 500,000 * (7.50 - 3.80) = ₹1,850,000
  assert.equal(result.financialImpact.operationalAnnualSavings, 1850000);
  // Carbon Value: 358 tCO2e * 2500 = ₹895,000
  assert.equal(result.financialImpact.carbonRiskAvoidedAnnual, 895000);
  assert.equal(result.financialImpact.totalAnnualBenefit, 2745000);
});

test("Multi-Vector Simulator: Fuel Switching to EV/Electric with Scope 1 reduction", () => {
  const result = simulateMultiVectorScenario(mockMultiVectorBaseline, {
    scenarioName: "Fleet Electrification",
    fuelSwitchPct: 40, // 40% diesel eliminated
    targetCleanFuel: "EV",
  });

  // Avoided Diesel: 50,000 * 0.40 = 20,000 L
  assert.equal(result.avoided.fuelDieselL, 20000);
  assert.equal(result.projected.fuelDieselL, 30000);

  // Avoided Scope 1: 20,000 * 0.00268 = 53.6 tCO2e
  assert.equal(result.avoided.scope1Tco2e, 53.6);
  assert.equal(result.projected.scope1Tco2e, 80.4);

  // Displaced fuel cost = 20,000 * 90 = 1,800,000
  // Added electric cost = 20,000 * 3.0 * 3.80 = 228,000
  // Net OPEX savings = 1,800,000 - 228,000 = ₹1,572,000
  assert.equal(result.financialImpact.operationalAnnualSavings, 1572000);
});

test("Multi-Vector Simulator: Water recycling and landfill waste diversion", () => {
  const result = simulateMultiVectorScenario(mockMultiVectorBaseline, {
    scenarioName: "Water & Waste Circularity",
    waterRecycledPct: 30, // 30% water recycling
    wasteDivertedPct: 70, // 70% waste diversion
  });

  // Avoided Water: 20,000 * 0.30 = 6,000 kL
  assert.equal(result.avoided.waterKl, 6000);
  assert.equal(result.projected.waterKl, 14000);

  // Avoided Waste: 100 * 0.70 = 70 tonnes
  assert.equal(result.avoided.wasteTonnes, 70);
  assert.equal(result.projected.wasteTonnes, 30);

  // Avoided Methane Scope 3: 70 * 0.58 = 40.6 tCO2e
  assert.equal(result.avoided.scope3Tco2e, 40.6);
  assert.equal(result.projected.scope3Tco2e, 17.4);

  // Savings: Water = 6000 * 40 = 240,000; Waste = 70 * 800 = 56,000 -> Total = 296,000
  assert.equal(result.financialImpact.operationalAnnualSavings, 296000);
});

test("Multi-Vector Simulator: Financial CapEx evaluation and accelerated payback with ICP", () => {
  const result = simulateMultiVectorScenario(mockMultiVectorBaseline, {
    scenarioName: "Solar Rooftop Installation",
    targetRenewableSharePct: 50, // 400,000 kWh displaced -> avoided Scope 2 = 286.4 tCO2e
    capexAmount: 5000000, // ₹50 Lakhs
    discountRatePercent: 8,
  });

  const operationalSavings = result.financialImpact.operationalAnnualSavings; // 400,000 * 3.70 = 1,480,000
  const carbonValue = result.financialImpact.carbonRiskAvoidedAnnual; // 286.4 * 2500 = 716,000
  const totalAnnualBenefit = result.financialImpact.totalAnnualBenefit; // 2,196,000

  assert.equal(operationalSavings, 1480000);
  assert.equal(carbonValue, 716000);
  assert.equal(totalAnnualBenefit, 2196000);

  // Payback: Traditional = 5,000,000 / 1,480,000 = 3.38 years
  // Carbon-adjusted = 5,000,000 / 2,196,000 = 2.28 years
  assert.equal(result.financialImpact.traditionalPaybackYears, 3.38);
  assert.equal(result.financialImpact.carbonAdjustedPaybackYears, 2.28);
  assert.equal(result.financialImpact.paybackAccelerationYears, 1.1); // Accelerated by 1.1 yrs!
  assert.ok((result.financialImpact.fiveYearNpv ?? 0) > 0, "5-year NPV must be positive");
});

test("Multi-Vector Simulator: Pathways comparison across Conservative, Moderate, and Ambitious", () => {
  const comparison = buildMultiVectorPathwayComparison(mockMultiVectorBaseline, {
    scenarioName: "My Custom Strategy",
    targetRenewableSharePct: 70,
    fuelSwitchPct: 35,
  });

  assert.equal(comparison.baseline.avoided.totalTco2e, 0);
  assert.ok(comparison.conservative.avoided.totalTco2e > 0);
  assert.ok(comparison.moderate.avoided.totalTco2e > comparison.conservative.avoided.totalTco2e);
  assert.ok(comparison.ambitious.avoided.totalTco2e > comparison.moderate.avoided.totalTco2e);
  assert.ok(comparison.custom, "Should include custom scenario");
  assert.equal(comparison.custom?.projected.renewableSharePct, 70);
});
