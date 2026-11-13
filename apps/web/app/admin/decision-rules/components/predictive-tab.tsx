"use client";

import { useEffect, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Droplet,
  Flame,
  Minus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PeriodOptions } from "@/components/ui/period-select";
import type { ConsumptionMetricType, PredictiveForecastOutput } from "@/lib/predictive/types";
import { getPredictiveForecastAction, runPredictiveForecastAction } from "../actions";

type Props = {
  orgUnits: Array<{ id: string; name: string; code: string }>;
  periods: Array<{ id: string; label: string; start_date: string }>;
  selectedUnit: string;
  selectedPeriod: string;
  onSelectUnit: (id: string) => void;
  onSelectPeriod: (id: string) => void;
};

const METRIC_OPTIONS: Array<{
  value: ConsumptionMetricType;
  label: string;
  icon: typeof Zap;
  color: string;
}> = [
  {
    value: "ELECTRICITY_KWH",
    label: "Total Electricity (kWh)",
    icon: Zap,
    color: "text-amber-500",
  },
  {
    value: "FUEL_DIESEL_L",
    label: "Diesel Consumption (L)",
    icon: Flame,
    color: "text-orange-500",
  },
  {
    value: "WATER_KL",
    label: "Water Consumption (kL)",
    icon: Droplet,
    color: "text-sky-500",
  },
  {
    value: "WASTE_TONNES",
    label: "Solid Waste (Tonnes)",
    icon: Trash2,
    color: "text-emerald-500",
  },
  {
    value: "EMISSIONS_SCOPE_1",
    label: "Scope 1 Direct (tCO2e)",
    icon: Flame,
    color: "text-rose-500",
  },
  {
    value: "EMISSIONS_SCOPE_2",
    label: "Scope 2 Location-Based (tCO2e)",
    icon: Zap,
    color: "text-indigo-500",
  },
  {
    value: "EMISSIONS_TOTAL",
    label: "Total Gross GHG (tCO2e)",
    icon: Activity,
    color: "text-red-500",
  },
];

