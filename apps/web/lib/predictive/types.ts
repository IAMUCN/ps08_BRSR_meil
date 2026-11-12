import { z } from "zod";

export const consumptionMetricTypeEnum = z.enum([
  "ELECTRICITY_KWH",
  "FUEL_DIESEL_L",
  "WATER_KL",
  "WASTE_TONNES",
  "EMISSIONS_SCOPE_1",
  "EMISSIONS_SCOPE_2",
  "EMISSIONS_SCOPE_3",
  "EMISSIONS_TOTAL",
]);
export type ConsumptionMetricType = z.infer<typeof consumptionMetricTypeEnum>;

export const predictiveModelTypeEnum = z.enum([
  "xgboost_gbdt",
  "lightgbm_gbdt",
  "exponential_smoothing",
  "linear_trend",
  "naive_drift",
]);
export type PredictiveModelType = z.infer<typeof predictiveModelTypeEnum>;

export type HistoricalDataPoint = {
  periodId: string;
  periodLabel: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  value: number;
  isVerified: boolean;
};

export type ModelEvaluationScorecard = {
  r2: number; // Coefficient of determination (-1.0 to 1.0)
  rmse: number; // Root Mean Square Error
  mae: number; // Mean Absolute Error
  mape: number; // Mean Absolute Percentage Error (%)
  directionalAccuracy: number; // % of direction changes correctly predicted
  sampleCount: number;
};

export type ModelTournamentEntry = {
  modelType: PredictiveModelType;
  modelName: string;
  scorecard: ModelEvaluationScorecard;
  tournamentRank: number;
  isChampion: boolean;
};

export type ConfidenceBand = {
  lower: number; // Clamped to >= 0 for physical quantities
  upper: number;
};

export type PredictiveForecastPoint = {
  step: number;
  periodLabel: string;
  estimatedDate: string;
  predictedValue: number;
  ci80: ConfidenceBand;
  ci95: ConfidenceBand;
  trendDirection: "increasing" | "decreasing" | "stable";
};

export type PredictiveAnomalyStatus =
  "NORMAL" | "MODERATE_OUTLIER" | "CRITICAL_SPIKE" | "UNEXPECTED_DROP" | "DATA_DRIFT";

export type PredictiveAnomalyFinding = {
  periodLabel: string;
  observedValue: number;
  expectedValue: number;
  zScore: number;
  iqrDistance: number;
  status: PredictiveAnomalyStatus;
  diagnosticMessage: string;
  requiresReview: boolean;
};

export type PredictiveInsightSeverity = "info" | "warning" | "critical";

export type PredictiveInsight = {
  id: string;
  severity: PredictiveInsightSeverity;
  category: "THRESHOLD_BREACH" | "VOLATILITY_ALERT" | "DATA_DRIFT" | "DECARBONIZATION_PACE";
  title: string;
  detail: string;
  projectedBreachPeriod?: string | null;
  projectedBreachValue?: number | null;
  thresholdValue?: number | null;
  actionRecommendation: string;
};

export type PredictiveForecastOutput = {
  orgUnitId: string;
  orgUnitName: string;
  reportingPeriodId: string;
  reportingPeriodLabel: string;
  metricType: ConsumptionMetricType;
  metricLabel: string;
  unit: string;
  historicalSeries: HistoricalDataPoint[];
  forecastPoints: PredictiveForecastPoint[];
  championModel: PredictiveModelType;
  championModelName: string;
  evaluationMetrics: ModelEvaluationScorecard;
  tournament: ModelTournamentEntry[];
  anomaliesDetected: PredictiveAnomalyFinding[];
  insights: PredictiveInsight[];
  dataQuality: {
    totalHistoricalPeriods: number;
    sufficientData: boolean;
    coverageRatio: number;
  };
  disclaimer: string;
  generatedAt: string;
};

export const STANDARD_PREDICTIVE_DISCLAIMER =
  "Predictive insights and time-series forecasts are analytical projections based on verified historical operations. They do not constitute certified regulatory filings or guaranteed future outcomes.";
