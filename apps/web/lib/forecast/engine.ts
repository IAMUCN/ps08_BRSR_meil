/**
 * Pure calculation logic for TraceESG Emissions Forecasting.
 *
 * Implements:
 * 1. Historical data coverage & quality assessment (reporting frequency, missing periods, unit uniformity)
 * 2. Scope & category selection based on actual data availability
 * 3. Naive baseline persistence & drift models
 * 4. Linear trend & Exponential smoothing statistical models
 * 5. Strict chronological backtesting with validation metrics (MAE, RMSE, MAPE)
 * 6. Model selection and prediction intervals (80% and 95% uncertainty bounds)
 * 7. Defensive handling of small sample sizes / insufficient data / poor validation
 */

export type ScopeCode = "SCOPE_1" | "SCOPE_2" | "SCOPE_3";
export type ForecastScopeTarget = ScopeCode | "TOTAL";

export type HistoricalObservation = {
  periodId: string;
  periodLabel: string;
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
  valueTco2e: number;
  approvedRecordCount: number;
  pendingRecordCount: number;
  uncalculatedRecordCount: number;
};

export type ReportingFrequency = "MONTHLY" | "QUARTERLY" | "ANNUAL" | "IRREGULAR";

export type PeriodGap = {
  afterPeriodLabel: string;
  beforePeriodLabel: string;
  gapDays: number;
  expectedIntervalDays: number;
  estimatedMissingPeriods: number;
};

export type DataCoverageAssessment = {
  totalConfiguredPeriods: number;
  periodsWithData: number;
  coverageRatioPercent: number;
  detectedFrequency: ReportingFrequency;
  hasMissingPeriods: boolean;
  missingPeriodGaps: PeriodGap[];
  uncalculatedRecordsCount: number;
  pendingApprovalRecordsCount: number;
  dataQualityState: "sufficient" | "insufficient" | "poor_validation";
  limitations: string[];
};

export type ValidationMetrics = {
  mae: number; // Mean Absolute Error in tCO2e
  rmse: number; // Root Mean Square Error in tCO2e
  mape: number; // Mean Absolute Percentage Error (%)
  baselineMae: number; // Benchmark Naive MAE
  baselineRmse: number; // Benchmark Naive RMSE
  baselineMape: number; // Benchmark Naive MAPE
  relativeImprovementPercent: number; // Positive if model beats naive baseline
};

export type ConfidenceInterval = {
  lower: number; // Clamped to >= 0
  upper: number;
};

export type ForecastPoint = {
  periodIndex: number;
  periodLabel: string;
  estimatedStartDate: string;
  estimatedEndDate: string;
  predictedTco2e: number;
  confidenceInterval80: ConfidenceInterval;
  confidenceInterval95: ConfidenceInterval;
  isEstimate: true;
};

export type SelectedModelType =
  | "linear_trend"
  | "exponential_smoothing"
  | "naive_baseline"
  | "none";

export type ForecastResult = {
  scopeTarget: ForecastScopeTarget;
  scopeName: string;
  categoryName?: string;
  unit: "tCO2e";
  canForecast: boolean;
  insufficientDataReason?: string;
  assessment: DataCoverageAssessment;
  selectedModel: SelectedModelType;
  modelName: string;
  trainingWindow: {
    startPeriod: string;
    endPeriod: string;
    observationCount: number;
  } | null;
  backtestWindow: {
    startPeriod: string;
    endPeriod: string;
    testCount: number;
  } | null;
  validationMetrics: ValidationMetrics | null;
  historical: HistoricalObservation[];
  predictions: ForecastPoint[];
  recommendations: string[];
};

/**
 * Normalizes any quantity into metric tonnes of CO2 equivalent (tCO2e).
 */
export function toTonnesCo2e(value: number | null | undefined, unit: string | null | undefined): number {
  if (value === null || value === undefined || isNaN(value)) return 0;
  const cleanUnit = (unit ?? "").trim().toLowerCase();
  if (cleanUnit === "kgco2e" || cleanUnit === "kg") {
    return value / 1000;
  }
  return value;
}

/**
 * Detects the reporting cadence from chronological observations and period durations.
 */
