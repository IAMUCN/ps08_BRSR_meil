import { GradientBoostedRegressor, buildAutoregressiveDataset, forecastWithGbdt } from "./gbdt.ts";
import { detectPredictiveAnomalies } from "./anomaly.ts";
import { generatePredictiveInsights } from "./insights.ts";
import {
  type ConsumptionMetricType,
  type HistoricalDataPoint,
  type ModelEvaluationScorecard,
  type ModelTournamentEntry,
  type PredictiveForecastOutput,
  type PredictiveForecastPoint,
  type PredictiveModelType,
  STANDARD_PREDICTIVE_DISCLAIMER,
} from "./types.ts";

export type GenerateForecastParams = {
  orgUnitId: string;
  orgUnitName: string;
  reportingPeriodId: string;
  reportingPeriodLabel: string;
  metricType: ConsumptionMetricType;
  metricLabel: string;
  unit: string;
  historicalSeries: HistoricalDataPoint[];
  horizonSteps?: number;
  growthThresholdPct?: number;
};

// ---------------------------------------------------------------------------
// Candidate Model Implementations
// ---------------------------------------------------------------------------

function forecastExponentialSmoothing(
  series: number[],
  horizon: number,
): {
  predictions: number[];
  fitted: number[];
} {
  const n = series.length;
  if (n === 0) return { predictions: new Array(horizon).fill(0), fitted: [] };
  if (n === 1) return { predictions: new Array(horizon).fill(series[0]), fitted: [series[0]] };

  const alpha = 0.35;
  const beta = 0.15;
  const phi = 0.92; // Damping factor

  let level = series[0];
  let trend = series[1] - series[0];
  const fitted: number[] = [series[0]];

  for (let t = 1; t < n; t++) {
    const prevLevel = level;
    const prevTrend = trend;
    level = alpha * series[t] + (1 - alpha) * (prevLevel + phi * prevTrend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * prevTrend;
    fitted.push(Math.max(0, prevLevel + phi * prevTrend));
  }

  const predictions: number[] = [];
  const currentLevel = level;
  const currentTrend = trend;
  let cumulativePhi = 0;

  for (let h = 1; h <= horizon; h++) {
    cumulativePhi += Math.pow(phi, h);
    const pred = Math.max(0, currentLevel + cumulativePhi * currentTrend);
    predictions.push(Number(pred.toFixed(2)));
  }

  return { predictions, fitted };
}

function forecastLinearTrend(
  series: number[],
  horizon: number,
): {
  predictions: number[];
  fitted: number[];
} {
  const n = series.length;
  if (n === 0) return { predictions: new Array(horizon).fill(0), fitted: [] };
  if (n === 1) return { predictions: new Array(horizon).fill(series[0]), fitted: [series[0]] };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += series[i];
    sumXY += i * series[i];
    sumX2 += i * i;
  }

  const meanX = sumX / n;
  const meanY = sumY / n;
  const denominator = sumX2 - n * meanX * meanX;
  const slope = denominator === 0 ? 0 : (sumXY - n * meanX * meanY) / denominator;
  const intercept = meanY - slope * meanX;

  const fitted: number[] = [];
  for (let i = 0; i < n; i++) {
    fitted.push(Math.max(0, Number((slope * i + intercept).toFixed(2))));
  }

  const predictions: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const val = Math.max(0, Number((slope * (n - 1 + h) + intercept).toFixed(2)));
    predictions.push(val);
  }

  return { predictions, fitted };
}

function forecastNaiveDrift(
  series: number[],
  horizon: number,
): {
  predictions: number[];
  fitted: number[];
} {
  const n = series.length;
  if (n === 0) return { predictions: new Array(horizon).fill(0), fitted: [] };
  if (n === 1) return { predictions: new Array(horizon).fill(series[0]), fitted: [series[0]] };

  const drift = (series[n - 1] - series[0]) / (n - 1);
  const fitted: number[] = [series[0]];
  for (let i = 1; i < n; i++) {
    fitted.push(Math.max(0, series[0] + i * drift));
  }

  const predictions: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const val = Math.max(0, Number((series[n - 1] + h * drift).toFixed(2)));
    predictions.push(val);
  }

  return { predictions, fitted };
}

// ---------------------------------------------------------------------------
// Scorecard Calculation
// ---------------------------------------------------------------------------

