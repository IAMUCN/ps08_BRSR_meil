import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildScenarioComparison,
  calculateSimulation,
  toTonnesCo2e,
  validateReductionPercent,
  type BaselineData,
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