export function detectReportingFrequency(observations: HistoricalObservation[]): ReportingFrequency {
  if (observations.length === 0) return "IRREGULAR";

  // Check individual period durations (endDate - startDate in days)
  const durationsDays: number[] = observations.map((o) => {
    const s = new Date(o.startDate).getTime();
    const e = new Date(o.endDate).getTime();
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  });

  durationsDays.sort((a, b) => a - b);
  const medianDuration = durationsDays[Math.floor(durationsDays.length / 2)];

  if (medianDuration >= 27 && medianDuration <= 32) return "MONTHLY";
  if (medianDuration >= 88 && medianDuration <= 93) return "QUARTERLY";
  if (medianDuration >= 355 && medianDuration <= 367) return "ANNUAL";

  // Fallback to start-to-start differences
  if (observations.length >= 2) {
    const diffsDays: number[] = [];
    for (let i = 1; i < observations.length; i++) {
      const prevStart = new Date(observations[i - 1].startDate).getTime();
      const currStart = new Date(observations[i].startDate).getTime();
      const diff = Math.round((currStart - prevStart) / (1000 * 60 * 60 * 24));
      if (diff > 0) diffsDays.push(diff);
    }
    if (diffsDays.length > 0) {
      diffsDays.sort((a, b) => a - b);
      const minDiff = diffsDays[0];
      if (minDiff >= 25 && minDiff <= 35) return "MONTHLY";
      if (minDiff >= 80 && minDiff <= 100) return "QUARTERLY";
      if (minDiff >= 340 && minDiff <= 380) return "ANNUAL";
    }
  }

  return "IRREGULAR";
}

/**
 * Assesses data coverage, completeness, missing periods, and quality before forecasting.
 */
export function assessDataCoverage(
  observations: HistoricalObservation[],
  totalConfiguredPeriods: number = observations.length,
): DataCoverageAssessment {
  const sorted = [...observations].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const periodsWithData = sorted.filter((o) => o.valueTco2e > 0).length;
  const coverageRatioPercent =
    totalConfiguredPeriods > 0
      ? Math.round((periodsWithData / totalConfiguredPeriods) * 1000) / 10
      : 0;

  const frequency = detectReportingFrequency(sorted);
  const limitations: string[] = [];
  const missingPeriodGaps: PeriodGap[] = [];

  // Determine standard expected interval in days
  let expectedInterval = 30;
  if (frequency === "QUARTERLY") expectedInterval = 91;
  else if (frequency === "ANNUAL") expectedInterval = 365;

  let uncalculatedRecordsCount = 0;
  let pendingApprovalRecordsCount = 0;

  for (const obs of sorted) {
    uncalculatedRecordsCount += obs.uncalculatedRecordCount;
    pendingApprovalRecordsCount += obs.pendingRecordCount;
  }

  // Check for gaps between chronological periods
  if (sorted.length >= 2 && frequency !== "IRREGULAR") {
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(sorted[i - 1].endDate).getTime();
      const currStart = new Date(sorted[i].startDate).getTime();
      const gapDays = Math.round((currStart - prevEnd) / (1000 * 60 * 60 * 24));

      // If gap exceeds 1.5x expected interval, identify as missing period gap
      if (gapDays > expectedInterval * 1.5) {
        const estimatedMissing = Math.max(1, Math.round(gapDays / expectedInterval) - 1);
        missingPeriodGaps.push({
          afterPeriodLabel: sorted[i - 1].periodLabel,
          beforePeriodLabel: sorted[i].periodLabel,
          gapDays,
          expectedIntervalDays: expectedInterval,
          estimatedMissingPeriods: estimatedMissing,
        });
      }
    }
  }

  const hasMissingPeriods = missingPeriodGaps.length > 0;

  // Compile specific limitations
  if (periodsWithData < 3) {
    limitations.push(
      `Insufficient historical depth: ${periodsWithData} reporting period(s) available. Minimum 3 required for chronological validation.`,
    );
  }
  if (hasMissingPeriods) {
    limitations.push(
      `Historical gaps detected: ${missingPeriodGaps.length} missing period window(s) identified in timeline.`,
    );
  }
  if (uncalculatedRecordsCount > 0) {
    limitations.push(
      `${uncalculatedRecordsCount} verified record(s) lack conversion factors and are excluded from calculations.`,
    );
  }
  if (pendingApprovalRecordsCount > 0) {
    limitations.push(
      `${pendingApprovalRecordsCount} record(s) are pending corporate approval and not yet official.`,
    );
  }

  let dataQualityState: "sufficient" | "insufficient" | "poor_validation" = "sufficient";
  if (periodsWithData < 3) {
    dataQualityState = "insufficient";
  } else if (hasMissingPeriods || coverageRatioPercent < 60) {
    dataQualityState = "poor_validation";
  }

  return {
    totalConfiguredPeriods,
    periodsWithData,
    coverageRatioPercent,
    detectedFrequency: frequency,
    hasMissingPeriods,
    missingPeriodGaps,
    uncalculatedRecordsCount,
    pendingApprovalRecordsCount,
    dataQualityState,
    limitations,
  };
}

