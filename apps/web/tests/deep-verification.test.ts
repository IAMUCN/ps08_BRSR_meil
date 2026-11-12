import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assessDataCoverage,
  calculatePredictionInterval,
  computeErrorMetrics,
  detectReportingFrequency,
  fitExponentialSmoothing,
  fitLinearTrend,
  generateForecast,
  runChronologicalBacktest,
  toTonnesCo2e,
  type HistoricalObservation,
} from "../lib/forecast/engine.ts";
import {
  buildMultiVectorPathwayComparison,
  buildScenarioComparison,
  calculateSimulation,
  simulateMultiVectorScenario,
  validateReductionPercent,
  type BaselineData,
  type MultiVectorBaseline,
} from "../lib/simulator/engine.ts";
import {
  buildTrends,
  compare,
  monthsLabel,
  seriesByYear,
  type EmissionRow,
  type PeriodInfo,
} from "../lib/analytics/trends.ts";
import {
  findAlerts,
  readAlertSettings,
  type AlertSettings,
  type UnitPeriodScope,
} from "../lib/analytics/alerts.ts";

// =========================================================================
// 1. FORECAST MODULE VERIFICATION
// =========================================================================

test("FORECAST: Unit conversion handles all standard variations and nulls", () => {
  assert.equal(toTonnesCo2e(1000, "kgCO2e"), 1);
  assert.equal(toTonnesCo2e(2500, "kg"), 2.5);
  assert.equal(toTonnesCo2e(150, "tCO2e"), 150);
  assert.equal(toTonnesCo2e(0, "kgCO2e"), 0);
  assert.equal(toTonnesCo2e(null, "tCO2e"), 0);
  assert.equal(toTonnesCo2e(undefined, "tCO2e"), 0);
  assert.equal(toTonnesCo2e(NaN, "tCO2e"), 0);
});

