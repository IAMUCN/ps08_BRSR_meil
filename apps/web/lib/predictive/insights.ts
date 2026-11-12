import type { ConsumptionMetricType, PredictiveForecastPoint, PredictiveInsight } from "./types.ts";

export type InsightGeneratorParams = {
  metricType: ConsumptionMetricType;
  metricLabel: string;
  unit: string;
  historicalValues: number[];
  forecastPoints: PredictiveForecastPoint[];
  thresholdOverrides?: {
    growthThresholdPct?: number; // e.g. 0.15 (15%)
    targetCap?: number | null;
  };
};

/**
 * Generates forward-looking predictive ESG insights and threshold breach warnings.
 */
export function generatePredictiveInsights(params: InsightGeneratorParams): PredictiveInsight[] {
  const { metricType, metricLabel, unit, historicalValues, forecastPoints, thresholdOverrides } =
    params;

  const insights: PredictiveInsight[] = [];
  if (historicalValues.length === 0 || forecastPoints.length === 0) return insights;

  const lastObs = historicalValues[historicalValues.length - 1];
  const histAvg = historicalValues.reduce((s, v) => s + v, 0) / historicalValues.length;

  const growthThresholdPct = thresholdOverrides?.growthThresholdPct ?? 0.15;
  const growthLimitValue = histAvg * (1 + growthThresholdPct);

  // 1. Projected Threshold Breach Check
  const breachPoint = forecastPoints.find((p) => p.predictedValue > growthLimitValue);
  if (breachPoint) {
    const breachPct = ((breachPoint.predictedValue - histAvg) / histAvg) * 100;
    insights.push({
      id: `INSIGHT-BREACH-${metricType}`,
      severity: "critical",
      category: "THRESHOLD_BREACH",
      title: `Projected ${metricLabel} Threshold Breach in ${breachPoint.periodLabel}`,
      detail: `Model projects ${metricLabel} will reach ${breachPoint.predictedValue.toLocaleString()} ${unit} (+${breachPct.toFixed(1)}% above historical average), breaching the ${growthThresholdPct * 100}% growth threshold (${growthLimitValue.toFixed(0)} ${unit}).`,
      projectedBreachPeriod: breachPoint.periodLabel,
      projectedBreachValue: breachPoint.predictedValue,
      thresholdValue: Number(growthLimitValue.toFixed(2)),
      actionRecommendation:
        "Commission sub-meter audit and review operational decision rules in the Decision Center before the reporting window closes.",
    });
  }

  // 2. Trajectory Direction & Decarbonization Pace Check
  const firstPred = forecastPoints[0];
  const finalPred = forecastPoints[forecastPoints.length - 1];
  const totalTrajectoryDeltaPct = ((finalPred.predictedValue - lastObs) / (lastObs || 1)) * 100;

  if (totalTrajectoryDeltaPct < -5) {
    insights.push({
      id: `INSIGHT-PACE-DECLINE-${metricType}`,
      severity: "info",
      category: "DECARBONIZATION_PACE",
      title: `Favorable ${metricLabel} Reduction Trajectory`,
      detail: `Analytical forecast projects a ${Math.abs(totalTrajectoryDeltaPct).toFixed(1)}% decrease across the next ${forecastPoints.length} periods, aligning with organizational decarbonization targets.`,
      actionRecommendation:
        "Lock in current operational efficiencies and consider registering verified reductions for carbon credit minting.",
    });
  } else if (totalTrajectoryDeltaPct > 10 && !breachPoint) {
    insights.push({
      id: `INSIGHT-PACE-ACCELERATE-${metricType}`,
      severity: "warning",
      category: "VOLATILITY_ALERT",
      title: `Accelerating ${metricLabel} Trajectory (+${totalTrajectoryDeltaPct.toFixed(1)}%)`,
      detail: `Forecast projects steady expansion reaching ${finalPred.predictedValue.toLocaleString()} ${unit} by ${finalPred.periodLabel}.`,
      actionRecommendation:
        "Examine equipment utilization schedules and explore energy-efficiency retrofits in the Decarbonization Roadmap.",
    });
  }

  // 3. Uncertainty Horizon Expansion Warning
  const lastPoint = forecastPoints[forecastPoints.length - 1];
  const ciWidthPct =
    ((lastPoint.ci95.upper - lastPoint.ci95.lower) / (lastPoint.predictedValue || 1)) * 100;

  if (ciWidthPct > 60) {
    insights.push({
      id: `INSIGHT-UNCERTAINTY-${metricType}`,
      severity: "info",
      category: "VOLATILITY_ALERT",
      title: `High Forecast Volatility at Extended Horizon (${lastPoint.periodLabel})`,
      detail: `Uncertainty band spans ±${(ciWidthPct / 2).toFixed(0)}% at Step ${lastPoint.step}. Higher historical variance widens long-range 95% confidence intervals.`,
      actionRecommendation:
        "Rely on Step 1 and Step 2 projections for near-term procurement and backfill granular monthly meter logs to tighten variance.",
    });
  }

  return insights;
}
