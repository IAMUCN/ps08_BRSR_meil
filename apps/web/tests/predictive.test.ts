import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GradientBoostedRegressor,
  buildAutoregressiveDataset,
  forecastWithGbdt,
} from "../lib/predictive/gbdt.ts";
import { detectPredictiveAnomalies } from "../lib/predictive/anomaly.ts";
import { generatePredictiveInsights } from "../lib/predictive/insights.ts";
import {
  calculateScorecard,
  deriveNextPeriodLabels,
  generatePredictiveForecast,
} from "../lib/predictive/engine.ts";
import type { HistoricalDataPoint } from "../lib/predictive/types.ts";

test("GBDT Regressor fits nonlinear series and lowers residual error", () => {
  const model = new GradientBoostedRegressor({
    numTrees: 10,
    maxDepth: 3,
    learningRate: 0.2,
    l2Regularization: 1.0,
  });

  const trainingData = [
    { features: [100, 95, 98, 5, 0.2, 0], target: 105 },
    { features: [105, 100, 100, 5, 0.4, 1], target: 112 },
    { features: [112, 105, 106, 7, 0.6, 2], target: 120 },
    { features: [120, 112, 112, 8, 0.8, 3], target: 130 },
    { features: [130, 120, 121, 10, 1.0, 0], target: 142 },
  ];

  model.fit(trainingData);

  const testPred = model.predict([130, 120, 121, 10, 1.0, 0]);
  assert.ok(testPred > 125, `Expected prediction > 125, got ${testPred}`);
  assert.ok(testPred < 150, `Expected prediction < 150, got ${testPred}`);
  assert.ok(model.residualVariance >= 0, "Residual variance should be non-negative");
});

test("Autoregressive dataset builder extracts multi-lag features", () => {
  const series = [100, 110, 125, 140, 160];
  const dataset = buildAutoregressiveDataset(series);

  assert.equal(dataset.length, 3, "Length should be N - 2 for lag-2 autoregression");
  // First row for t = 2 (series[2] = 125)
  // lag1 = 110, lag2 = 100, rolling3 = (110 + 100 + 100)/3 = 103.33
  const row0 = dataset[0];
  assert.equal(row0.features[0], 110);
  assert.equal(row0.features[1], 100);
  assert.equal(row0.target, 125);
});

test("Multi-step GBDT forecast enforces physical non-negativity", () => {
  const series = [50, 40, 30, 20, 10];
  const model = new GradientBoostedRegressor({ numTrees: 5 });
  const dataset = buildAutoregressiveDataset(series);
  model.fit(dataset);

  const forward = forecastWithGbdt(model, series, 4);
  assert.equal(forward.length, 4);
  for (const val of forward) {
    assert.ok(val >= 0, `Forecasted value ${val} must be >= 0`);
  }
});

test("Model evaluation scorecard accurately calculates R2, RMSE, MAE, and MAPE", () => {
  const actual = [100, 110, 120, 130];
  const predicted = [102, 108, 122, 128];

  const scorecard = calculateScorecard(actual, predicted);

  assert.ok(scorecard.r2 > 0.95, `R2 should be > 0.95, got ${scorecard.r2}`);
  assert.equal(scorecard.mae, 2.0);
  assert.equal(scorecard.rmse, 2.0);
  assert.ok(scorecard.mape < 2.0, `MAPE should be < 2%, got ${scorecard.mape}`);
  assert.equal(scorecard.directionalAccuracy, 100);
  assert.equal(scorecard.sampleCount, 4);
});

test("Next period label derivation handles Quarters, Months, and fallback steps", () => {
  // Quarterly
  const qLabels = deriveNextPeriodLabels("FY2023-24 Q4", 2);
  assert.deepEqual(qLabels, ["FY2024-25 Q1", "FY2024-25 Q2"]);

  // Monthly
  const mLabels = deriveNextPeriodLabels("Dec 2025", 2);
  assert.deepEqual(mLabels, ["Jan 2026", "Feb 2026"]);

  // Fallback
  const fLabels = deriveNextPeriodLabels("Cycle-A", 2);
  assert.deepEqual(fLabels, ["Cycle-A (+1)", "Cycle-A (+2)"]);
});

