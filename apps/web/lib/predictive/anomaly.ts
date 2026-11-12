import type { PredictiveAnomalyFinding, PredictiveAnomalyStatus } from "./types.ts";

/**
 * Detects operational outliers, sudden spikes, unexpected drops, and data drift
 * across time-series observations.
 */
export function detectPredictiveAnomalies(
  series: Array<{ periodLabel: string; value: number }>,
): PredictiveAnomalyFinding[] {
  if (series.length < 3) return [];

  const values = series.map((s) => s.value);
  const n = values.length;

  // 1. Compute Mean and Standard Deviation
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / (n - 1 || 1);
  const stdDev = Math.sqrt(variance);

  // 2. Compute Quartiles and IQR
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(n * 0.25)];
  const median = sorted[Math.floor(n * 0.5)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = Math.max(1, q3 - q1);
  const iqrUpperFence = q3 + 1.5 * iqr;
  const iqrLowerFence = Math.max(0, q1 - 1.5 * iqr);

  const findings: PredictiveAnomalyFinding[] = [];

  for (let i = 0; i < n; i++) {
    const item = series[i];
    const val = item.value;

    const zScore = stdDev > 0 ? Number(((val - mean) / stdDev).toFixed(2)) : 0;
    const iqrDistance = val > q3 ? (val - q3) / iqr : val < q1 ? (q1 - val) / iqr : 0;

    let status: PredictiveAnomalyStatus = "NORMAL";
    let message = "Observation is within standard statistical bounds.";
    let requiresReview = false;

    if (zScore > 3.0 || val > q3 + 2.5 * iqr) {
      status = "CRITICAL_SPIKE";
      message = `Severe spike detected: value ${val.toLocaleString()} exceeds historical mean by ${zScore} standard deviations.`;
      requiresReview = true;
    } else if (zScore < -2.5 || (iqrLowerFence > 0 && val < iqrLowerFence)) {
      status = "UNEXPECTED_DROP";
      message = `Unusual drop detected: value ${val.toLocaleString()} is ${Math.abs(zScore)} standard deviations below mean. Verify for sub-meter outage or missing billing.`;
      requiresReview = true;
    } else if (zScore > 2.0 || val > iqrUpperFence) {
      status = "MODERATE_OUTLIER";
      message = `Moderate consumption outlier (+${zScore}σ). Monitor for potential operational leakage or capacity surge.`;
      requiresReview = true;
    } else if (i >= 2) {
      // Check for persistent consecutive drift (3 periods increasing or decreasing beyond 1.2 sigma)
      const prev1 = series[i - 1].value;
      const prev2 = series[i - 2].value;
      if (val > prev1 && prev1 > prev2 && Math.abs(zScore) >= 1.2) {
        status = "DATA_DRIFT";
        message =
          "Continuous 3-period upward drift detected (+1.2σ trajectory). Structural consumption shift underway.";
        requiresReview = true;
      }
    }

    findings.push({
      periodLabel: item.periodLabel,
      observedValue: val,
      expectedValue: Number(median.toFixed(2)),
      zScore,
      iqrDistance: Number(iqrDistance.toFixed(2)),
      status,
      diagnosticMessage: message,
      requiresReview,
    });
  }

  return findings;
}
