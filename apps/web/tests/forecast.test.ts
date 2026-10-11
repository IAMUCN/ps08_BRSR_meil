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

const mockMonthlySeries: HistoricalObservation[] = [
  {
    periodId: "p1",
    periodLabel: "Jan 2026",
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    valueTco2e: 100,
    approvedRecordCount: 4,
    pendingRecordCount: 0,
    uncalculatedRecordCount: 0,
  },
  {
    periodId: "p2",
    periodLabel: "Feb 2026",
    startDate: "2026-02-01",
    endDate: "2026-02-28",
    valueTco2e: 110,
    approvedRecordCount: 5,
    pendingRecordCount: 0,
    uncalculatedRecordCount: 0,
  },
  {
    periodId: "p3",
    periodLabel: "Mar 2026",
    startDate: "2026-03-01",
    endDate: "2026-03-31",
    valueTco2e: 120,
    approvedRecordCount: 6,
    pendingRecordCount: 0,
    uncalculatedRecordCount: 0,
  },
  {
    periodId: "p4",
    periodLabel: "Apr 2026",
    startDate: "2026-04-01",
    endDate: "2026-04-30",
    valueTco2e: 130,
    approvedRecordCount: 4,
    pendingRecordCount: 0,
    uncalculatedRecordCount: 0,
  },
  {
    periodId: "p5",
    periodLabel: "May 2026",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    valueTco2e: 140,
    approvedRecordCount: 5,
    pendingRecordCount: 0,
    uncalculatedRecordCount: 0,
  },
];

test("forecast unit conversion: correctly normalizes kgCO2e and tCO2e", () => {
  assert.equal(toTonnesCo2e(1000, "kgCO2e"), 1);
  assert.equal(toTonnesCo2e(500000, "kg"), 500);
  assert.equal(toTonnesCo2e(120, "tCO2e"), 120);
  assert.equal(toTonnesCo2e(0, "tCO2e"), 0);
  assert.equal(toTonnesCo2e(null, "tCO2e"), 0);
  assert.equal(toTonnesCo2e(undefined, "tCO2e"), 0);
});