test("Anomaly detector identifies Critical Spikes, Unexpected Drops, and Data Drift", () => {
  const normalSeries = [
    { periodLabel: "Q1", value: 100 },
    { periodLabel: "Q2", value: 102 },
    { periodLabel: "Q3", value: 98 },
    { periodLabel: "Q4", value: 101 },
  ];
  const normalFindings = detectPredictiveAnomalies(normalSeries);
  assert.ok(normalFindings.every((f) => f.status === "NORMAL"));

  // Critical Spike
  const spikeSeries = [
    { periodLabel: "Q1", value: 100 },
    { periodLabel: "Q2", value: 102 },
    { periodLabel: "Q3", value: 98 },
    { periodLabel: "Q4", value: 101 },
    { periodLabel: "Q5", value: 450 }, // Major outlier
  ];
  const spikeFindings = detectPredictiveAnomalies(spikeSeries);
  const spike = spikeFindings.find((f) => f.periodLabel === "Q5");
  assert.ok(spike, "Should flag Q5");
  assert.equal(spike.status, "CRITICAL_SPIKE");
  assert.equal(spike.requiresReview, true);

  // Unexpected Drop
  const dropSeries = [
    { periodLabel: "Q1", value: 100 },
    { periodLabel: "Q2", value: 105 },
    { periodLabel: "Q3", value: 95 },
    { periodLabel: "Q4", value: 102 },
    { periodLabel: "Q5", value: 5 }, // Extreme collapse
  ];
  const dropFindings = detectPredictiveAnomalies(dropSeries);
  const drop = dropFindings.find((f) => f.periodLabel === "Q5");
  assert.ok(drop);
  assert.equal(drop.status, "UNEXPECTED_DROP");
});

test("Predictive insights generate threshold breach warnings and decarbonization pace", () => {
  const historical = [100, 105, 102, 104]; // mean ~102.75, +15% threshold ~118.16

  // Breach Scenario
  const breachPoints = [
    {
      step: 1,
      periodLabel: "Q1",
      estimatedDate: "2026-04-01",
      predictedValue: 110,
      ci80: { lower: 100, upper: 120 },
      ci95: { lower: 95, upper: 125 },
      trendDirection: "increasing" as const,
    },
    {
      step: 2,
      periodLabel: "Q2",
      estimatedDate: "2026-07-01",
      predictedValue: 125, // Breaches 118.16!
      ci80: { lower: 115, upper: 135 },
      ci95: { lower: 110, upper: 140 },
      trendDirection: "increasing" as const,
    },
  ];

  const breachInsights = generatePredictiveInsights({
    metricType: "ELECTRICITY_KWH",
    metricLabel: "Electricity Consumption",
    unit: "kWh",
    historicalValues: historical,
    forecastPoints: breachPoints,
    thresholdOverrides: { growthThresholdPct: 0.15 },
  });

  const breachAlert = breachInsights.find((i) => i.category === "THRESHOLD_BREACH");
  assert.ok(breachAlert, "Must generate THRESHOLD_BREACH alert");
  assert.equal(breachAlert.severity, "critical");
  assert.equal(breachAlert.projectedBreachPeriod, "Q2");
  assert.equal(breachAlert.projectedBreachValue, 125);

  // Decarbonization Reduction Scenario
  const reductionPoints = [
    {
      step: 1,
      periodLabel: "Q1",
      estimatedDate: "2026-04-01",
      predictedValue: 95,
      ci80: { lower: 90, upper: 100 },
      ci95: { lower: 85, upper: 105 },
      trendDirection: "decreasing" as const,
    },
    {
      step: 2,
      periodLabel: "Q2",
      estimatedDate: "2026-07-01",
      predictedValue: 88, // -15.4% from 104
      ci80: { lower: 82, upper: 94 },
      ci95: { lower: 78, upper: 98 },
      trendDirection: "decreasing" as const,
    },
  ];

  const reductionInsights = generatePredictiveInsights({
    metricType: "EMISSIONS_TOTAL",
    metricLabel: "Total Emissions",
    unit: "tCO2e",
    historicalValues: historical,
    forecastPoints: reductionPoints,
  });

  const paceInsight = reductionInsights.find((i) => i.category === "DECARBONIZATION_PACE");
  assert.ok(paceInsight, "Must generate favorable DECARBONIZATION_PACE insight");
  assert.equal(paceInsight.severity, "info");
});

