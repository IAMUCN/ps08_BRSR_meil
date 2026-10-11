"use client";

import {
  AlertCircle,
  ArrowRight,
  Calendar,
  HelpCircle,
  Info,
  RefreshCw,
  Sliders,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  ForecastResult,
  ForecastScopeTarget,
  HistoricalObservation,
} from "@/lib/forecast/engine";
import { getForecastAction } from "./actions";

export type ForecastOptions = {
  orgUnits: Array<{ id: string; name: string; code: string; depth: number }>;
  defaultOrgUnitId: string | null;
};

export function ForecastClient({ options }: { options: ForecastOptions }) {
  const [orgUnitId, setOrgUnitId] = useState(
    options.defaultOrgUnitId ?? options.orgUnits[0]?.id ?? "",
  );
  const [scopeTarget, setScopeTarget] = useState<ForecastScopeTarget>("SCOPE_1");
  const [horizon, setHorizon] = useState<number>(2);

  const [forecastData, setForecastData] = useState<{
    orgUnitName: string;
    orgUnitCode: string;
    availableScopes: Array<{
      code: ForecastScopeTarget;
      name: string;
      periodsWithData: number;
      totalApprovedTco2e: number;
      isRecommended: boolean;
    }>;
    recommendedScope: ForecastScopeTarget;
    result: ForecastResult;
  } | null>(null);

  const [loading, setLoading] = useState(false);

  // Fetch forecast data
  const loadForecast = useCallback(
    async (target?: ForecastScopeTarget) => {
      if (!orgUnitId) return;
      setLoading(true);
      try {
        const result = await getForecastAction({
          orgUnitId,
          scopeTarget: target ?? scopeTarget,
          horizon,
        });

        if (result.ok) {
          setForecastData(result.data);
          // If no target was explicitly set, adopt recommended scope
          if (!target && result.data.recommendedScope && result.data.recommendedScope !== scopeTarget) {
            setScopeTarget(result.data.recommendedScope);
          }
        } else {
          toast.error(result.error ?? "Failed to load emissions forecast.");
        }
      } catch (err) {
        console.error("Forecast fetch error", err);
        toast.error("Network error retrieving emissions forecast.");
      } finally {
        setLoading(false);
      }
    },
    [orgUnitId, scopeTarget, horizon],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadForecast();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadForecast]);

  const result = forecastData?.result;
  const canForecast = result?.canForecast ?? false;
  const historical = result?.historical ?? [];
  const predictions = result?.predictions ?? [];

  // Summary figures
  const latestHistorical = historical.length > 0 ? historical[historical.length - 1] : null;
  const nextForecast = predictions.length > 0 ? predictions[0] : null;

  const projectedChangePercent = useMemo(() => {
    if (!latestHistorical || !nextForecast || latestHistorical.valueTco2e === 0) return null;
    const diff = nextForecast.predictedTco2e - latestHistorical.valueTco2e;
    return Math.round((diff / latestHistorical.valueTco2e) * 1000) / 10;
  }, [latestHistorical, nextForecast]);

  return (
    <div className="space-y-6">
      {/* 1. Header Selectors Bar */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Org Unit Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="forecast-org" className="text-xs font-medium text-muted-foreground">
                Organization:
              </label>
              <NativeSelect
                id="forecast-org"
                value={orgUnitId}
                onChange={(e) => setOrgUnitId(e.target.value)}
                className="h-8 text-xs font-medium"
              >
                {options.orgUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {"—".repeat(u.depth)} {u.name} {u.code ? `(${u.code})` : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>

            {/* Scope Target Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="forecast-scope" className="text-xs font-medium text-muted-foreground">
                Emissions Scope:
              </label>
              <NativeSelect
                id="forecast-scope"
                value={scopeTarget}
                onChange={(e) => {
                  const newTarget = e.target.value as ForecastScopeTarget;
                  setScopeTarget(newTarget);
                  void loadForecast(newTarget);
                }}
                className="h-8 text-xs font-medium"
              >
                <option value="SCOPE_1">Scope 1 (Direct Emissions)</option>
                <option value="SCOPE_2">Scope 2 (Electricity & Steam)</option>
                <option value="SCOPE_3">Scope 3 (Value Chain)</option>
                <option value="TOTAL">Total Emissions (Scope 1+2+3)</option>
              </NativeSelect>
            </div>

            {/* Forecast Horizon Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="forecast-horizon" className="text-xs font-medium text-muted-foreground">
                Horizon:
              </label>
              <NativeSelect
                id="forecast-horizon"
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="h-8 text-xs font-medium"
              >
                <option value={1}>1 Period Ahead</option>
                <option value={2}>2 Periods Ahead (Standard)</option>
                <option value={3}>3 Periods Ahead</option>
                <option value={4}>4 Periods Ahead (Extended)</option>
              </NativeSelect>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadForecast()}
              disabled={loading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        {/* Scope Coverage Badges */}
        {forecastData?.availableScopes && forecastData.availableScopes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3 text-xs">
            <span className="text-muted-foreground">Historical data coverage:</span>
            {forecastData.availableScopes.map((sc) => (
              <button
                key={sc.code}
                type="button"
                onClick={() => {
                  setScopeTarget(sc.code);
                  void loadForecast(sc.code);
                }}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  scopeTarget === sc.code
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted"
                }`}
              >
                <span>{sc.name.split(" ")[0]}</span>
                <span className="font-mono font-semibold">({sc.periodsWithData} periods)</span>
                {sc.isRecommended && (
                  <span className="rounded bg-emerald-500/10 px-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                    Recommended
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 2. Statutory / Regulatory Estimation Notice */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <div className="space-y-1">
            <p className="font-semibold tracking-wide uppercase">
              Statistical Projection · Not Official BRSR Figures
            </p>
            <p className="leading-relaxed opacity-90">
              Predicted values, model trends, and prediction intervals are generated using
              chronological time-series backtesting for forward-looking internal planning and
              reduction targets. Official regulatory disclosures must strictly rely on approved
              TraceESG calculation records.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Conditional Render: Can Forecast vs Insufficient Data State */}
      {!canForecast ? (
        <InsufficientDataState
          result={result}
          historical={historical}
          onRetry={() => void loadForecast()}
        />
      ) : (
        <>
          {/* A. 4 Headline KPI Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Card 1: Historical Baseline */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar className="size-3.5 text-muted-foreground" aria-hidden />
                Latest Observed (Baseline)
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {latestHistorical ? `${latestHistorical.valueTco2e.toFixed(2)}` : "—"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Period: {latestHistorical?.periodLabel ?? "—"}
              </div>
            </div>

            {/* Card 2: Next Period Forecast */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <TrendingUp className="size-3.5 text-primary" aria-hidden />
                Next Period Forecast
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-primary">
                {nextForecast ? `${nextForecast.predictedTco2e.toFixed(2)}` : "—"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                {projectedChangePercent !== null ? (
                  <span
                    className={
                      projectedChangePercent > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }
                  >
                    {projectedChangePercent > 0 ? `+${projectedChangePercent}%` : `${projectedChangePercent}%`}
                  </span>
                ) : null}
                <span>vs. latest observed</span>
              </div>
            </div>

            {/* Card 3: Model Accuracy & Backtest MAPE */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="size-3.5 text-muted-foreground" aria-hidden />
                Backtest Accuracy (MAPE)
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
                {result?.validationMetrics ? `${result.validationMetrics.mape}%` : "—"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">error</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {result?.validationMetrics && result.validationMetrics.relativeImprovementPercent > 0
                  ? `+${result.validationMetrics.relativeImprovementPercent}% better than naive`
                  : "Baseline benchmark"}
              </div>
            </div>

            {/* Card 4: Uncertainty Interval (95% CI) */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden />
                95% Prediction Interval
              </div>
              <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
                {nextForecast
                  ? `${nextForecast.confidenceInterval95.lower.toFixed(1)} – ${nextForecast.confidenceInterval95.upper.toFixed(1)}`
                  : "—"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Expected range (±1.96σ)
              </div>
            </div>
          </div>

          {/* B. Trajectory Chart: Historical Actuals vs Forecast Estimates */}
          <ForecastTrajectoryChart historical={historical} predictions={predictions} />

          {/* C. Model Validation & Backtest Methodology */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Statistical Model & Chronological Backtesting Evaluation
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Candidate statistical models are evaluated chronologically on past holdout periods
              to confirm predictive validity before producing forecasts.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {/* Box 1: Selected Model */}
              <div className="rounded-md border border-border/80 bg-muted/40 p-3 text-xs">
                <div className="font-medium text-muted-foreground">Selected Statistical Model</div>
                <div className="mt-1 text-sm font-bold text-foreground">
                  {result?.modelName ?? "—"}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Cadence: <strong className="text-foreground">{result?.assessment.detectedFrequency}</strong>
                </div>
              </div>

              {/* Box 2: Training & Validation Window */}
              <div className="rounded-md border border-border/80 bg-muted/40 p-3 text-xs">
                <div className="font-medium text-muted-foreground">Evaluation Windows</div>
                <div className="mt-1 space-y-0.5 text-foreground">
                  <div>
                    Train:{" "}
                    <strong>
                      {result?.trainingWindow?.startPeriod} – {result?.trainingWindow?.endPeriod}
                    </strong>{" "}
                    ({result?.trainingWindow?.observationCount} periods)
                  </div>
                  <div>
                    Backtest:{" "}
                    <strong>
                      {result?.backtestWindow?.startPeriod} – {result?.backtestWindow?.endPeriod}
                    </strong>{" "}
                    ({result?.backtestWindow?.testCount} periods)
                  </div>
                </div>
              </div>

              {/* Box 3: Error Comparison Table */}
              <div className="rounded-md border border-border/80 bg-muted/40 p-3 text-xs">
                <div className="font-medium text-muted-foreground">Validation Performance</div>
                <div className="mt-1 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MAE (Selected):</span>
                    <span className="font-mono font-medium">{result?.validationMetrics?.mae} tCO₂e</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MAE (Naive Baseline):</span>
                    <span className="font-mono text-muted-foreground">
                      {result?.validationMetrics?.baselineMae} tCO₂e
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">RMSE (Selected):</span>
                    <span className="font-mono font-medium">{result?.validationMetrics?.rmse} tCO₂e</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Observations / Limitations */}
            {result?.assessment.limitations && result.assessment.limitations.length > 0 && (
              <div className="mt-4 rounded border border-border/60 bg-background/50 p-3 text-xs">
                <div className="font-medium text-muted-foreground">Data Quality Assessment:</div>
                <ul className="mt-1.5 list-inside list-disc space-y-1 text-muted-foreground">
                  {result.assessment.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* D. Observations & Predictions Data Table */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-foreground">
                  Chronological Series: Observations and Predictions
                </h3>
                <p className="text-xs text-muted-foreground">
                  All forecast points carry explicit 80% and 95% uncertainty intervals.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-table-border">
              <table className="w-full border-collapse text-xs">
                <thead className="bg-table-header text-table-header-foreground">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-medium uppercase">Period</th>
                    <th className="px-3 py-2.5 text-left font-medium uppercase">Dates</th>
                    <th className="px-3 py-2.5 text-left font-medium uppercase">Classification</th>
                    <th className="px-3 py-2.5 text-right font-medium uppercase">Emissions (tCO₂e)</th>
                    <th className="px-3 py-2.5 text-right font-medium uppercase">80% Interval</th>
                    <th className="px-3 py-2.5 text-right font-medium uppercase">95% Interval</th>
                    <th className="px-3 py-2.5 text-center font-medium uppercase">Records</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Historical Rows */}
                  {historical.map((obs) => (
                    <tr
                      key={obs.periodId}
                      className="border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover"
                    >
                      <td className="px-3 py-2.5 font-medium">{obs.periodLabel}</td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {obs.startDate} to {obs.endDate}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone="success">Approved Historical</StatusBadge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                        {obs.valueTco2e.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">—</td>
                      <td className="px-3 py-2.5 text-center font-mono">
                        {obs.approvedRecordCount} approved
                      </td>
                    </tr>
                  ))}

                  {/* Prediction Rows */}
                  {predictions.map((pred) => (
                    <tr
                      key={pred.periodIndex}
                      className="border-t border-table-border bg-primary/5 hover:bg-primary/10"
                    >
                      <td className="px-3 py-2.5 font-medium text-primary">
                        {pred.periodLabel}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">
                        {pred.estimatedStartDate} to {pred.estimatedEndDate}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge tone="warning">Statistical Estimate</StatusBadge>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">
                        {pred.predictedTco2e.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">
                        {pred.confidenceInterval80.lower.toFixed(1)} –{" "}
                        {pred.confidenceInterval80.upper.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">
                        {pred.confidenceInterval95.lower.toFixed(1)} –{" "}
                        {pred.confidenceInterval95.upper.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-center text-muted-foreground">
                        Model Projection
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* E. Analytical Bridge to the Carbon Reduction Simulator */}
          <div className="rounded-lg border border-border bg-gradient-to-r from-card to-primary/5 p-5 shadow-xs">
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Sliders className="size-4 text-primary" aria-hidden />
                  <h4 className="text-sm font-semibold text-foreground">
                    Analytical Bridge: Explore in Reduction Simulator
                  </h4>
                </div>
                <p className="max-w-2xl text-xs text-muted-foreground">
                  Connect forecasting directly to decision-support. Model what-if reduction
                  scenarios (renewable energy, fleet electrification, boiler upgrades) using your
                  forecasted baseline of{" "}
                  <strong className="text-foreground">
                    {nextForecast ? `${nextForecast.predictedTco2e.toFixed(2)} tCO₂e` : "—"}
                  </strong>
                  .
                </p>
              </div>

              <Button asChild size="sm" className="shrink-0 gap-2">
                <Link
                  href={`/admin/simulator?org=${orgUnitId}&fromForecast=1&forecastTco2e=${nextForecast?.predictedTco2e ?? 0}&scope=${scopeTarget}`}
                >
                  Explore Reduction Scenarios
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Clean, honest Insufficient Data State.
 * Explains exact data requirements and refuses to fabricate fake numbers.
 */
function InsufficientDataState({
  result,
  historical,
  onRetry,
}: {
  result: ForecastResult | undefined;
  historical: HistoricalObservation[];
  onRetry: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-8 text-center shadow-xs">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
          <Info className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">
          Insufficient Historical Data for Defensible Forecasting
        </h3>
        <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted-foreground">
          {result?.insufficientDataReason ??
            "TraceESG adheres to strict validation standards. A minimum of 3-4 consecutive reporting periods with approved calculation records is required to evaluate models via chronological backtesting."}
        </p>

        <div className="mx-auto mt-6 max-w-md rounded-md border border-border/80 bg-muted/40 p-4 text-left text-xs">
          <div className="font-semibold text-foreground">How to enable emissions forecasting:</div>
          <ol className="mt-2 list-inside list-decimal space-y-1.5 text-muted-foreground">
            <li>Ensure at least 3 reporting periods exist in the reporting calendar.</li>
            <li>Submit activity invoices (energy, fuel, logistics) for those periods.</li>
            <li>Verify and approve calculated records in the Validation & Approval queues.</li>
          </ol>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden />
            Re-evaluate Data Coverage
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/submissions">Review Submissions</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/admin/simulator">Open Simulator with Current Data</Link>
          </Button>
        </div>
      </div>

      {/* Historical observations table if any single periods exist */}
      {historical.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
          <h4 className="text-sm font-semibold text-foreground">
            Available Historical Observations ({historical.length} period)
          </h4>
          <p className="text-xs text-muted-foreground">
            Current records available for this organization unit.
          </p>
          <div className="mt-3 overflow-x-auto rounded border border-table-border">
            <table className="w-full text-xs">
              <thead className="bg-table-header text-table-header-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Period</th>
                  <th className="px-3 py-2 text-left font-medium">Dates</th>
                  <th className="px-3 py-2 text-right font-medium">Approved Emissions (tCO₂e)</th>
                  <th className="px-3 py-2 text-center font-medium">Approved Records</th>
                </tr>
              </thead>
              <tbody>
                {historical.map((h) => (
                  <tr key={h.periodId} className="border-t border-table-border">
                    <td className="px-3 py-2 font-medium">{h.periodLabel}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {h.startDate} to {h.endDate}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {h.valueTco2e.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-center">{h.approvedRecordCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Responsive SVG chart displaying Historical Observations vs Forecast Values
 * with visually distinct actuals (solid) and predicted (dashed) series,
 * plus 80% and 95% uncertainty interval bands!
 */
function ForecastTrajectoryChart({
  historical,
  predictions,
}: {
  historical: HistoricalObservation[];
  predictions: Array<{
    periodIndex: number;
    periodLabel: string;
    predictedTco2e: number;
    confidenceInterval80: { lower: number; upper: number };
    confidenceInterval95: { lower: number; upper: number };
  }>;
}) {
  const allPoints = useMemo(() => {
    const list: Array<{
      label: string;
      actual: number | null;
      predicted: number | null;
      ci80Lower: number | null;
      ci80Upper: number | null;
      ci95Lower: number | null;
      ci95Upper: number | null;
      isForecast: boolean;
    }> = [];

    for (const h of historical) {
      list.push({
        label: h.periodLabel,
        actual: h.valueTco2e,
        predicted: null,
        ci80Lower: null,
        ci80Upper: null,
        ci95Lower: null,
        ci95Upper: null,
        isForecast: false,
      });
    }

    for (const p of predictions) {
      list.push({
        label: p.periodLabel,
        actual: null,
        predicted: p.predictedTco2e,
        ci80Lower: p.confidenceInterval80.lower,
        ci80Upper: p.confidenceInterval80.upper,
        ci95Lower: p.confidenceInterval95.lower,
        ci95Upper: p.confidenceInterval95.upper,
        isForecast: true,
      });
    }

    return list;
  }, [historical, predictions]);

  // Compute scale boundaries
  const maxVal = useMemo(() => {
    let max = 1;
    for (const p of allPoints) {
      if (p.actual !== null && p.actual > max) max = p.actual;
      if (p.predicted !== null && p.predicted > max) max = p.predicted;
      if (p.ci95Upper !== null && p.ci95Upper > max) max = p.ci95Upper;
    }
    return Math.ceil(max * 1.15); // 15% headroom
  }, [allPoints]);

  const svgWidth = 800;
  const svgHeight = 280;
  const paddingLeft = 60;
  const paddingRight = 40;
  const paddingTop = 30;
  const paddingBottom = 45;

  const chartW = svgWidth - paddingLeft - paddingRight;
  const chartH = svgHeight - paddingTop - paddingBottom;

  const count = allPoints.length;
  const getX = (idx: number) => paddingLeft + (idx / Math.max(1, count - 1)) * chartW;
  const getY = (val: number) => paddingTop + chartH - (val / Math.max(1, maxVal)) * chartH;

  // Build actuals path
  const actualIndices = allPoints
    .map((p, idx) => ({ p, idx }))
    .filter((x) => x.p.actual !== null);
  const actualPath = actualIndices
    .map((x, i) => `${i === 0 ? "M" : "L"} ${getX(x.idx)} ${getY(x.p.actual!)}`)
    .join(" ");

  // Build forecast path (connect from last actual point if available)
  const lastActual = actualIndices[actualIndices.length - 1];
  const forecastIndices = allPoints
    .map((p, idx) => ({ p, idx }))
    .filter((x) => x.p.predicted !== null);

  let forecastPath = "";
  if (forecastIndices.length > 0) {
    if (lastActual) {
      forecastPath = `M ${getX(lastActual.idx)} ${getY(lastActual.p.actual!)} `;
    } else {
      forecastPath = `M ${getX(forecastIndices[0].idx)} ${getY(forecastIndices[0].p.predicted!)} `;
    }
    for (const f of forecastIndices) {
      forecastPath += `L ${getX(f.idx)} ${getY(f.p.predicted!)} `;
    }
  }

  // Build 95% Confidence Band polygon
  let ci95Polygon = "";
  if (forecastIndices.length > 0) {
    const topPoints = forecastIndices.map((f) => `${getX(f.idx)},${getY(f.p.ci95Upper!)}`);
    const bottomPoints = [...forecastIndices]
      .reverse()
      .map((f) => `${getX(f.idx)},${getY(f.p.ci95Lower!)}`);
    ci95Polygon = topPoints.join(" ") + " " + bottomPoints.join(" ");
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground">
            Emissions Trajectory: Historical Observations vs. Statistical Forecast
          </h3>
          <p className="text-xs text-muted-foreground">
            Solid line shows approved historical calculations; dashed line with shaded band shows
            predicted estimates and uncertainty intervals.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-[var(--chart-primary)]" aria-hidden />
            <span className="font-medium">Historical Actual</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 border-t-2 border-dashed border-amber-500" aria-hidden />
            <span className="font-medium text-amber-600 dark:text-amber-400">Forecast Estimate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded bg-amber-500/20" aria-hidden />
            <span className="text-muted-foreground">95% Prediction Interval</span>
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-auto w-full min-w-[650px] overflow-visible font-sans"
        >
          {/* Y Axis Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const val = Math.round(maxVal * ratio);
            const y = getY(val);
            return (
              <g key={ratio}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeDasharray="3,3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] font-mono"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Forecast Transition Vertical Divider */}
          {lastActual && forecastIndices.length > 0 && (
            <g>
              <line
                x1={getX(lastActual.idx)}
                y1={paddingTop}
                x2={getX(lastActual.idx)}
                y2={paddingTop + chartH}
                stroke="currentColor"
                className="text-border"
                strokeWidth={1.5}
                strokeDasharray="4,4"
              />
              <text
                x={getX(lastActual.idx) + 4}
                y={paddingTop + 12}
                className="fill-muted-foreground text-[9px] font-semibold tracking-wide uppercase"
              >
                Forecast Horizon →
              </text>
            </g>
          )}

          {/* 95% Confidence Interval Shaded Band */}
          {ci95Polygon && (
            <polygon
              points={ci95Polygon}
              fill="rgba(245, 158, 11, 0.15)"
              className="transition-all duration-300"
            />
          )}

          {/* Historical Actuals Line */}
          {actualPath && (
            <path
              d={actualPath}
              fill="none"
              stroke="var(--chart-primary)"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Forecast Estimates Dashed Line */}
          {forecastPath && (
            <path
              d={forecastPath}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2.5}
              strokeDasharray="6,4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Historical Markers */}
          {actualIndices.map((x) => (
            <g key={`act-${x.idx}`}>
              <circle
                cx={getX(x.idx)}
                cy={getY(x.p.actual!)}
                r={4.5}
                fill="var(--chart-primary)"
                stroke="var(--card)"
                strokeWidth={2}
              />
              <text
                x={getX(x.idx)}
                y={getY(x.p.actual!) - 8}
                textAnchor="middle"
                className="fill-foreground text-[10px] font-mono font-semibold"
              >
                {x.p.actual!.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Forecast Markers */}
          {forecastIndices.map((f) => (
            <g key={`pred-${f.idx}`}>
              <circle
                cx={getX(f.idx)}
                cy={getY(f.p.predicted!)}
                r={5}
                fill="#f59e0b"
                stroke="var(--card)"
                strokeWidth={2}
              />
              <text
                x={getX(f.idx)}
                y={getY(f.p.predicted!) - 8}
                textAnchor="middle"
                className="fill-amber-600 dark:fill-amber-400 text-[10px] font-mono font-bold"
              >
                {f.p.predicted!.toFixed(1)}
              </text>
            </g>
          ))}

          {/* X Axis Labels */}
          {allPoints.map((p, idx) => (
            <text
              key={idx}
              x={getX(idx)}
              y={svgHeight - paddingBottom + 18}
              textAnchor="middle"
              className={`text-[10px] ${
                p.isForecast ? "fill-amber-600 dark:fill-amber-400 font-semibold" : "fill-muted-foreground"
              }`}
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}
