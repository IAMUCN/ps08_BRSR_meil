"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Flame,
  Info,
  Layers,
  Link2,
  RotateCcw,
  Sliders,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  buildScenarioComparison,
  calculateSimulation,
  validateReductionPercent,
  type BaselineData,
  type ScopeCode,
} from "@/lib/simulator/engine";
import { simulatorBaselineAction } from "./actions";

export type SimulatorOptions = {
  orgUnits: Array<{ id: string; name: string; code: string; depth: number }>;
  periods: Array<{ id: string; label: string; startDate: string; endDate: string; status: string }>;
  defaultOrgUnitId: string | null;
  defaultPeriodId: string | null;
};

export type ForecastContext = {
  isForecast: boolean;
  forecastTco2e: number | null;
  scope: string | null;
};

const PRESETS = [5, 10, 15, 20, 25];

export function SimulatorClient({
  options,
  forecastContext,
}: {
  options: SimulatorOptions;
  forecastContext?: ForecastContext;
}) {
  const [isForecastMode, setIsForecastMode] = useState(forecastContext?.isForecast ?? false);
  const [orgUnitId, setOrgUnitId] = useState(
    options.defaultOrgUnitId ?? options.orgUnits[0]?.id ?? "",
  );
  const [periodId, setPeriodId] = useState(options.defaultPeriodId ?? options.periods[0]?.id ?? "");

  const [baseline, setBaseline] = useState<BaselineData | null>(null);
  const [loading, setLoading] = useState(false);

  const [scopeFilter, setScopeFilter] = useState<"ALL" | ScopeCode>("ALL");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [reductionPercent, setReductionPercent] = useState<number>(15);
  const [scenarioName, setScenarioName] = useState<string>("Moderate 15% Reduction");

  // Load baseline data when org unit or period changes
  const loadBaseline = useCallback(async () => {
    if (!orgUnitId || !periodId) return;
    setLoading(true);
    try {
      const result = await simulatorBaselineAction({ orgUnitId, periodId });
      if (result.ok) {
        setBaseline(result.data);
        // Automatically select the first eligible category
        const firstEligible = result.data.categories.find((c) => c.isEligible);
        if (firstEligible) {
          setSelectedCategoryId(firstEligible.id);
          setScenarioName(`15% Reduction in ${firstEligible.name}`);
        } else {
          setSelectedCategoryId(result.data.categories[0]?.id ?? "");
        }
      } else {
        toast.error(result.error ?? "Failed to load emissions baseline data.");
      }
    } catch (err) {
      console.error("Baseline fetch error", err);
      toast.error("Network error loading emissions baseline.");
    } finally {
      setLoading(false);
    }
  }, [orgUnitId, periodId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadBaseline();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadBaseline]);

  // Filter categories by selected scope
  const availableCategories = useMemo(() => {
    if (!baseline) return [];
    if (scopeFilter === "ALL") return baseline.categories;
    return baseline.categories.filter((c) => c.scopeCode === scopeFilter);
  }, [baseline, scopeFilter]);

  // Selected category object
  const currentCategory = useMemo(() => {
    return baseline?.categories.find((c) => c.id === selectedCategoryId) ?? null;
  }, [baseline, selectedCategoryId]);

  // Reactive simulation calculation
  const simulation = useMemo(() => {
    if (!baseline || !selectedCategoryId) return null;
    return calculateSimulation({
      baseline,
      targetCategoryId: selectedCategoryId,
      reductionPercent,
      scenarioName,
    });
  }, [baseline, selectedCategoryId, reductionPercent, scenarioName]);

  // Comparison scenarios
  const comparisonRows = useMemo(() => {
    if (!baseline || !selectedCategoryId) return [];
    return buildScenarioComparison({
      baseline,
      targetCategoryId: selectedCategoryId,
      customPercent: reductionPercent,
    });
  }, [baseline, selectedCategoryId, reductionPercent]);

  // Handle category change
  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    const cat = baseline?.categories.find((c) => c.id === categoryId);
    if (cat) {
      setScenarioName(`${reductionPercent}% Reduction in ${cat.name}`);
    }
  };

  // Handle preset click
  const handlePresetClick = (percent: number) => {
    setReductionPercent(percent);
    if (currentCategory) {
      setScenarioName(`${percent}% Reduction in ${currentCategory.name}`);
    }
  };

  // Quick Action Template loaders
  const handleApplyTemplate = (
    scope: ScopeCode,
    keyword: string,
    percent: number,
    templateTitle: string,
  ) => {
    if (!baseline) return;
    const matched = baseline.categories.find(
      (c) => c.scopeCode === scope && c.name.toLowerCase().includes(keyword.toLowerCase()),
    );
    if (matched) {
      setScopeFilter(scope);
      setSelectedCategoryId(matched.id);
      setReductionPercent(percent);
      setScenarioName(templateTitle);
      toast.success(`Loaded initiative template: ${templateTitle}`);
    } else {
      toast.info(`No matching active category found in ${scope} for this template.`);
    }
  };

  const hasEligibleData = (baseline?.scopeTotals.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      {/* A. Persistent Disclaimer Banner */}
      <div className="flex flex-col gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground [&_.text-muted-foreground]:text-foreground sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <Info className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden />
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold tracking-wide text-foreground">
                SIMULATION — NOT OFFICIAL BRSR DATA
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              This tool models hypothetical emissions-reduction assumptions for decision support.
              Projected outputs do not modify approved activity records, verified evidence, emission
              factors, or official SEBI BRSR reports.
            </p>
          </div>
        </div>

        <div className="shrink-0 text-xs text-muted-foreground">
          Assurance Standard:{" "}
          <strong className="font-semibold text-foreground">ICAI SSAE 3000 / SEBI Core</strong>
        </div>
      </div>

      {/* A.2 Forecast-Predicted Baseline Notice */}
      {isForecastMode && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <TrendingUp className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-wide uppercase text-primary-text">
                  Predicted Baseline Scenario (Statistical Estimate)
                </span>
                <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary-text">
                  Analytical Layer
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Simulating reductions against a forward-looking emissions forecast baseline{" "}
                {forecastContext?.forecastTco2e ? (
                  <>
                    (
                    <strong className="text-foreground">
                      {forecastContext.forecastTco2e} tCO₂e
                    </strong>
                    )
                  </>
                ) : (
                  ""
                )}
                . This baseline is explicitly an estimate for decarbonization planning and is kept
                separate from official historical reporting figures.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsForecastMode(false)}
              className="h-7 text-[11px]"
            >
              Switch to Official Baseline
            </Button>
            <Button asChild variant="ghost" size="sm" className="h-7 text-[11px]">
              <Link href={`/admin/forecast?org=${orgUnitId}`}>View Forecast</Link>
            </Button>
          </div>
        </div>
      )}

      {/* B. Scenario Selectors Card */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="size-4 text-primary-text" aria-hidden />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Select Scope &amp; Target Category
            </h2>
          </div>
          {baseline && (
            <span className="text-xs text-muted-foreground">
              Period: <strong className="text-foreground">{baseline.periodLabel}</strong> · Org:{" "}
              <strong className="text-foreground">{baseline.orgUnitName}</strong>
            </span>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Organization Selector */}
          <div>
            <label
              htmlFor="sim-org"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Organization / Project
            </label>
            <NativeSelect
              id="sim-org"
              value={orgUnitId}
              onChange={(e) => setOrgUnitId(e.target.value)}
              disabled={loading}
            >
              {options.orgUnits.map((org) => (
                <option key={org.id} value={org.id}>
                  {"—".repeat(org.depth)} {org.name} ({org.code})
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Period Selector */}
          <div>
            <label
              htmlFor="sim-period"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Reporting Period
            </label>
            <NativeSelect
              id="sim-period"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
              disabled={loading}
            >
              {options.periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} {p.status === "open" ? "(Open)" : ""}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Scope Filter */}
          <div>
            <label
              htmlFor="sim-scope"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Emissions Scope Filter
            </label>
            <NativeSelect
              id="sim-scope"
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value as "ALL" | ScopeCode)}
              disabled={loading}
            >
              <option value="ALL">All Scopes (1, 2 &amp; 3)</option>
              <option value="SCOPE_1">Scope 1 (Direct Fuel / Process)</option>
              <option value="SCOPE_2">Scope 2 (Purchased Electricity)</option>
              <option value="SCOPE_3">Scope 3 (Value Chain / Travel / Waste)</option>
            </NativeSelect>
          </div>

          {/* Category Selector */}
          <div>
            <label
              htmlFor="sim-cat"
              className="mb-1.5 block text-xs font-medium text-muted-foreground"
            >
              Target Emissions Category
            </label>
            <NativeSelect
              id="sim-cat"
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={loading || availableCategories.length === 0}
            >
              {availableCategories.length === 0 ? (
                <option value="">No categories available</option>
              ) : (
                availableCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.scopeCode.replace("_", " ")}) —{" "}
                    {c.isEligible ? `${c.baselineTco2e} tCO₂e` : "No baseline data"}
                  </option>
                ))
              )}
            </NativeSelect>
          </div>
        </div>

        {/* Category Eligibility & Baseline Notice */}
        {currentCategory && !currentCategory.isEligible && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-status-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            <span>
              <strong>{currentCategory.name}</strong> has no approved baseline records in this
              period (Baseline: 0.00 tCO₂e). You can still adjust hypothetical reduction assumptions
              freely; potential savings will apply once source records are verified and approved.
            </span>
          </div>
        )}

        {/* Limitations list if any */}
        {baseline && baseline.limitations.length > 0 && (
          <div className="mt-3 space-y-1 text-xs text-muted-foreground">
            {baseline.limitations.map((note, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-muted-foreground" aria-hidden />
                <span>{note}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* C. Action Templates & Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Decarbonization Templates:
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() =>
            handleApplyTemplate(
              "SCOPE_2",
              "electricity",
              20,
              "20% Clean Power Transition (Scope 2)",
            )
          }
        >
          <Zap className="size-3 text-status-warning" aria-hidden />
          Renewable Power Transition (20%)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() =>
            handleApplyTemplate("SCOPE_1", "diesel", 15, "15% Fleet Fuel Optimization (Scope 1)")
          }
        >
          <Flame className="size-3 text-status-error" aria-hidden />
          Fleet Route Optimization (15%)
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={() =>
            handleApplyTemplate("SCOPE_3", "travel", 25, "25% Low-Carbon Travel Policy (Scope 3)")
          }
        >
          <Link2 className="size-3 text-status-info" aria-hidden />
          Commercial Air Travel Reduction (25%)
        </Button>
      </div>

      {/* D. Reduction Controls Card */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Hypothetical Reduction Assumption
            </h3>
            <p className="text-xs text-muted-foreground">
              Target: <strong className="text-foreground">{currentCategory?.name ?? "None"}</strong>{" "}
              · Range: 0% to 100%
            </p>
          </div>

          {/* Scenario Name Field */}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="sim-scenario-name" className="text-xs text-muted-foreground">
              Scenario Name:
            </label>
            <input
              id="sim-scenario-name"
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setReductionPercent(15);
                if (currentCategory) setScenarioName(`15% Reduction in ${currentCategory.name}`);
              }}
              title="Reset to 15% default"
              className="text-xs text-muted-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              Reset
            </Button>
          </div>
        </div>

        {/* Slider & Numeric Input Controls */}
        <div className="mt-5 grid items-center gap-6 sm:grid-cols-12">
          <div className="space-y-2 sm:col-span-8">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-muted-foreground">Reduction Assumption</span>
              <span className="font-mono text-sm font-bold text-primary-text">
                {reductionPercent}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={reductionPercent}
              onChange={(e) => setReductionPercent(Number(e.target.value))}
              disabled={!currentCategory}
              className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Hypothetical reduction percentage slider"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>0% (No Change)</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100% (Zero Emissions)</span>
            </div>
          </div>

          {/* Numeric Entry & Preset Buttons */}
          <div className="flex flex-col gap-2 sm:col-span-4 sm:border-l sm:border-border/60 sm:pl-6">
            <div className="flex items-center gap-2">
              <label htmlFor="sim-num-input" className="text-xs text-muted-foreground">
                Enter %:
              </label>
              <div className="relative flex-1">
                <input
                  id="sim-num-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={reductionPercent}
                  onChange={(e) => {
                    const parsed = validateReductionPercent(e.target.value);
                    setReductionPercent(parsed.value);
                  }}
                  disabled={!currentCategory}
                  className="h-8 w-full rounded-md border border-input bg-background pr-6 pl-2.5 font-mono text-xs text-foreground focus-visible:ring-1 focus-visible:ring-primary focus-visible:outline-none disabled:opacity-50"
                />
                <span className="pointer-events-none absolute top-2 right-2 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Presets:</span>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handlePresetClick(p)}
                  disabled={!currentCategory}
                  className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    reductionPercent === p
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  } disabled:opacity-50`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* E. KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Card 1: Baseline Emissions */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Layers className="size-3.5 text-muted-foreground" aria-hidden />
            {isForecastMode ? "Predicted Baseline (Estimate)" : "Baseline Category Emissions"}
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {simulation ? `${simulation.categoryBaseline.toFixed(2)}` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {isForecastMode
              ? `Forecasted Org Total: ${simulation ? `${simulation.orgBaseline.toFixed(2)} tCO₂e (Estimate)` : "—"}`
              : `Org Total: ${simulation ? `${simulation.orgBaseline.toFixed(2)} tCO₂e` : "—"}`}
          </div>
        </div>

        {/* Card 2: Projected Category Emissions */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <BarChart3 className="size-3.5 text-primary-text" aria-hidden />
            Projected Category Emissions
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-primary-text">
            {simulation ? `${simulation.categoryProjected.toFixed(2)}` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Assumption: {reductionPercent}% reduction
          </div>
        </div>

        {/* Card 3: Potential Avoided Emissions */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-status-success">
            <ArrowDownRight className="size-3.5 text-status-success" aria-hidden />
            Potential Avoided Emissions
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-status-success">
            {simulation ? `-${simulation.categoryAvoided.toFixed(2)}` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">tCO₂e</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">annualized for period</div>
        </div>

        {/* Card 4: Overall Organization Impact */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <TrendingDown className="size-3.5 text-primary-text" aria-hidden />
            Overall Organization Impact
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {simulation ? `${simulation.overallReductionPercent.toFixed(1)}%` : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">total reduction</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Org New Total: {simulation ? `${simulation.orgProjected.toFixed(2)} tCO₂e` : "—"}
          </div>
        </div>
      </div>

      {/* F. Visualization: Baseline vs. Projected Comparison Chart */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Emissions Trajectory: Baseline vs. Projected
            </h3>
            <p className="text-xs text-muted-foreground">
              Comparison across scopes with avoided emissions highlighted in green.
            </p>
          </div>

          {/* Chart Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-[var(--chart-primary)]" aria-hidden />
              <span>Baseline</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-primary/70" aria-hidden />
              <span>Projected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="size-3 rounded-xs bg-emerald-500" aria-hidden />
              <span>Avoided</span>
            </div>
          </div>
        </div>

        {!hasEligibleData ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Layers className="size-8 text-muted-foreground/50" aria-hidden />
            <h4 className="mt-3 text-sm font-medium text-foreground">No Eligible Baseline Data</h4>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Approved calculation records are required to project emissions reductions. Please
              select an organization unit and reporting period with verified emissions.
            </p>
          </div>
        ) : (
          <div className="space-y-6 pt-2">
            {/* Scope Comparison Bars */}
            <div className="space-y-4">
              {simulation?.scopes.map((sc) => {
                const maxVal = Math.max(baseline?.scopeTotals.total ?? 1, 1);
                const projPct = Math.min(100, (sc.projected / maxVal) * 100);
                const avoidPct = Math.min(100, (sc.avoided / maxVal) * 100);

                return (
                  <div key={sc.scopeCode} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{sc.scopeName}</span>
                      <span className="font-mono text-muted-foreground">
                        {sc.projected.toFixed(2)} / {sc.baseline.toFixed(2)} tCO₂e
                        {sc.avoided > 0 ? (
                          <strong className="ml-1.5 text-status-success">
                            (-{sc.avoided.toFixed(2)} tCO₂e)
                          </strong>
                        ) : null}
                      </span>
                    </div>

                    <div className="relative flex h-5 w-full overflow-hidden rounded bg-muted">
                      {/* Projected portion */}
                      <div
                        className="h-full bg-primary/80 transition-all duration-300"
                        style={{ width: `${projPct}%` }}
                        title={`${sc.scopeName} Projected: ${sc.projected.toFixed(2)} tCO₂e`}
                      />
                      {/* Avoided portion */}
                      {sc.avoided > 0 && (
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${avoidPct}%` }}
                          title={`${sc.scopeName} Avoided: ${sc.avoided.toFixed(2)} tCO₂e`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Organization Bar */}
            <div className="border-t border-border/60 pt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
                <span className="text-foreground">Total Organization Emissions</span>
                <span className="font-mono text-foreground">
                  {simulation?.orgProjected.toFixed(2)} tCO₂e{" "}
                  <span className="font-normal text-muted-foreground">
                    (Baseline: {simulation?.orgBaseline.toFixed(2)} tCO₂e)
                  </span>
                </span>
              </div>
              <div className="relative flex h-6 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-[var(--chart-primary)] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, ((simulation?.orgProjected ?? 0) / Math.max(1, simulation?.orgBaseline ?? 1)) * 100)}%`,
                  }}
                  title={`Total Projected: ${simulation?.orgProjected.toFixed(2)} tCO₂e`}
                />
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, ((simulation?.orgAvoided ?? 0) / Math.max(1, simulation?.orgBaseline ?? 1)) * 100)}%`,
                  }}
                  title={`Total Avoided: ${simulation?.orgAvoided.toFixed(2)} tCO₂e`}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* G. Scenario Comparison Matrix */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-xs">
        <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Hypothetical Scenarios Comparison
            </h3>
            <p className="text-xs text-muted-foreground">
              Comparing Conservative (5%), Moderate (15%), Ambitious (25%), and Custom assumptions
              on the same baseline.
            </p>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Target Category:{" "}
            <strong className="text-foreground">{currentCategory?.name ?? "None"}</strong>
          </span>
        </div>

        <div className="overflow-x-auto rounded-md border border-table-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                {[
                  "Scenario",
                  "Reduction %",
                  "Category Baseline",
                  "Category Projected",
                  "Avoided Emissions",
                  "Org Projected Total",
                  "Overall Org Impact",
                ].map((header, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="px-3.5 py-3 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr
                  key={row.key}
                  className={`border-t border-table-border bg-table-row even:bg-table-row-alt hover:bg-table-row-hover ${
                    row.key === "custom" || row.percent === reductionPercent
                      ? "ring-1 ring-primary/30"
                      : ""
                  }`}
                >
                  <td className="px-3.5 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{row.name}</span>
                      <StatusBadge
                        tone={
                          row.badge === "Conservative"
                            ? "neutral"
                            : row.badge === "Moderate"
                              ? "warning"
                              : row.badge === "Ambitious"
                                ? "success"
                                : "neutral"
                        }
                      >
                        {row.badge}
                      </StatusBadge>
                    </div>
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs">{row.percent}%</td>
                  <td className="px-3.5 py-3 font-mono text-xs text-muted-foreground">
                    {row.categoryBaseline.toFixed(2)} tCO₂e
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs font-semibold text-primary-text">
                    {row.categoryProjected.toFixed(2)} tCO₂e
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs font-semibold text-status-success">
                    -{row.categoryAvoided.toFixed(2)} tCO₂e
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs">
                    {row.orgProjected.toFixed(2)} tCO₂e
                  </td>
                  <td className="px-3.5 py-3 font-mono text-xs font-semibold text-foreground">
                    {row.overallReductionPercent.toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* H. Source Records Drill-Down Links */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/40 p-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-primary-text" aria-hidden />
          <span>
            Every baseline calculation originates from verified invoices and approved factor
            versions.
          </span>
        </div>
        <div className="flex items-center gap-3 font-medium">
          <Link
            href="/admin/scope-1"
            className="flex items-center gap-1 text-primary-text hover:underline"
          >
            Scope 1 Drill-Down <ChevronRight className="size-3" aria-hidden />
          </Link>
          <Link
            href="/admin/scope-2"
            className="flex items-center gap-1 text-primary-text hover:underline"
          >
            Scope 2 Drill-Down <ChevronRight className="size-3" aria-hidden />
          </Link>
          <Link
            href="/admin/reports/bundle"
            className="flex items-center gap-1 text-primary-text hover:underline"
          >
            Audit Evidence Bundle <ChevronRight className="size-3" aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