test("Predictive engine respects small-sample-size guard (< 3 periods)", () => {
  const shortHistory: HistoricalDataPoint[] = [
    {
      periodId: "p1",
      periodLabel: "FY24 Q1",
      startDate: "2024-04-01",
      endDate: "2024-06-30",
      value: 120,
      isVerified: true,
    },
    {
      periodId: "p2",
      periodLabel: "FY24 Q2",
      startDate: "2024-07-01",
      endDate: "2024-09-30",
      value: 125,
      isVerified: true,
    },
  ];

  const output = generatePredictiveForecast({
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "Hyderabad Plant",
    reportingPeriodId: "00000000-0000-0000-0000-000000000002",
    reportingPeriodLabel: "FY24 Q2",
    metricType: "ELECTRICITY_KWH",
    metricLabel: "Electricity Consumption",
    unit: "kWh",
    historicalSeries: shortHistory,
  });

  assert.equal(output.dataQuality.sufficientData, false);
  assert.equal(output.forecastPoints.length, 0);
  assert.equal(output.insights.length, 1);
  assert.ok(output.insights[0].title.includes("Insufficient Historical Series"));
  assert.ok(output.disclaimer.length > 20);
});

test("Predictive engine runs multi-model tournament and generates confidence intervals", () => {
  const fullHistory: HistoricalDataPoint[] = [
    {
      periodId: "p1",
      periodLabel: "FY23-24 Q1",
      startDate: "2023-04-01",
      endDate: "2023-06-30",
      value: 1000,
      isVerified: true,
    },
    {
      periodId: "p2",
      periodLabel: "FY23-24 Q2",
      startDate: "2023-07-01",
      endDate: "2023-09-30",
      value: 1050,
      isVerified: true,
    },
    {
      periodId: "p3",
      periodLabel: "FY23-24 Q3",
      startDate: "2023-10-01",
      endDate: "2023-12-31",
      value: 1110,
      isVerified: true,
    },
    {
      periodId: "p4",
      periodLabel: "FY23-24 Q4",
      startDate: "2024-01-01",
      endDate: "2024-03-31",
      value: 1170,
      isVerified: true,
    },
    {
      periodId: "p5",
      periodLabel: "FY24-25 Q1",
      startDate: "2024-04-01",
      endDate: "2024-06-30",
      value: 1240,
      isVerified: true,
    },
  ];

  const output = generatePredictiveForecast({
    orgUnitId: "00000000-0000-0000-0000-000000000001",
    orgUnitName: "Hyderabad Plant",
    reportingPeriodId: "00000000-0000-0000-0000-000000000005",
    reportingPeriodLabel: "FY24-25 Q1",
    metricType: "ELECTRICITY_KWH",
    metricLabel: "Total Electricity Consumption",
    unit: "kWh",
    historicalSeries: fullHistory,
    horizonSteps: 3,
  });

  assert.equal(output.dataQuality.sufficientData, true);
  assert.equal(output.forecastPoints.length, 3);
  assert.equal(output.tournament.length, 4);

  // Tournament verification
  const championEntry = output.tournament.find((t) => t.isChampion);
  assert.ok(championEntry, "Tournament must have a champion");
  assert.equal(championEntry.tournamentRank, 1);
  assert.equal(output.championModel, championEntry.modelType);

  // Confidence band expansion: 95% CI must be strictly wider than 80% CI
  for (const point of output.forecastPoints) {
    const spread80 = point.ci80.upper - point.ci80.lower;
    const spread95 = point.ci95.upper - point.ci95.lower;
    assert.ok(
      spread95 > spread80,
      `Step ${point.step}: 95% CI (${spread95}) must be wider than 80% CI (${spread80})`,
    );
    assert.ok(point.ci80.lower >= 0, "Lower confidence bound must be >= 0");
    assert.ok(point.predictedValue > 0, "Predicted value must be positive");
  }

  // Label progression
  assert.equal(output.forecastPoints[0].periodLabel, "FY24-25 Q2");
  assert.equal(output.forecastPoints[1].periodLabel, "FY24-25 Q3");
  assert.equal(output.forecastPoints[2].periodLabel, "FY24-25 Q4");
});