export function PredictiveTab({
  orgUnits,
  periods,
  selectedUnit,
  selectedPeriod,
  onSelectUnit,
  onSelectPeriod,
}: Props) {
  const [selectedMetric, setSelectedMetric] = useState<ConsumptionMetricType>("ELECTRICITY_KWH");
  const [forecast, setForecast] = useState<PredictiveForecastOutput | null>(null);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadForecast = () => {
    if (!selectedUnit || !selectedPeriod) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await getPredictiveForecastAction({
          orgUnitId: selectedUnit,
          reportingPeriodId: selectedPeriod,
          metricType: selectedMetric,
        });
        if (res.ok) {
          setForecast(res.data);
        } else {
          setErrorMessage(res.error || "Unable to compute forecast for this selection.");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Failed to load predictive forecast.");
      }
    });
  };

  const recomputeTournament = () => {
    if (!selectedUnit || !selectedPeriod) return;
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const res = await runPredictiveForecastAction({
          orgUnitId: selectedUnit,
          reportingPeriodId: selectedPeriod,
          metricType: selectedMetric,
          horizonSteps: 3,
          growthThresholdPct: 0.15,
        });
        if (res.ok) {
          setForecast(res.data);
        } else {
          setErrorMessage(res.error || "Failed to retrain tournament models.");
        }
      } catch (err: any) {
        setErrorMessage(err?.message || "Tournament execution failed.");
      }
    });
  };

  useEffect(() => {
    loadForecast();
  }, [selectedUnit, selectedPeriod, selectedMetric]);

  const activeMetricMeta =
    METRIC_OPTIONS.find((m) => m.value === selectedMetric) ?? METRIC_OPTIONS[0];
  const MetricIcon = activeMetricMeta.icon;

  return (
    <div className="space-y-6">
      {/* 1. SELECTION & CONTROL HEADER */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-primary" />
                Predictive Consumption Intelligence & Model Tournament
              </CardTitle>
              <CardDescription className="text-xs">
                Autoregressive GBDT, Holt-Winters exponential smoothing, and statistical
                pre-submission anomaly detection.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={recomputeTournament}
                disabled={isPending}
                className="text-xs h-8"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                {isPending ? "Training..." : "Retrain Tournament"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Target Metric</Label>
              <NativeSelect
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as ConsumptionMetricType)}
                className="mt-1 text-xs"
              >
                {METRIC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Organizational Unit</Label>
              <NativeSelect
                value={selectedUnit}
                onChange={(e) => onSelectUnit(e.target.value)}
                className="mt-1 text-xs"
              >
                {orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.code})
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Reporting Period</Label>
              <NativeSelect
                value={selectedPeriod}
                onChange={(e) => onSelectPeriod(e.target.value)}
                className="mt-1 text-xs"
              >
                <PeriodOptions periods={periods} />
              </NativeSelect>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. SUMMARY METRICS & CHAMPION MODEL */}
      {forecast && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Champion Model
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-xs font-bold truncate">{forecast.championModelName}</span>
              </div>
              <Badge variant="secondary" className="mt-2 text-[10px] font-mono">
                Rank 1 • R²: {forecast.evaluationMetrics.r2}
              </Badge>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Historical Series Depth
              </span>
              <div className="mt-1 text-base font-bold text-foreground">
                {forecast.historicalSeries.length} Consecutive Periods
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px]">
                {forecast.dataQuality.sufficientData ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Sufficient for ML (≥ 3)
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Small Sample (&lt; 3)
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Model Error (RMSE / MAPE)
              </span>
              <div className="mt-1 text-base font-bold text-foreground">
                {forecast.evaluationMetrics.rmse.toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">{forecast.unit}</span>
              </div>
              <span className="mt-2 text-[11px] text-muted-foreground block">
                MAPE: {forecast.evaluationMetrics.mape}% • Acc:{" "}
                {forecast.evaluationMetrics.directionalAccuracy}%
              </span>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-4">
              <span className="text-[11px] font-medium text-muted-foreground block">
                Anomaly Status
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                {forecast.anomaliesDetected.some((a) => a.requiresReview) ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-rose-500" />
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      {forecast.anomaliesDetected.filter((a) => a.requiresReview).length} Anomalies
                      Flagged
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Normal Trajectory
                    </span>
                  </>
                )}
              </div>
              <span className="mt-2 text-[11px] text-muted-foreground block">
                Pre-submission audit guard active
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3. FORWARD FORECAST PROJECTIONS CARDS */}
      {forecast && forecast.forecastPoints.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MetricIcon className={`h-4 w-4 ${activeMetricMeta.color}`} />
              Forward Projections with 80% &amp; 95% Confidence Intervals
            </CardTitle>
            <CardDescription className="text-xs">
              Autoregressive projections generated by {forecast.championModelName}. Confidence bands
              expand with time horizon ($\sqrt&#123;h&#125;$).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {forecast.forecastPoints.map((pt) => {
                const isIncreasing = pt.trendDirection === "increasing";
                const isDecreasing = pt.trendDirection === "decreasing";

                return (
                  <div
                    key={pt.step}
                    className="p-3.5 rounded-lg border border-border bg-card/60 space-y-2 relative overflow-hidden"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] font-mono">
                        Step +{pt.step} • {pt.periodLabel}
                      </Badge>
                      <div className="flex items-center gap-1 text-[11px] font-medium">
                        {isIncreasing && (
                          <span className="text-amber-500 flex items-center">
                            <ArrowUpRight className="h-3 w-3 mr-0.5" /> Surge
                          </span>
                        )}
                        {isDecreasing && (
                          <span className="text-emerald-500 flex items-center">
                            <ArrowDownRight className="h-3 w-3 mr-0.5" /> Decline
                          </span>
                        )}
                        {!isIncreasing && !isDecreasing && (
                          <span className="text-muted-foreground flex items-center">
                            <Minus className="h-3 w-3 mr-0.5" /> Stable
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <span className="text-xs text-muted-foreground block">
                        Projected {forecast.metricLabel}
                      </span>
                      <div className="text-lg font-bold text-foreground">
                        {pt.predictedValue.toLocaleString()}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {forecast.unit}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1 pt-1 border-t border-border/50 text-[11px]">
                      <div className="flex justify-between text-muted-foreground">
                        <span>80% Confidence Band:</span>
                        <span className="font-mono font-medium text-foreground">
                          [{pt.ci80.lower.toLocaleString()} – {pt.ci80.upper.toLocaleString()}]
                        </span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>95% Confidence Band:</span>
                        <span className="font-mono font-medium text-foreground">
                          [{pt.ci95.lower.toLocaleString()} – {pt.ci95.upper.toLocaleString()}]
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 4. PREDICTIVE INSIGHTS & BREACH WARNINGS */}
      {forecast && forecast.insights.length > 0 && (
        <div className="space-y-2">
          {forecast.insights.map((ins) => (
            <div
              key={ins.id}
              className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                ins.severity === "critical"
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
                  : ins.severity === "warning"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                    : "bg-sky-500/10 border-sky-500/30 text-sky-900 dark:text-sky-200"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {ins.title}
                </span>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  {ins.category}
                </Badge>
              </div>
              <p className="leading-relaxed">{ins.detail}</p>
              <div className="pt-1 text-[11px] font-medium opacity-90 border-t border-current/10">
                Action Recommendation: {ins.actionRecommendation}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. MODEL TOURNAMENT LEADERBOARD */}
      {forecast && forecast.tournament.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Chronological Model Tournament Leaderboard
            </CardTitle>
            <CardDescription className="text-xs">
              Candidate algorithms evaluated via out-of-sample backtesting on verified historical
              records.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="py-2 px-3">Rank</th>
                    <th className="py-2 px-3">Model Architecture</th>
                    <th className="py-2 px-3 text-right">R² Fit</th>
                    <th className="py-2 px-3 text-right">RMSE ({forecast.unit})</th>
                    <th className="py-2 px-3 text-right">MAE</th>
                    <th className="py-2 px-3 text-right">MAPE (%)</th>
                    <th className="py-2 px-3 text-right">Direction Acc (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {forecast.tournament.map((entry) => (
                    <tr
                      key={entry.modelType}
                      className={
                        entry.isChampion
                          ? "bg-primary/5 font-medium text-foreground"
                          : "text-muted-foreground"
                      }
                    >
                      <td className="py-2 px-3">
                        {entry.isChampion ? (
                          <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px]">
                            🏆 Champion
                          </Badge>
                        ) : (
                          <span className="font-mono text-muted-foreground">
                            #{entry.tournamentRank}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-foreground">{entry.modelName}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{entry.scorecard.r2}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {entry.scorecard.rmse.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {entry.scorecard.mae.toLocaleString()}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">{entry.scorecard.mape}%</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {entry.scorecard.directionalAccuracy}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. STATISTICAL ANOMALY FINDINGS */}
      {forecast && forecast.anomaliesDetected.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Pre-Submission Statistical Anomaly Log
            </CardTitle>
            <CardDescription className="text-xs">
              Historical variance, Z-scores, and IQR fence evaluations across consecutive reporting
              cycles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="py-2 px-3">Reporting Period</th>
                    <th className="py-2 px-3 text-right">Observed</th>
                    <th className="py-2 px-3 text-right">Expected (Median)</th>
                    <th className="py-2 px-3 text-right">Z-Score</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Diagnostic Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {forecast.anomaliesDetected.slice(-8).map((finding, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="py-2 px-3 font-medium">{finding.periodLabel}</td>
                      <td className="py-2 px-3 text-right font-mono">
                        {finding.observedValue.toLocaleString()} {forecast.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                        {finding.expectedValue.toLocaleString()} {forecast.unit}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        <span
                          className={
                            Math.abs(finding.zScore) >= 2.0
                              ? "text-rose-500 font-bold"
                              : "text-muted-foreground"
                          }
                        >
                          {finding.zScore > 0 ? `+${finding.zScore}` : finding.zScore}σ
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={finding.status === "NORMAL" ? "secondary" : "destructive"}
                          className="text-[10px]"
                        >
                          {finding.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground text-[11px] max-w-xs truncate">
                        {finding.diagnosticMessage}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 7. AUDIT DISCLAIMER FOOTER */}
      {forecast && (
        <div className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
            {forecast.disclaimer}
          </span>
          <span className="font-mono text-[10px] shrink-0">
            Generated: {new Date(forecast.generatedAt).toLocaleTimeString()}
          </span>
        </div>
      )}
    </div>
  );
}