/**
 * Computes standard forecast error metrics (MAE, RMSE, MAPE).
 */
export function computeErrorMetrics(actuals: number[], predicted: number[]): { mae: number; rmse: number; mape: number } {
  if (actuals.length === 0 || actuals.length !== predicted.length) {
    return { mae: 0, rmse: 0, mape: 0 };
  }

  let absErrorSum = 0;
  let sqErrorSum = 0;
  let pctErrorSum = 0;
  let nonZeroCount = 0;

  for (let i = 0; i < actuals.length; i++) {
    const act = actuals[i];
    const pred = predicted[i];
    const err = Math.abs(act - pred);

    absErrorSum += err;
    sqErrorSum += err * err;

    if (act > 0.0001) {
      pctErrorSum += (err / act) * 100;
      nonZeroCount++;
    }
  }

  const n = actuals.length;
  const mae = Math.round((absErrorSum / n) * 1000) / 1000;
  const rmse = Math.round(Math.sqrt(sqErrorSum / n) * 1000) / 1000;
  const mape =
    nonZeroCount > 0
      ? Math.round((pctErrorSum / nonZeroCount) * 10) / 10
      : 0;

  return { mae, rmse, mape };
}

/**
 * Fits a Linear Trend model using Ordinary Least Squares (OLS).
 */