test("FORECAST: Frequency detection accurately classifies cadences", () => {
  const monthly: HistoricalObservation[] = [
    {
      periodId: "1",
      periodLabel: "Jan",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      valueTco2e: 10,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "2",
      periodLabel: "Feb",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      valueTco2e: 12,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "3",
      periodLabel: "Mar",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      valueTco2e: 11,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];
  assert.equal(detectReportingFrequency(monthly), "MONTHLY");

  const quarterly: HistoricalObservation[] = [
    {
      periodId: "1",
      periodLabel: "Q1",
      startDate: "2025-04-01",
      endDate: "2025-06-30",
      valueTco2e: 50,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "2",
      periodLabel: "Q2",
      startDate: "2025-07-01",
      endDate: "2025-09-30",
      valueTco2e: 55,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "3",
      periodLabel: "Q3",
      startDate: "2025-10-01",
      endDate: "2025-12-31",
      valueTco2e: 60,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];
  assert.equal(detectReportingFrequency(quarterly), "QUARTERLY");

  const annual: HistoricalObservation[] = [
    {
      periodId: "1",
      periodLabel: "FY24",
      startDate: "2023-04-01",
      endDate: "2024-03-31",
      valueTco2e: 500,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "2",
      periodLabel: "FY25",
      startDate: "2024-04-01",
      endDate: "2025-03-31",
      valueTco2e: 520,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "3",
      periodLabel: "FY26",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
      valueTco2e: 540,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];
  assert.equal(detectReportingFrequency(annual), "ANNUAL");
});

test("FORECAST: Error metrics match statistical definitions exactly", () => {
  const actual = [100, 200, 300];
  const pred = [110, 190, 315];
  // absolute errors: 10, 10, 15 -> MAE = 35 / 3 = 11.667
  // squared errors: 100, 100, 225 = 425 -> RMSE = sqrt(425 / 3) = sqrt(141.6667) = 11.902
  // percentage errors: 10/100 (10%), 10/200 (5%), 15/300 (5%) -> MAPE = 20 / 3 = 6.7%
  const metrics = computeErrorMetrics(actual, pred);
  assert.equal(metrics.mae, 11.667);
  assert.equal(metrics.rmse, 11.902);
  assert.equal(metrics.mape, 6.7);
});

test("FORECAST: OLS linear trend slope and intercept correctness", () => {
  // y = 50 + 15 * x (for x = 0, 1, 2, 3)
  const series = [50, 65, 80, 95];
  const fit = fitLinearTrend(series, 3);
  assert.equal(fit.slope, 15);
  assert.equal(fit.intercept, 50);
  assert.deepEqual(fit.predictions, [110, 125, 140]);
  assert.equal(fit.residualStdError, 0);
});

test("FORECAST: Prediction intervals anchor and expand with horizon distance", () => {
  const baseValue = 200;
  const sigma = 10;
  const step1 = calculatePredictionInterval(baseValue, 1, sigma);
  const step2 = calculatePredictionInterval(baseValue, 2, sigma);
  const step3 = calculatePredictionInterval(baseValue, 3, sigma);

  // 95% interval width at step 1: 2 * 1.96 * 10 * sqrt(1) = 39.2
  const width1 = step1.confidenceInterval95.upper - step1.confidenceInterval95.lower;
  const width2 = step2.confidenceInterval95.upper - step2.confidenceInterval95.lower;
  const width3 = step3.confidenceInterval95.upper - step3.confidenceInterval95.lower;

  assert.ok(Math.abs(width1 - 39.2) < 0.1, `Expected width ~39.2, got ${width1}`);
  assert.ok(width2 > width1, "Step 2 uncertainty must exceed Step 1");
  assert.ok(width3 > width2, "Step 3 uncertainty must exceed Step 2");
  assert.ok(step1.confidenceInterval95.lower >= 0, "Lower bound must never be negative");
});

test("FORECAST: Insufficient data handles gracefully without fabricating predictions", () => {
  const result = generateForecast({
    historical: [
      {
        periodId: "1",
        periodLabel: "Jan",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        valueTco2e: 100,
        approvedRecordCount: 1,
        pendingRecordCount: 0,
        uncalculatedRecordCount: 0,
      },
      {
        periodId: "2",
        periodLabel: "Feb",
        startDate: "2026-02-01",
        endDate: "2026-02-28",
        valueTco2e: 105,
        approvedRecordCount: 1,
        pendingRecordCount: 0,
        uncalculatedRecordCount: 0,
      },
    ],
    scopeTarget: "SCOPE_1",
    scopeName: "Scope 1",
    horizonPeriods: 2,
  });

  assert.equal(result.canForecast, false);
  assert.equal(result.predictions.length, 0);
  assert.equal(result.selectedModel, "none");
  assert.ok(result.insufficientDataReason !== undefined);
});

test("FORECAST: Downward trend clamps forecast predictions to non-negative numbers", () => {
  // Steep declining series: 100, 60, 20
  const steepDown = [
    {
      periodId: "1",
      periodLabel: "P1",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      valueTco2e: 100,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "2",
      periodLabel: "P2",
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      valueTco2e: 60,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "3",
      periodLabel: "P3",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      valueTco2e: 20,
      approvedRecordCount: 1,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];

  const forecast = generateForecast({
    historical: steepDown,
    scopeTarget: "SCOPE_1",
    scopeName: "Scope 1",
    horizonPeriods: 2,
  });

  assert.equal(forecast.canForecast, true);
  for (const pred of forecast.predictions) {
    assert.ok(
      pred.predictedTco2e >= 0,
      `Predicted tCO2e must be clamped >= 0, got ${pred.predictedTco2e}`,
    );
    assert.ok(pred.confidenceInterval95.lower >= 0, "Lower bound must be clamped >= 0");
  }
});

// =========================================================================
// 2. TREND / CARBON ANALYTICS VERIFICATION
// =========================================================================

test("TREND: Indian Financial Year monthly labeling begins in April", () => {
  assert.equal(monthsLabel([0]), "Apr");
  assert.equal(monthsLabel([0, 1, 2]), "Apr–Jun");
  assert.equal(monthsLabel([0, 1, 2, 3, 4, 5]), "Apr–Sep");
  assert.equal(monthsLabel([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), "the full year");
});

test("TREND: Like-for-like comparison aligns identical calendar months", () => {
  // Previous Year (FY25) has all 12 months, 100 tCO2e each
  // Current Year (FY26) has only Apr-Jun (months 0, 1, 2) recorded, 120 tCO2e each
  const prevMonthly = new Map<number, number>();
  for (let m = 0; m < 12; m++) prevMonthly.set(m, 100);

  const currMonthly = new Map<number, number>();
  currMonthly.set(0, 120);
  currMonthly.set(1, 120);
  currMonthly.set(2, 120);

  const result = compare(
    { monthly: currMonthly, annual: null, total: 360 },
    { monthly: prevMonthly, annual: null, total: 1200 },
    false, // not complete
  );

  assert.equal(result.kind, "same_months");
  if (result.kind === "same_months") {
    assert.deepEqual(result.months, [0, 1, 2]);
    assert.equal(result.current, 360);
    assert.equal(result.previous, 300); // 3 * 100, NOT the full 1200!
    // Change: (360 - 300) / 300 * 100 = +20%
    assert.equal(result.changePct, 20);
  }
});

test("TREND: Alert threshold engine identifies abnormal spikes", () => {
  const settings: AlertSettings = {
    enabled: true,
    thresholdPct: { SCOPE_1: 25, SCOPE_2: 25, SCOPE_3: 25 },
    minBaselineYears: 1,
    minIncreaseTco2e: 5,
    lookbackDays: 365,
  };

  const periods: PeriodInfo[] = [
    {
      id: "p-2024-04",
      label: "Apr 2024",
      startDate: "2024-04-01",
      endDate: "2024-04-30",
      type: "monthly",
      status: "closed",
    },
    {
      id: "p-2025-04",
      label: "Apr 2025",
      startDate: "2025-04-01",
      endDate: "2025-04-30",
      type: "monthly",
      status: "closed",
    },
    {
      id: "p-2026-04",
      label: "Apr 2026",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      type: "monthly",
      status: "closed",
    },
  ];

  const figures: UnitPeriodScope[] = [
    {
      orgUnitId: "u1",
      periodId: "p-2024-04",
      scopeCode: "SCOPE_2",
      approvedT: 100,
      approvedCount: 2,
      pendingCount: 0,
      notCalculatedCount: 0,
      missingExpected: 0,
    },
    {
      orgUnitId: "u1",
      periodId: "p-2025-04",
      scopeCode: "SCOPE_2",
      approvedT: 105,
      approvedCount: 2,
      pendingCount: 0,
      notCalculatedCount: 0,
      missingExpected: 0,
    },
    {
      orgUnitId: "u1",
      periodId: "p-2026-04",
      scopeCode: "SCOPE_2",
      approvedT: 160,
      approvedCount: 2,
      pendingCount: 0,
      notCalculatedCount: 0,
      missingExpected: 0,
    },
  ];

  const alerts = findAlerts({ periods, figures, settings, today: "2026-05-01" });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].scopeCode, "SCOPE_2");
  assert.equal(alerts[0].measuredT, 160);
  assert.equal(alerts[0].baselineT, 102.5);
  assert.ok(alerts[0].thresholdPct === 25);
});

// =========================================================================
// 3. SIMULATOR MODULE VERIFICATION
// =========================================================================

test("SIMULATOR: Percentage inputs validate and clamp cleanly", () => {
  assert.equal(validateReductionPercent(25).valid, true);
  assert.equal(validateReductionPercent(25).value, 25);
  assert.equal(validateReductionPercent(0).valid, true);
  assert.equal(validateReductionPercent(0).value, 0);
  assert.equal(validateReductionPercent(100).valid, true);
  assert.equal(validateReductionPercent(100).value, 100);
  assert.equal(validateReductionPercent(-15).valid, false);
  assert.equal(validateReductionPercent(-15).value, 0);
  assert.equal(validateReductionPercent(150).valid, false);
  assert.equal(validateReductionPercent(150).value, 100);
});

test("SIMULATOR: Invariance guarantee - unaffected scopes remain unchanged", () => {
  const baseline: BaselineData = {
    orgUnitId: "unit-1",
    orgUnitName: "Main Office",
    orgUnitCode: "MO-01",
    periodId: "per-1",
    periodLabel: "FY26",
    categories: [
      {
        id: "c-diesel",
        code: "DIESEL",
        name: "Diesel",
        scopeCode: "SCOPE_1",
        scopeName: "Scope 1",
        baselineTco2e: 300,
        recordCount: 1,
        isEligible: true,
      },
      {
        id: "c-elec",
        code: "ELEC",
        name: "Grid Electricity",
        scopeCode: "SCOPE_2",
        scopeName: "Scope 2",
        baselineTco2e: 500,
        recordCount: 1,
        isEligible: true,
      },
      {
        id: "c-travel",
        code: "TRAVEL",
        name: "Business Travel",
        scopeCode: "SCOPE_3",
        scopeName: "Scope 3",
        baselineTco2e: 200,
        recordCount: 1,
        isEligible: true,
      },
    ],
    scopeTotals: { scope1: 300, scope2: 500, scope3: 200, total: 1000 },
    uncalculatedRecords: 0,
    limitations: [],
  };

  // Simulate 50% reduction on Scope 2 Grid Electricity
  const sim = calculateSimulation({
    baseline,
    targetCategoryId: "c-elec",
    reductionPercent: 50,
  });

  // Scope 2 changed
  assert.equal(sim.categoryBaseline, 500);
  assert.equal(sim.categoryAvoided, 250);
  assert.equal(sim.categoryProjected, 250);

  // Scope 1 and Scope 3 MUST remain identical
  const s1 = sim.scopes.find((s) => s.scopeCode === "SCOPE_1");
  const s3 = sim.scopes.find((s) => s.scopeCode === "SCOPE_3");
  assert.equal(s1?.baseline, 300);
  assert.equal(s1?.projected, 300);
  assert.equal(s1?.avoided, 0);

  assert.equal(s3?.baseline, 200);
  assert.equal(s3?.projected, 200);
  assert.equal(s3?.avoided, 0);

  // Total org reduction
  assert.equal(sim.orgBaseline, 1000);
  assert.equal(sim.orgAvoided, 250);
  assert.equal(sim.orgProjected, 750);
  assert.equal(sim.overallReductionPercent, 25);
});

test("SIMULATOR: Multi-vector simulation with ICP payback and NPV", () => {
  const mvBaseline: MultiVectorBaseline = {
    orgUnitId: "u-1",
    orgUnitName: "Solar Unit",
    orgUnitCode: "SU",
    periodId: "p-1",
    periodLabel: "FY26",
    gridElectricityKwh: 1_000_000,
    renewableElectricityKwh: 0,
    totalElectricityKwh: 1_000_000,
    renewableSharePct: 0,
    fuelDieselL: 20_000,
    waterKl: 10_000,
    wasteTonnes: 50,
    scope1Tco2e: 53.6, // 20k L * 0.00268
    scope2Tco2e: 716.0, // 1M kWh * 0.000716
    scope3Tco2e: 29.0, // 50 tonnes * 0.58
    totalTco2e: 798.6,
    gridEmissionFactor: 0.000716,
    dieselEmissionFactor: 0.00268,
    shadowPricePerTco2e: 3000, // ₹3,000 / tCO2e ICP
    gridTariffInrPerKwh: 8.0,
    solarPpaTariffInrPerKwh: 4.0,
    dieselPriceInrPerL: 90.0,
    waterTariffInrPerKl: 50.0,
    wasteDisposalCostInrPerTonne: 1000.0,
  };

  const simResult = simulateMultiVectorScenario(mvBaseline, {
    scenarioName: "50% Solar PPA + CapEx",
    targetRenewableSharePct: 50,
    capexAmount: 5_000_000, // ₹50 Lakh CapEx
    discountRatePercent: 8,
  });

  // Displaced 500,000 kWh from grid to renewable
  assert.equal(simResult.avoided.gridElectricityKwh, 500_000);
  assert.equal(simResult.projected.renewableSharePct, 50);

  // Avoided Scope 2: 500,000 * 0.000716 = 358 tCO2e
  assert.equal(simResult.avoided.scope2Tco2e, 358);
  assert.equal(simResult.projected.scope2Tco2e, 358);

  // OPEX tariff savings: 500,000 * (8.0 - 4.0) = ₹2,000,000 / year
  assert.equal(simResult.financialImpact.operationalAnnualSavings, 2_000_000);

  // Carbon Risk Avoided (with ICP = ₹3,000): 358 * 3000 = ₹1,074,000 / year
  assert.equal(simResult.financialImpact.carbonRiskAvoidedAnnual, 1_074_000);

  // Total annual benefit: 2,000,000 + 1,074,000 = ₹3,074,000
  assert.equal(simResult.financialImpact.totalAnnualBenefit, 3_074_000);

  // Simple payback = 5,000,000 / 2,000,000 = 2.50 years
  assert.equal(simResult.financialImpact.traditionalPaybackYears, 2.5);

  // Carbon-adjusted payback = 5,000,000 / 3,074,000 = 1.63 years
  assert.equal(simResult.financialImpact.carbonAdjustedPaybackYears, 1.63);

  // Five year NPV
  assert.ok(simResult.financialImpact.fiveYearNpv !== undefined, "5-year NPV must be defined");
});

test("SIMULATOR: Scenario comparison generates Conservative, Moderate, and Ambitious pathways", () => {
  const baseline: BaselineData = {
    orgUnitId: "u-1",
    orgUnitName: "Test Org",
    orgUnitCode: "TO",
    periodId: "p-1",
    periodLabel: "FY26",
    categories: [
      {
        id: "c-1",
        code: "POWER",
        name: "Power",
        scopeCode: "SCOPE_2",
        scopeName: "Scope 2",
        baselineTco2e: 1000,
        recordCount: 1,
        isEligible: true,
      },
    ],
    scopeTotals: { scope1: 0, scope2: 1000, scope3: 0, total: 1000 },
    uncalculatedRecords: 0,
    limitations: [],
  };

  const comparison = buildScenarioComparison({
    baseline,
    targetCategoryId: "c-1",
    customPercent: 30,
  });
  assert.equal(comparison.length, 4); // conservative, moderate, ambitious, custom
  const cons = comparison.find((c) => c.key === "conservative");
  const mod = comparison.find((c) => c.key === "moderate");
  const amb = comparison.find((c) => c.key === "ambitious");

  assert.equal(cons?.percent, 5);
  assert.equal(mod?.percent, 15);
  assert.equal(amb?.percent, 25);

  assert.equal(cons?.categoryAvoided, 50);
  assert.equal(mod?.categoryAvoided, 150);
  assert.equal(amb?.categoryAvoided, 250);
});