test("forecast frequency detection: identifies monthly, quarterly, annual, and irregular reporting cadences", () => {
  assert.equal(detectReportingFrequency(mockMonthlySeries), "MONTHLY");

  const quarterlySeries: HistoricalObservation[] = [
    {
      periodId: "q1",
      periodLabel: "Q1 2025",
      startDate: "2025-04-01",
      endDate: "2025-06-30",
      valueTco2e: 200,
      approvedRecordCount: 2,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "q2",
      periodLabel: "Q2 2025",
      startDate: "2025-07-01",
      endDate: "2025-09-30",
      valueTco2e: 220,
      approvedRecordCount: 3,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "q3",
      periodLabel: "Q3 2025",
      startDate: "2025-10-01",
      endDate: "2025-12-31",
      valueTco2e: 240,
      approvedRecordCount: 4,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];
  assert.equal(detectReportingFrequency(quarterlySeries), "QUARTERLY");

  const annualSeries: HistoricalObservation[] = [
    {
      periodId: "y1",
      periodLabel: "FY 2023-24",
      startDate: "2023-04-01",
      endDate: "2024-03-31",
      valueTco2e: 1000,
      approvedRecordCount: 10,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "y2",
      periodLabel: "FY 2024-25",
      startDate: "2024-04-01",
      endDate: "2025-03-31",
      valueTco2e: 1050,
      approvedRecordCount: 12,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "y3",
      periodLabel: "FY 2025-26",
      startDate: "2025-04-01",
      endDate: "2026-03-31",
      valueTco2e: 1100,
      approvedRecordCount: 14,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];
  assert.equal(detectReportingFrequency(annualSeries), "ANNUAL");
});

test("forecast data coverage: identifies missing periods and quality limitations", () => {
  const gappedSeries: HistoricalObservation[] = [
    {
      periodId: "p1",
      periodLabel: "Jan 2026",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
      valueTco2e: 100,
      approvedRecordCount: 2,
      pendingRecordCount: 1,
      uncalculatedRecordCount: 1,
    },
    // Missing Feb and Mar!
    {
      periodId: "p4",
      periodLabel: "Apr 2026",
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      valueTco2e: 130,
      approvedRecordCount: 3,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
    {
      periodId: "p5",
      periodLabel: "May 2026",
      startDate: "2026-05-01",
      endDate: "2026-05-31",
      valueTco2e: 140,
      approvedRecordCount: 3,
      pendingRecordCount: 0,
      uncalculatedRecordCount: 0,
    },
  ];

  const assessment = assessDataCoverage(gappedSeries, 5);
  assert.equal(assessment.hasMissingPeriods, true);
  assert.equal(assessment.missingPeriodGaps.length, 1);
  assert.equal(assessment.missingPeriodGaps[0].afterPeriodLabel, "Jan 2026");
  assert.equal(assessment.missingPeriodGaps[0].beforePeriodLabel, "Apr 2026");
  assert.equal(assessment.dataQualityState, "poor_validation");
  assert.equal(assessment.uncalculatedRecordsCount, 1);
  assert.equal(assessment.pendingApprovalRecordsCount, 1);
  assert.ok(assessment.limitations.some((l) => l.includes("Historical gaps detected")));
});

test("forecast error metrics: computes MAE, RMSE, and MAPE accurately", () => {
  const actuals = [100, 120, 150];
  const predicted = [90, 130, 150];
  // Errors: 10, 10, 0
  // MAE = (10 + 10 + 0) / 3 = 6.667
  // RMSE = sqrt((100 + 100 + 0) / 3) = sqrt(66.667) = 8.165
  // MAPE = ((10/100) + (10/120) + 0) / 3 * 100 = (0.1 + 0.0833 + 0)/3 * 100 = 6.1%
  const metrics = computeErrorMetrics(actuals, predicted);
  assert.equal(metrics.mae, 6.667);
  assert.equal(metrics.rmse, 8.165);
  assert.equal(metrics.mape, 6.1);
});

test("forecast linear trend: fits slope, intercept, and generates future values", () => {
  const values = [100, 110, 120, 130]; // Exact linear slope = 10, intercept = 100
  const fit = fitLinearTrend(values, 2);
  assert.equal(fit.slope, 10);
  assert.equal(fit.intercept, 100);
  assert.deepEqual(fit.predictions, [140, 150]);
  assert.equal(fit.residualStdError, 0); // Perfect fit
});

test("forecast exponential smoothing: produces smooth projections", () => {
  const values = [100, 110, 120, 130, 140];
  const fit = fitExponentialSmoothing(values, 2);
  assert.equal(fit.predictions.length, 2);
  assert.ok(fit.predictions[0] > 140, "Should continue upward level and trend");
  assert.ok(fit.predictions[1] > fit.predictions[0], "Step 2 should exceed Step 1");
});

test("forecast chronological backtesting: strictly tests past-to-future without leakage", () => {
  const values = [100, 110, 120, 130, 140];
  const backtest = runChronologicalBacktest(values);
  assert.equal(backtest.canBacktest, true);
  assert.equal(backtest.trainingCount, 3); // Train on 100, 110, 120
  assert.equal(backtest.testCount, 2); // Test on 130, 140
  assert.ok(backtest.metrics !== null);
  // Linear trend on [100, 110, 120] perfectly predicts [130, 140]
  assert.equal(backtest.selectedModel, "linear_trend");
  assert.equal(backtest.metrics?.mae, 0);
  assert.equal(backtest.metrics?.relativeImprovementPercent, 100);
});

test("forecast prediction intervals: computes valid 80% and 95% uncertainty bounds", () => {
  const intervals = calculatePredictionInterval(150, 1, 5); // pred = 150, step = 1, sigma = 5
  // 80% CI: 1.282 * 5 = 6.41 -> [143.59, 156.41]
  // 95% CI: 1.96 * 5 = 9.8 -> [140.2, 159.8]
  assert.equal(intervals.confidenceInterval80.lower, 143.59);
  assert.equal(intervals.confidenceInterval80.upper, 156.41);
  assert.equal(intervals.confidenceInterval95.lower, 140.2);
  assert.equal(intervals.confidenceInterval95.upper, 159.8);
  assert.ok(intervals.confidenceInterval95.lower <= intervals.confidenceInterval80.lower);
  assert.ok(intervals.confidenceInterval95.upper >= intervals.confidenceInterval80.upper);
});

test("forecast insufficient data: gracefully refuses to fabricate predictions with fewer than 3 periods", () => {
  const shortSeries = mockMonthlySeries.slice(0, 2); // Only 2 periods
  const result = generateForecast({
    historical: shortSeries,
    scopeTarget: "SCOPE_1",
    scopeName: "Scope 1",
  });

  assert.equal(result.canForecast, false);
  assert.equal(result.selectedModel, "none");
  assert.equal(result.predictions.length, 0);
  assert.ok(result.insufficientDataReason?.includes("minimum of 3-4 consecutive periods"));
  assert.ok(result.recommendations.length > 0);
});

test("forecast pipeline: produces end-to-end forecast with clear estimates and validation metrics", () => {
  const result = generateForecast({
    historical: mockMonthlySeries,
    scopeTarget: "SCOPE_1",
    scopeName: "Scope 1",
    horizonPeriods: 2,
  });

  assert.equal(result.canForecast, true);
  assert.equal(result.selectedModel, "linear_trend");
  assert.equal(result.predictions.length, 2);
  assert.equal(result.predictions[0].isEstimate, true);
  assert.equal(result.predictions[1].isEstimate, true);
  assert.equal(result.predictions[0].predictedTco2e, 150);
  assert.equal(result.predictions[1].predictedTco2e, 160);
  assert.ok(result.trainingWindow !== null);
  assert.ok(result.backtestWindow !== null);
  assert.equal(result.trainingWindow?.observationCount, 3);
  assert.equal(result.backtestWindow?.testCount, 2);
});