export function calculateScorecard(
  actual: number[],
  predicted: number[],
): ModelEvaluationScorecard {
  const n = actual.length;
  if (n === 0 || predicted.length !== n) {
    return { r2: 0, rmse: 0, mae: 0, mape: 0, directionalAccuracy: 0, sampleCount: 0 };
  }

  const meanActual = actual.reduce((s, v) => s + v, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  let absErrSum = 0;
  let apeSum = 0;
  let validApeCount = 0;
  let correctDirectionCount = 0;
  let directionPairs = 0;

  for (let i = 0; i < n; i++) {
    const diff = actual[i] - predicted[i];
    ssRes += diff * diff;
    ssTot += (actual[i] - meanActual) * (actual[i] - meanActual);
    absErrSum += Math.abs(diff);

    if (actual[i] !== 0) {
      apeSum += Math.abs(diff / actual[i]);
      validApeCount++;
    }

    if (i > 0) {
      const actDir = Math.sign(actual[i] - actual[i - 1]);
      const predDir = Math.sign(predicted[i] - actual[i - 1]);
      if (actDir === predDir) correctDirectionCount++;
      directionPairs++;
    }
  }

  const rmse = Math.sqrt(ssRes / n);
  const mae = absErrSum / n;
  const mape = validApeCount > 0 ? (apeSum / validApeCount) * 100 : 0;
  const r2 = ssTot > 0 ? Math.max(-1, Math.min(1, 1 - ssRes / ssTot)) : 1.0;
  const directionalAccuracy =
    directionPairs > 0 ? (correctDirectionCount / directionPairs) * 100 : 100;

  return {
    r2: Number(r2.toFixed(3)),
    rmse: Number(rmse.toFixed(2)),
    mae: Number(mae.toFixed(2)),
    mape: Number(mape.toFixed(2)),
    directionalAccuracy: Number(directionalAccuracy.toFixed(1)),
    sampleCount: n,
  };
}

// ---------------------------------------------------------------------------
// Chronological Future Period Label Derivation
// ---------------------------------------------------------------------------

export function deriveNextPeriodLabels(lastLabel: string, horizon: number): string[] {
  const labels: string[] = [];

  // Match 2-digit FY: FY24-25 Q1
  const fy2Match = lastLabel.match(/^FY(\d{2})-(\d{2})\s*Q([1-4])$/i);
  if (fy2Match) {
    let y1 = parseInt(fy2Match[1], 10);
    let y2 = parseInt(fy2Match[2], 10);
    let q = parseInt(fy2Match[3], 10);
    for (let step = 1; step <= horizon; step++) {
      q++;
      if (q > 4) {
        q = 1;
        y1++;
        y2 = (y2 + 1) % 100;
      }
      labels.push(`FY${y1.toString().padStart(2, "0")}-${y2.toString().padStart(2, "0")} Q${q}`);
    }
    return labels;
  }

  // Match 4-digit FY: FY2023-24 Q4
  const fy4Match = lastLabel.match(/^FY(\d{4})-(\d{2})\s*Q([1-4])$/i);
  if (fy4Match) {
    let y1 = parseInt(fy4Match[1], 10);
    let y2 = parseInt(fy4Match[2], 10);
    let q = parseInt(fy4Match[3], 10);
    for (let step = 1; step <= horizon; step++) {
      q++;
      if (q > 4) {
        q = 1;
        y1++;
        y2 = (y1 + 1) % 100;
      }
      labels.push(`FY${y1}-${y2.toString().padStart(2, "0")} Q${q}`);
    }
    return labels;
  }

  // Match general quarterly pattern: ... Q[1-4]
  const qMatch = lastLabel.match(/(.*Q)([1-4])/i);
  if (qMatch) {
    let qNum = parseInt(qMatch[2], 10);
    const yearMatch = lastLabel.match(/(20\d\d)/);
    let startYear = yearMatch ? parseInt(yearMatch[1], 10) : 2025;

    for (let step = 1; step <= horizon; step++) {
      qNum++;
      if (qNum > 4) {
        qNum = 1;
        startYear++;
      }
      labels.push(`${startYear} Q${qNum}`);
    }
    return labels;
  }

  // Match Month pattern: "Jan 2026" or "January 2026"
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const mMatch = lastLabel.match(/([A-Za-z]{3,9})\s+(\d{4})/);
  if (mMatch) {
    const monthStr = mMatch[1].slice(0, 3);
    const mIdx = months.findIndex((m) => m.toLowerCase() === monthStr.toLowerCase());
    let y = parseInt(mMatch[2], 10);
    let curM = mIdx >= 0 ? mIdx : 0;

    for (let step = 1; step <= horizon; step++) {
      curM++;
      if (curM >= 12) {
        curM = 0;
        y++;
      }
      labels.push(`${months[curM]} ${y}`);
    }
    return labels;
  }

  // Fallback: Step-based increment
  for (let step = 1; step <= horizon; step++) {
    labels.push(`${lastLabel} (+${step})`);
  }
  return labels;
}

// ---------------------------------------------------------------------------
// Main Predictive Engine
// ---------------------------------------------------------------------------

export function generatePredictiveForecast(
  params: GenerateForecastParams,
): PredictiveForecastOutput {
  const {
    orgUnitId,
    orgUnitName,
    reportingPeriodId,
    reportingPeriodLabel,
    metricType,
    metricLabel,
    unit,
    historicalSeries,
    horizonSteps = 3,
    growthThresholdPct = 0.15,
  } = params;

  const now = new Date().toISOString();
  const values = historicalSeries.map((h) => h.value);
  const n = values.length;

  // Enforce small-sample-size guard (< 3 periods)
  if (n < 3) {
    const zeroScorecard: ModelEvaluationScorecard = {
      r2: 0,
      rmse: 0,
      mae: 0,
      mape: 0,
      directionalAccuracy: 0,
      sampleCount: n,
    };

    return {
      orgUnitId,
      orgUnitName,
      reportingPeriodId,
      reportingPeriodLabel,
      metricType,
      metricLabel,
      unit,
      historicalSeries,
      forecastPoints: [],
      championModel: "naive_drift",
      championModelName: "Naive Drift (Insufficient Data)",
      evaluationMetrics: zeroScorecard,
      tournament: [],
      anomaliesDetected: [],
      insights: [
        {
          id: `INSIGHT-INSUFFICIENT-DATA-${metricType}`,
          severity: "info",
          category: "DATA_DRIFT",
          title: `Insufficient Historical Series for ${metricLabel}`,
          detail: `Only ${n} historical period(s) found for ${orgUnitName}. Time-series forecasting and XGBoost/LightGBM model training require a minimum of 3 consecutive periods.`,
          actionRecommendation:
            "Record and verify operational data for previous reporting cycles to activate automated ML forecasting.",
        },
      ],
      dataQuality: {
        totalHistoricalPeriods: n,
        sufficientData: false,
        coverageRatio: Number((n / 3).toFixed(2)),
      },
      disclaimer: STANDARD_PREDICTIVE_DISCLAIMER,
      generatedAt: now,
    };
  }

  // 1. Fit Candidate Models & Run Chronological Tournament
  // Model A: XGBoost/GBDT
  const gbdtDataset = buildAutoregressiveDataset(values);
  const gbdtModel = new GradientBoostedRegressor({
    numTrees: 15,
    maxDepth: 3,
    learningRate: 0.15,
    l2Regularization: 1.0,
  });
  gbdtModel.fit(gbdtDataset);

  let gbdtFitted: number[] = [];
  if (gbdtDataset.length > 0) {
    gbdtFitted = [
      values[0],
      values[1],
      ...gbdtDataset.map((row) => gbdtModel.predict(row.features)),
    ];
  } else {
    gbdtFitted = new Array(n).fill(values[0]);
  }
  const gbdtPredictions = forecastWithGbdt(gbdtModel, values, horizonSteps);
  const gbdtScorecard = calculateScorecard(values, gbdtFitted);

  // Model B: Exponential Smoothing
  const expSmooth = forecastExponentialSmoothing(values, horizonSteps);
  const expScorecard = calculateScorecard(values, expSmooth.fitted);

  // Model C: Linear Trend
  const linear = forecastLinearTrend(values, horizonSteps);
  const linearScorecard = calculateScorecard(values, linear.fitted);

  // Model D: Naive Drift
  const drift = forecastNaiveDrift(values, horizonSteps);
  const driftScorecard = calculateScorecard(values, drift.fitted);

  // 2. Tournament Selection
  type Candidate = {
    type: PredictiveModelType;
    name: string;
    scorecard: ModelEvaluationScorecard;
    predictions: number[];
    residualVariance: number;
  };

  const candidates: Candidate[] = [
    {
      type: "xgboost_gbdt",
      name: "XGBoost GBDT (Autoregressive Ensemble)",
      scorecard: gbdtScorecard,
      predictions: gbdtPredictions,
      residualVariance: gbdtModel.residualVariance || gbdtScorecard.rmse * gbdtScorecard.rmse,
    },
    {
      type: "exponential_smoothing",
      name: "Holt-Winters Damped Exponential Smoothing",
      scorecard: expScorecard,
      predictions: expSmooth.predictions,
      residualVariance: expScorecard.rmse * expScorecard.rmse,
    },
    {
      type: "linear_trend",
      name: "Ordinary Least Squares Linear Trend",
      scorecard: linearScorecard,
      predictions: linear.predictions,
      residualVariance: linearScorecard.rmse * linearScorecard.rmse,
    },
    {
      type: "naive_drift",
      name: "Random Walk with Drift",
      scorecard: driftScorecard,
      predictions: drift.predictions,
      residualVariance: driftScorecard.rmse * driftScorecard.rmse,
    },
  ];

  // Tournament Ranking: sort by lowest RMSE, tie-break by MAE
  candidates.sort((a, b) => {
    if (a.scorecard.rmse !== b.scorecard.rmse) return a.scorecard.rmse - b.scorecard.rmse;
    return a.scorecard.mae - b.scorecard.mae;
  });

  const tournament: ModelTournamentEntry[] = candidates.map((cand, index) => ({
    modelType: cand.type,
    modelName: cand.name,
    scorecard: cand.scorecard,
    tournamentRank: index + 1,
    isChampion: index === 0,
  }));

  const champion = candidates[0];

  // 3. Generate Forecast Points with 80% & 95% Confidence Intervals
  const lastObs = values[values.length - 1];
  const lastLabel = historicalSeries[historicalSeries.length - 1].periodLabel;
  const futureLabels = deriveNextPeriodLabels(lastLabel, horizonSteps);

  const stdErr = Math.max(
    champion.scorecard.rmse,
    Math.sqrt(champion.residualVariance) || 0.05 * (lastObs || 1),
  );

  const forecastPoints: PredictiveForecastPoint[] = [];
  for (let step = 0; step < horizonSteps; step++) {
    const h = step + 1;
    const predVal = champion.predictions[step];
    const expansion = Math.sqrt(h);
    const spread80 = 1.282 * stdErr * expansion;
    const spread95 = 1.96 * stdErr * expansion;

    let trendDirection: "increasing" | "decreasing" | "stable" = "stable";
    const deltaRatio = lastObs > 0 ? (predVal - lastObs) / lastObs : 0;
    if (deltaRatio > 0.02) trendDirection = "increasing";
    else if (deltaRatio < -0.02) trendDirection = "decreasing";

    forecastPoints.push({
      step: h,
      periodLabel: futureLabels[step] ?? `Step +${h}`,
      estimatedDate: now.slice(0, 10),
      predictedValue: predVal,
      ci80: {
        lower: Math.max(0, Number((predVal - spread80).toFixed(2))),
        upper: Number((predVal + spread80).toFixed(2)),
      },
      ci95: {
        lower: Math.max(0, Number((predVal - spread95).toFixed(2))),
        upper: Number((predVal + spread95).toFixed(2)),
      },
      trendDirection,
    });
  }

  // 4. Anomaly Detection on Historical Series
  const anomaliesDetected = detectPredictiveAnomalies(
    historicalSeries.map((h) => ({ periodLabel: h.periodLabel, value: h.value })),
  );

  // 5. Predictive Forward Insights & Threshold Breach Alerting
  const insights = generatePredictiveInsights({
    metricType,
    metricLabel,
    unit,
    historicalValues: values,
    forecastPoints,
    thresholdOverrides: {
      growthThresholdPct,
    },
  });

  return {
    orgUnitId,
    orgUnitName,
    reportingPeriodId,
    reportingPeriodLabel,
    metricType,
    metricLabel,
    unit,
    historicalSeries,
    forecastPoints,
    championModel: champion.type,
    championModelName: champion.name,
    evaluationMetrics: champion.scorecard,
    tournament,
    anomaliesDetected,
    insights,
    dataQuality: {
      totalHistoricalPeriods: n,
      sufficientData: true,
      coverageRatio: 1.0,
    },
    disclaimer: STANDARD_PREDICTIVE_DISCLAIMER,
    generatedAt: now,
  };
}
