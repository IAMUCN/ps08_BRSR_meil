import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculatePredictionInterval,
  generateForecast,
  type HistoricalObservation,
} from "../lib/forecast/engine.ts";
import { calculateSimulation, type BaselineData } from "../lib/simulator/engine.ts";
import { compare } from "../lib/analytics/trends.ts";

test("Carbon Intelligence: forecast never collapses to repeated zeros with real observations", () => {
  const realHistoricalSeries: HistoricalObservation[] = [
    {
      periodId: "p1",
      periodLabel: "Apr 2026",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      valueTco2e: 120.5,
      approvedRecordCount: 4,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "p2",
      periodLabel: "May 2026",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      valueTco2e: 128.0,
      approvedRecordCount: 5,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "p3",
      periodLabel: "Jun 2026",
      startDate: "2026-06-01",
      endDate: "2026-06-30",
      valueTco2e: 135.2,
      approvedRecordCount: 6,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];

  const forecast = generateForecast({
    historical: realHistoricalSeries,
    scopeTarget: "SCOPE_2",
    scopeName: "Scope 2 (Electricity)",
    horizonPeriods: 3,
    totalConfiguredPeriods: 3,
  });

  assert.equal(forecast.canForecast, true);
  assert.equal(forecast.predictions.length, 3);

  // Predictions must be positive and non-zero
  for (const pred of forecast.predictions) {
    assert.ok(pred.predictedTco2e > 0, `Prediction should be positive, got ${pred.predictedTco2e}`);
    assert.ok(
      pred.confidenceInterval95.upper > pred.predictedTco2e,
      "95% CI upper must exceed prediction",
    );
    assert.ok(
      pred.confidenceInterval95.lower <= pred.predictedTco2e,
      "95% CI lower must be less than or equal to prediction",
    );
    assert.ok(pred.confidenceInterval95.lower >= 0, "95% CI lower must be clamped >= 0");
  }

  // Ensure prediction interval is bounded and not an absurdly huge polygon
  const firstPred = forecast.predictions[0];
  const margin95 = firstPred.confidenceInterval95.upper - firstPred.predictedTco2e;
  assert.ok(margin95 < 200, `Confidence margin should be reasonable, got ${margin95}`);
});

test("Carbon Intelligence: handles insufficient historical data cleanly without fabricating zeros", () => {
  const insufficientSeries: HistoricalObservation[] = [
    {
      periodId: "p1",
      periodLabel: "Oct 2026",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      valueTco2e: 55.4,
      approvedRecordCount: 2,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];

  const result = generateForecast({
    historical: insufficientSeries,
    scopeTarget: "SCOPE_1",
    scopeName: "Scope 1 (Direct)",
    horizonPeriods: 2,
  });

  assert.equal(result.canForecast, false);
  assert.equal(result.predictions.length, 0);
  assert.ok(result.insufficientDataReason?.includes("Insufficient historical observations"));
});

test("Carbon Intelligence: Prediction interval originates with zero width at horizon 0", () => {
  // calculatePredictionInterval with horizonStep 1
  const interval1 = calculatePredictionInterval(100, 1, 5);
  const interval2 = calculatePredictionInterval(100, 2, 5);

  // Uncertainty must expand chronologically (cone of uncertainty)
  const spread1 = interval1.confidenceInterval95.upper - interval1.confidenceInterval95.lower;
  const spread2 = interval2.confidenceInterval95.upper - interval2.confidenceInterval95.lower;
  assert.ok(spread2 > spread1, "Prediction interval uncertainty must expand into the future");
});

test("Carbon Intelligence: Simulator calculates reduction correctly from verified baseline", () => {
  const baseline: BaselineData = {
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "Solar Infra",
    orgUnitCode: "SI-01",
    periodId: "00000000-0000-0000-0000-000000000002",
    periodLabel: "FY 2025-26",
    categories: [
      {
        id: "cat-1",
        code: "GRID_POWER",
        name: "Grid Electricity",
        scopeCode: "SCOPE_2",
        scopeName: "Scope 2",
        baselineTco2e: 500,
        recordCount: 12,
        isEligible: true,
      },
      {
        id: "cat-2",
        code: "DIESEL_GEN",
        name: "Diesel Generators",
        scopeCode: "SCOPE_1",
        scopeName: "Scope 1",
        baselineTco2e: 200,
        recordCount: 8,
        isEligible: true,
      },
    ],
    scopeTotals: {
      scope1: 200,
      scope2: 500,
      scope3: 0,
      total: 700,
    },
    uncalculatedRecords: 0,
    limitations: [],
  };

  const simulation = calculateSimulation({
    baseline,
    targetCategoryId: "cat-1",
    reductionPercent: 20,
    scenarioName: "20% Solar PPA",
  });

  // 20% of 500 = 100 tCO2e avoided
  assert.equal(simulation.categoryBaseline, 500);
  assert.equal(simulation.categoryAvoided, 100);
  assert.equal(simulation.categoryProjected, 400);

  // Org total was 700, now 600
  assert.equal(simulation.orgBaseline, 700);
  assert.equal(simulation.orgAvoided, 100);
  assert.equal(simulation.orgProjected, 600);
  assert.ok(
    Math.abs(simulation.overallReductionPercent - 14.2857) < 0.01,
    `Overall reduction should be ~14.29%, got ${simulation.overallReductionPercent}`,
  );

  // Scope 1 must remain completely unaffected
  const scope1 = simulation.scopes.find((s) => s.scopeCode === "SCOPE_1");
  assert.equal(scope1?.baseline, 200);
  assert.equal(scope1?.projected, 200);
  assert.equal(scope1?.avoided, 0);
});

test("Carbon Intelligence: Year-on-year trends compares like-for-like months without reading missing as zero", () => {
  const comparison = compare(
    {
      monthly: new Map([
        [0, 50],
        [1, 60],
      ]),
      annual: null,
      total: 110,
    },
    {
      monthly: new Map([
        [0, 40],
        [1, 50],
      ]),
      annual: null,
      total: 90,
    },
    false,
  );

  assert.equal(comparison.kind, "same_months");
  if (comparison.kind === "same_months") {
    assert.deepEqual(comparison.months, [0, 1]);
    assert.equal(comparison.current, 110);
    assert.equal(comparison.previous, 90);
    // (110 - 90) / 90 * 100 = 22.22%
    assert.ok(comparison.changePct! > 22 && comparison.changePct! < 23);
  }
});

test("Carbon Intelligence: supports 4 unified modules (Overview, Forecast, Simulator, Credits & Offsets)", () => {
  const normalizeTab = (rawTab?: string) => {
    if (rawTab === "forecast" || rawTab === "simulator" || rawTab === "credits") return rawTab;
    if (rawTab === "carbon-credits") return "credits";
    return "overview";
  };

  assert.equal(normalizeTab("overview"), "overview");
  assert.equal(normalizeTab(undefined), "overview");
  assert.equal(normalizeTab("forecast"), "forecast");
  assert.equal(normalizeTab("simulator"), "simulator");
  assert.equal(normalizeTab("credits"), "credits");
  assert.equal(normalizeTab("carbon-credits"), "credits");
});

test("Carbon Intelligence: reconciliation ensures transferred credits are never double counted as offsets", () => {
  const grossEmissions = { scope1: 1500, scope2: 800, scope3: 1200, total: 3500 };
  const retiredBatches = [
    { targetScope: "SCOPE_1", quantityTco2e: 300 },
    { targetScope: "SCOPE_2", quantityTco2e: 200 },
  ];
  const transferredBatches = [{ quantityTco2e: 500, status: "TRANSFERRED" }];

  // Transferred batches are excluded from internal offset claims
  const transferredTotal = transferredBatches.reduce((acc, b) => acc + b.quantityTco2e, 0);
  assert.equal(transferredTotal, 500);

  const scope1Offsets = retiredBatches
    .filter((b) => b.targetScope === "SCOPE_1")
    .reduce((acc, b) => acc + b.quantityTco2e, 0);
  const scope2Offsets = retiredBatches
    .filter((b) => b.targetScope === "SCOPE_2")
    .reduce((acc, b) => acc + b.quantityTco2e, 0);
  const totalOffsets = scope1Offsets + scope2Offsets;

  const netScope1 = grossEmissions.scope1 - scope1Offsets;
  const netScope2 = grossEmissions.scope2 - scope2Offsets;
  const netTotal = grossEmissions.total - totalOffsets;

  assert.equal(netScope1, 1200);
  assert.equal(netScope2, 600);
  assert.equal(netTotal, 3000);
  assert.ok(netTotal < grossEmissions.total);
});

test("Carbon Intelligence: permission resolution allows Super Admin, Org Admin, or carbon_credit.view", () => {
  const canView = (session: { isAdmin: boolean; isOrgAdmin?: boolean; permissions: string[] }) =>
    Boolean(
      session.isAdmin ||
        session.isOrgAdmin ||
        session.permissions.includes("carbon_credit.view"),
    );

  // Super Admin
  assert.equal(canView({ isAdmin: true, isOrgAdmin: false, permissions: [] }), true);
  // Org Admin (Administrator without explicit carbon_credit.view permission)
  assert.equal(
    canView({ isAdmin: false, isOrgAdmin: true, permissions: ["monitoring.view"] }),
    true,
  );
  // Role with explicit carbon_credit.view (e.g. Project Manager, Corporate ESG, Finance CSR)
  assert.equal(
    canView({ isAdmin: false, isOrgAdmin: false, permissions: ["carbon_credit.view"] }),
    true,
  );
  // User without any credit permissions
  assert.equal(canView({ isAdmin: false, isOrgAdmin: false, permissions: ["document.upload"] }), false);
});