export function fitLinearTrend(
  values: number[],
  horizonCount: number,
): { slope: number; intercept: number; predictions: number[]; residualStdError: number } {
  const n = values.length;
  if (n === 0) {
    return { slope: 0, intercept: 0, predictions: [], residualStdError: 0 };
  }
  if (n === 1) {
    return {
      slope: 0,
      intercept: values[0],
      predictions: Array(horizonCount).fill(values[0]),
      residualStdError: 0,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
  const intercept = (sumY - slope * sumX) / n;

  // Compute residuals
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const fitted = intercept + slope * i;
    const res = values[i] - fitted;
    sse += res * res;
  }
  const residualStdError = n > 2 ? Math.sqrt(sse / (n - 2)) : Math.sqrt(sse / Math.max(1, n));

  // Generate future predictions
  const predictions: number[] = [];
  for (let h = 1; h <= horizonCount; h++) {
    const futureX = n - 1 + h;
    const pred = Math.max(0, intercept + slope * futureX);
    predictions.push(Math.round(pred * 1000) / 1000);
  }

  return {
    slope: Math.round(slope * 1000) / 1000,
    intercept: Math.round(intercept * 1000) / 1000,
    predictions,
    residualStdError: Math.round(residualStdError * 1000) / 1000,
  };
}

/**
 * Fits Holt's Linear Exponential Smoothing model.
 * Level: L_t = alpha * y_t + (1 - alpha) * (L_{t-1} + b_{t-1})
 * Trend: b_t = beta * (L_t - L_{t-1}) + (1 - beta) * b_{t-1}
 */
export function fitExponentialSmoothing(
  values: number[],
  horizonCount: number,
  alpha: number = 0.35,
  beta: number = 0.15,
): { predictions: number[]; residualStdError: number } {
  const n = values.length;
  if (n === 0) {
    return { predictions: [], residualStdError: 0 };
  }
  if (n === 1) {
    return { predictions: Array(horizonCount).fill(values[0]), residualStdError: 0 };
  }

  let level = values[0];
  let trend = values[1] - values[0];
  let sse = 0;

  for (let i = 1; i < n; i++) {
    const prevLevel = level;
    const prevTrend = trend;
    const oneStepAhead = prevLevel + prevTrend;
    const err = values[i] - oneStepAhead;
    sse += err * err;

    level = alpha * values[i] + (1 - alpha) * (prevLevel + prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * prevTrend;
  }

  const residualStdError = n > 2 ? Math.sqrt(sse / (n - 2)) : Math.sqrt(sse / Math.max(1, n));

  const predictions: number[] = [];
  for (let h = 1; h <= horizonCount; h++) {
    const pred = Math.max(0, level + h * trend);
    predictions.push(Math.round(pred * 1000) / 1000);
  }

  return {
    predictions,
    residualStdError: Math.round(residualStdError * 1000) / 1000,
  };
}

/**
 * Performs Chronological Backtesting to compare Naive Baseline against Statistical Models.
 * Strictly respects chronological time direction without data leakage.
 */
export function runChronologicalBacktest(values: number[]): {
  canBacktest: boolean;
  selectedModel: SelectedModelType;
  modelName: string;
  trainingCount: number;
  testCount: number;
  metrics: ValidationMetrics | null;
  residualStdError: number;
} {
  const n = values.length;
  // Need at least 3 points: train on first 2, test on 3rd; or for n >= 4, test on last 1-2 points.
  if (n < 3) {
    return {
      canBacktest: false,
      selectedModel: "none",
      modelName: "None (Insufficient Data)",
      trainingCount: n,
      testCount: 0,
      metrics: null,
      residualStdError: 0,
    };
  }

  const testCount = n >= 5 ? 2 : 1;
  const trainCount = n - testCount;

  const trainValues = values.slice(0, trainCount);
  const testValues = values.slice(trainCount);

  // 1. Naive Baseline (Persistence: predict last known train value)
  const lastTrainVal = trainValues[trainValues.length - 1];
  const naivePreds = Array(testCount).fill(lastTrainVal);
  const naiveMetrics = computeErrorMetrics(testValues, naivePreds);

  // 2. Candidate Model A: Linear Trend
  const linearFit = fitLinearTrend(trainValues, testCount);
  const linearMetrics = computeErrorMetrics(testValues, linearFit.predictions);

  // 3. Candidate Model B: Exponential Smoothing
  const expFit = fitExponentialSmoothing(trainValues, testCount);
  const expMetrics = computeErrorMetrics(testValues, expFit.predictions);

  // Compare candidates against Naive baseline
  let selectedModel: SelectedModelType = "naive_baseline";
  let modelName = "Naive Persistence (Last-Value Baseline)";
  let selectedMetrics = naiveMetrics;
  let residualStdError = linearFit.residualStdError;

  // Determine if statistical model beats naive baseline on MAE
  const candidates: Array<{
    type: SelectedModelType;
    name: string;
    metrics: typeof linearMetrics;
    resStd: number;
  }> = [
    {
      type: "linear_trend",
      name: "Linear Trend (OLS Regression)",
      metrics: linearMetrics,
      resStd: linearFit.residualStdError,
    },
    {
      type: "exponential_smoothing",
      name: "Holt's Exponential Smoothing",
      metrics: expMetrics,
      resStd: expFit.residualStdError,
    },
  ];

  // Pick candidate with lowest MAE, breaking ties with RMSE
  candidates.sort((a, b) => a.metrics.mae - b.metrics.mae || a.metrics.rmse - b.metrics.rmse);
  const bestCandidate = candidates[0];

  if (bestCandidate.metrics.mae <= naiveMetrics.mae) {
    selectedModel = bestCandidate.type;
    modelName = bestCandidate.name;
    selectedMetrics = bestCandidate.metrics;
    residualStdError = bestCandidate.resStd;
  } else {
    // Naive baseline proved more accurate on backtest holdout
    selectedModel = "naive_baseline";
    modelName = "Naive Baseline (Persistence Benchmark)";
    selectedMetrics = naiveMetrics;
    residualStdError = Math.max(0.1, naiveMetrics.rmse);
  }

  const relativeImprovement =
    naiveMetrics.mae > 0
      ? Math.round(((naiveMetrics.mae - selectedMetrics.mae) / naiveMetrics.mae) * 1000) / 10
      : 0;

  const fullMetrics: ValidationMetrics = {
    mae: selectedMetrics.mae,
    rmse: selectedMetrics.rmse,
    mape: selectedMetrics.mape,
    baselineMae: naiveMetrics.mae,
    baselineRmse: naiveMetrics.rmse,
    baselineMape: naiveMetrics.mape,
    relativeImprovementPercent: relativeImprovement,
  };

  return {
    canBacktest: true,
    selectedModel,
    modelName,
    trainingCount: trainCount,
    testCount,
    metrics: fullMetrics,
    residualStdError: Math.max(0.01, residualStdError),
  };
}

/**
 * Computes prediction intervals for a point forecast at horizon h.
 */
export function calculatePredictionInterval(
  predictedValue: number,
  horizonStep: number,
  residualStdError: number,
): { confidenceInterval80: ConfidenceInterval; confidenceInterval95: ConfidenceInterval } {
  // Uncertainty expands over the forecast horizon: sigma_h = sigma_e * sqrt(h)
  const horizonInflation = Math.sqrt(horizonStep);
  const sigma = Math.max(0.1, residualStdError * horizonInflation);

  // 80% CI: z = 1.282
  // 95% CI: z = 1.960
  const ci80Margin = 1.282 * sigma;
  const ci95Margin = 1.96 * sigma;

  return {
    confidenceInterval80: {
      lower: Math.max(0, Math.round((predictedValue - ci80Margin) * 1000) / 1000),
      upper: Math.round((predictedValue + ci80Margin) * 1000) / 1000,
    },
    confidenceInterval95: {
      lower: Math.max(0, Math.round((predictedValue - ci95Margin) * 1000) / 1000),
      upper: Math.round((predictedValue + ci95Margin) * 1000) / 1000,
    },
  };
}

/**
 * Estimates future period labels and date ranges given the last known period and frequency.
 */
export function estimateFuturePeriod(
  lastObservation: HistoricalObservation,
  stepAhead: number,
  frequency: ReportingFrequency,
): { label: string; startDate: string; endDate: string } {
  const lastEnd = new Date(lastObservation.endDate);

  if (frequency === "MONTHLY") {
    const futureDate = new Date(lastEnd);
    futureDate.setMonth(futureDate.getMonth() + stepAhead);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = `${monthNames[futureDate.getMonth()]} ${futureDate.getFullYear()} (Est)`;
    const start = new Date(futureDate.getFullYear(), futureDate.getMonth(), 1).toISOString().split("T")[0];
    const end = new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0).toISOString().split("T")[0];
    return { label, startDate: start, endDate: end };
  }

  if (frequency === "QUARTERLY") {
    const startQ = new Date(lastEnd);
    startQ.setMonth(startQ.getMonth() + (stepAhead - 1) * 3 + 1);
    const qNum = Math.floor(startQ.getMonth() / 3) + 1;
    const label = `Q${qNum} ${startQ.getFullYear()} (Est)`;
    const start = new Date(startQ.getFullYear(), (qNum - 1) * 3, 1).toISOString().split("T")[0];
    const end = new Date(startQ.getFullYear(), qNum * 3, 0).toISOString().split("T")[0];
    return { label, startDate: start, endDate: end };
  }

  if (frequency === "ANNUAL") {
    const futureYear = lastEnd.getFullYear() + stepAhead;
    const nextYearShort = String((futureYear + 1) % 100).padStart(2, "0");
    const label = `FY ${futureYear}-${nextYearShort} (Est)`;
    const start = `${futureYear}-04-01`;
    const end = `${futureYear + 1}-03-31`;
    return { label, startDate: start, endDate: end };
  }

  // Fallback for irregular cadence: 30 days ahead
  const startFallback = new Date(lastEnd.getTime() + stepAhead * 30 * 86400000).toISOString().split("T")[0];
  const endFallback = new Date(lastEnd.getTime() + (stepAhead * 30 + 30) * 86400000).toISOString().split("T")[0];
  return {
    label: `Period +${stepAhead} (Est)`,
    startDate: startFallback,
    endDate: endFallback,
  };
}

/**
 * End-to-end forecasting pipeline:
 * 1. Assesses data coverage and reporting frequency
 * 2. If insufficient data (< 3 periods), gracefully returns an Insufficient Data state
 * 3. Evaluates naive baseline & candidate statistical models with chronological backtesting
 * 4. Generates predictions with 80% and 95% uncertainty bounds
 * 5. Tags all outputs explicitly as statistical estimates
 */
export function generateForecast({
  historical,
  scopeTarget,
  scopeName,
  categoryName,
  horizonPeriods = 2,
  totalConfiguredPeriods,
}: {
  historical: HistoricalObservation[];
  scopeTarget: ForecastScopeTarget;
  scopeName: string;
  categoryName?: string;
  horizonPeriods?: number;
  totalConfiguredPeriods?: number;
}): ForecastResult {
  // Sort strictly chronologically
  const sorted = [...historical].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );

  const assessment = assessDataCoverage(sorted, totalConfiguredPeriods);
  const values = sorted.map((o) => o.valueTco2e);
  const recommendations: string[] = [];

  // 1. Guard against insufficient data: NEVER fabricate predictions without enough observations!
  if (sorted.length < 3 || assessment.dataQualityState === "insufficient") {
    recommendations.push(
      "Collect and approve emissions records for at least 3 consecutive periods to enable statistical forecasting.",
    );
    recommendations.push(
      "Ensure all activity data has valid emission conversion factors assigned.",
    );

    return {
      scopeTarget,
      scopeName,
      categoryName,
      unit: "tCO2e",
      canForecast: false,
      insufficientDataReason:
        `Insufficient historical observations (${sorted.length} period(s) found). Time-series backtesting requires a minimum of 3-4 consecutive periods with approved calculations.`,
      assessment,
      selectedModel: "none",
      modelName: "None (Insufficient Data)",
      trainingWindow: null,
      backtestWindow: null,
      validationMetrics: null,
      historical: sorted,
      predictions: [],
      recommendations,
    };
  }

  // 2. Perform Chronological Backtesting to evaluate candidate models
  const backtest = runChronologicalBacktest(values);

  // 3. Fit selected model on entire dataset for future horizon
  const horizon = Math.max(1, Math.min(4, horizonPeriods));
  let pointPredictions: number[] = [];
  let residualStdError = backtest.residualStdError;

  if (backtest.selectedModel === "linear_trend") {
    const fullFit = fitLinearTrend(values, horizon);
    pointPredictions = fullFit.predictions;
    residualStdError = fullFit.residualStdError;
  } else if (backtest.selectedModel === "exponential_smoothing") {
    const fullFit = fitExponentialSmoothing(values, horizon);
    pointPredictions = fullFit.predictions;
    residualStdError = fullFit.residualStdError;
  } else {
    // Naive persistence: project last known observation forward
    const lastVal = values[values.length - 1];
    pointPredictions = Array(horizon).fill(lastVal);
  }

  // 4. Construct future prediction points with uncertainty intervals
  const lastObs = sorted[sorted.length - 1];
  const predictions: ForecastPoint[] = [];

  for (let h = 1; h <= horizon; h++) {
    const predVal = pointPredictions[h - 1] ?? lastObs.valueTco2e;
    const periodMeta = estimateFuturePeriod(lastObs, h, assessment.detectedFrequency);
    const intervals = calculatePredictionInterval(predVal, h, residualStdError);

    predictions.push({
      periodIndex: sorted.length + h - 1,
      periodLabel: periodMeta.label,
      estimatedStartDate: periodMeta.startDate,
      estimatedEndDate: periodMeta.endDate,
      predictedTco2e: predVal,
      confidenceInterval80: intervals.confidenceInterval80,
      confidenceInterval95: intervals.confidenceInterval95,
      isEstimate: true,
    });
  }

  // 5. Formulation of actionable recommendations
  if (backtest.metrics && backtest.metrics.mape > 35) {
    recommendations.push(
      "High historical volatility observed: validation error (MAPE) exceeds 35%. Use forecast estimates cautiously for long-term targets.",
    );
  } else {
    recommendations.push(
      `Model validation passed: ${backtest.modelName} achieved ${backtest.metrics?.mape ?? 0}% MAPE on holdout backtesting.`,
    );
  }

  if (assessment.hasMissingPeriods) {
    recommendations.push(
      "Historical timeline contains missing period windows. Backfill past periods to enhance forecast stability.",
    );
  }

  recommendations.push(
    "Explore hypothetical reduction scenarios based on this forecasted baseline in the Carbon Reduction Simulator.",
  );

  return {
    scopeTarget,
    scopeName,
    categoryName,
    unit: "tCO2e",
    canForecast: true,
    assessment,
    selectedModel: backtest.selectedModel,
    modelName: backtest.modelName,
    trainingWindow: {
      startPeriod: sorted[0].periodLabel,
      endPeriod: sorted[backtest.trainingCount - 1].periodLabel,
      observationCount: backtest.trainingCount,
    },
    backtestWindow: {
      startPeriod: sorted[backtest.trainingCount].periodLabel,
      endPeriod: sorted[sorted.length - 1].periodLabel,
      testCount: backtest.testCount,
    },
    validationMetrics: backtest.metrics,
    historical: sorted,
    predictions,
    recommendations,
  };
}
