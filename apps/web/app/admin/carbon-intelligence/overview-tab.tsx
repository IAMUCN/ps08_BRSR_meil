"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Calendar,
  Flame,
  Info,
  Layers,
  Leaf,
  Lightbulb,
  Link2,
  Percent,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AlertSettings } from "@/lib/analytics/alerts";
import type { Recommendation } from "@/lib/analytics/recommend";
import type { AnalyticsOverview } from "@/lib/analytics/service";
import {
  monthsLabel,
  NOTABLE_PCT,
  SCOPES,
  type Comparison,
  type ScopeCode,
  type YearSummary,
} from "@/lib/analytics/trends";
import type { EmissionAlert } from "@/lib/trpc/routers/analytics";
import { AlertsPanel } from "../carbon-analytics/alerts-panel";
import { Recommendations } from "../carbon-analytics/recommendations";

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
const th = "px-3 py-2 text-left text-[11px] leading-[14px] font-medium tracking-wide uppercase";

function ChangeDisplay({ c }: { c: Comparison }) {
  if (c.kind === "none" || c.changePct === null) {
    return (
      <span className="text-xs text-muted-foreground">
        {c.kind === "none" ? "Not comparable" : "—"}
      </span>
    );
  }
  const up = c.changePct > 0;
  const notable = Math.abs(c.changePct) >= NOTABLE_PCT;
  return (
    <span className="text-xs">
      <span className={notable ? "font-semibold" : undefined}>
        {up ? "▲" : c.changePct < 0 ? "▼" : "■"} {up ? "+" : ""}
        {Math.round(c.changePct)}%
      </span>
      {notable ? <span className="sr-only"> (a notable change)</span> : null}
      <span className="block text-[11px] text-muted-foreground">
        {c.kind === "full" ? "full year" : `same months: ${monthsLabel(c.months)}`}
      </span>
    </span>
  );
}

export function OverviewTab({
  overview,
  alerts,
  settings,
  isSuperAdmin,
  aiAvailable,
}: {
  overview: AnalyticsOverview;
  alerts: EmissionAlert[];
  settings: AlertSettings;
  isSuperAdmin: boolean;
  aiAvailable: boolean;
}) {
  const { years, activities } = overview.trends;
  const latestYear = years.length > 0 ? years[years.length - 1] : null;

  // Selected Scope filter for Historical Trend chart
  const [scopeFilter, setScopeFilter] = useState<"ALL" | ScopeCode | "TOTAL">("ALL");
  const [hoveredYear, setHoveredYear] = useState<YearSummary | null>(null);

  // Compute Renewable Energy metric from activities
  const renewableStats = useMemo(() => {
    let renewableT = 0;
    let gridT = 0;
    for (const act of activities) {
      const latestVal = act.values[act.values.length - 1] ?? 0;
      if (act.metricCode === "RENEWABLE_ELECTRICITY") {
        renewableT += latestVal;
      } else if (act.metricCode === "GRID_ELECTRICITY") {
        gridT += latestVal;
      }
    }
    const totalPowerT = renewableT + gridT;
    const sharePct = totalPowerT > 0 ? Math.round((renewableT / totalPowerT) * 100) : 0;
    return { renewableT, gridT, sharePct };
  }, [activities]);

  // Determine top contributing scope in latest year
  const topScopeInfo = useMemo(() => {
    if (!latestYear || latestYear.total === 0) return null;
    const scopes = [
      { code: "SCOPE_1" as ScopeCode, name: "Scope 1 (Direct)", val: latestYear.byScope.SCOPE_1 },
      {
        code: "SCOPE_2" as ScopeCode,
        name: "Scope 2 (Electricity)",
        val: latestYear.byScope.SCOPE_2,
      },
      {
        code: "SCOPE_3" as ScopeCode,
        name: "Scope 3 (Value Chain)",
        val: latestYear.byScope.SCOPE_3,
      },
    ];
    scopes.sort((a, b) => b.val - a.val);
    const top = scopes[0];
    const pct = Math.round((top.val / latestYear.total) * 100);
    return { ...top, pct };
  }, [latestYear]);

  // Overall Year-over-Year Change
  const yoyChange = latestYear?.change;

  return (
    <div className="space-y-6">
      {/* A. 6 Carbon KPI Cards */}
      <section aria-labelledby="kpi-heading" className="space-y-2">
        <div className="flex items-center justify-between">
          <h2
            id="kpi-heading"
            className="text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            Carbon Performance Metrics · {latestYear ? latestYear.label : "Current"}
          </h2>
          {latestYear && (
            <span className="text-[11px] text-muted-foreground">
              Status:{" "}
              <strong
                className={latestYear.complete ? "text-status-success" : "text-status-warning"}
              >
                {latestYear.complete ? "Complete FY" : "In Progress / Partial"}
              </strong>
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Card 1: Total Carbon Emissions */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total Emissions</span>
              <Layers className="size-3.5 text-primary-text" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {latestYear ? fmt(latestYear.total) : "—"}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Approved calculations</div>
          </div>

          {/* Card 2: Scope 1 Emissions */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Scope 1 (Direct)</span>
              <Flame className="size-3.5 text-rose-500" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {latestYear ? fmt(latestYear.byScope.SCOPE_1) : "—"}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Fuel, DG sets & fleet</div>
          </div>

          {/* Card 3: Scope 2 Emissions */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Scope 2 (Electricity)
              </span>
              <Zap className="size-3.5 text-amber-500" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {latestYear ? fmt(latestYear.byScope.SCOPE_2) : "—"}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">Purchased grid power</div>
          </div>

          {/* Card 4: Scope 3 Emissions */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Scope 3 (Value Chain)
              </span>
              <Link2 className="size-3.5 text-blue-500" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {latestYear ? fmt(latestYear.byScope.SCOPE_3) : "—"}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">tCO₂e</span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Business travel & logistics
            </div>
          </div>

          {/* Card 5: YoY Emissions Change */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">YoY Change</span>
              {yoyChange && yoyChange.kind !== "none" && yoyChange.changePct !== null ? (
                yoyChange.changePct > 0 ? (
                  <ArrowUpRight className="size-3.5 text-status-error" aria-hidden />
                ) : (
                  <ArrowDownRight className="size-3.5 text-status-success" aria-hidden />
                )
              ) : (
                <Percent className="size-3.5 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {yoyChange && yoyChange.kind !== "none" && yoyChange.changePct !== null ? (
                <span
                  className={
                    yoyChange.changePct > 0
                      ? "text-status-error"
                      : yoyChange.changePct < 0
                        ? "text-status-success"
                        : "text-foreground"
                  }
                >
                  {yoyChange.changePct > 0 ? "+" : ""}
                  {Math.round(yoyChange.changePct)}%
                </span>
              ) : (
                "—"
              )}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {yoyChange && yoyChange.kind === "same_months"
                ? `Like-for-like (${monthsLabel(yoyChange.months)})`
                : "Full year comparison"}
            </div>
          </div>

          {/* Card 6: Renewable Energy Contribution */}
          <div className="rounded-lg border border-border bg-card p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Renewable Energy</span>
              <Leaf className="size-3.5 text-emerald-500" aria-hidden />
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-foreground">
              {renewableStats.sharePct > 0
                ? `${renewableStats.sharePct}%`
                : `${fmt(renewableStats.renewableT)}`}
              <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                {renewableStats.sharePct > 0 ? "share" : "tCO₂e"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {renewableStats.sharePct > 0 ? "Clean energy adoption" : "No verified REC records"}
            </div>
          </div>
        </div>
      </section>

      {/* B. Historical Emissions Trend Chart & Scope Filter */}
      <section
        aria-labelledby="trend-heading"
        className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 id="trend-heading" className="text-sm font-semibold tracking-tight text-foreground">
              Historical Emissions Trend — {overview.orgUnitName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Approved records across financial years (April to March) in tCO₂e. Hatched bars
              represent partial financial years.
            </p>
          </div>

          {/* Scope Filter Controls */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-muted/30 p-1 text-xs">
            <button
              type="button"
              onClick={() => setScopeFilter("ALL")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                scopeFilter === "ALL"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All Scopes
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("TOTAL")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                scopeFilter === "TOTAL"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Total
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("SCOPE_1")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                scopeFilter === "SCOPE_1"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Scope 1
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("SCOPE_2")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                scopeFilter === "SCOPE_2"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Scope 2
            </button>
            <button
              type="button"
              onClick={() => setScopeFilter("SCOPE_3")}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                scopeFilter === "SCOPE_3"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Scope 3
            </button>
          </div>
        </div>

        {/* Dynamic SVG Visualizer */}
        {years.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
            No approved emission calculations found for this organization unit.
          </div>
        ) : (
          <HistoricalTrendVisualizer
            years={years}
            scopeFilter={scopeFilter}
            onHoverYear={setHoveredYear}
            hoveredYear={hoveredYear}
          />
        )}

        {/* Detailed Financial Year Comparison Table */}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-table-header text-table-header-foreground">
              <tr>
                <th scope="col" className={th}>
                  Financial Year
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Scope 1 (tCO₂e)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Scope 2 (tCO₂e)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Scope 3 (tCO₂e)
                </th>
                <th scope="col" className={`${th} text-right`}>
                  Total (tCO₂e)
                </th>
                <th scope="col" className={th}>
                  YoY Change
                </th>
                <th scope="col" className={th}>
                  Data Completeness
                </th>
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => (
                <tr
                  key={y.financialYear}
                  className="border-t border-table-border bg-table-row hover:bg-table-row-hover align-top"
                >
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-foreground">
                    {y.label}
                  </th>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(y.byScope.SCOPE_1)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(y.byScope.SCOPE_2)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmt(y.byScope.SCOPE_3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                    {fmt(y.total)}
                  </td>
                  <td className="px-3 py-2.5">
                    <ChangeDisplay c={y.change} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-0.5">
                      <StatusBadge tone={y.complete ? "success" : "warning"}>
                        {y.complete ? "Complete" : "Partial"}
                      </StatusBadge>
                      {!y.complete && y.notes.length > 0 && (
                        <div className="text-[11px] text-muted-foreground">
                          {y.notes.join("; ")}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* C. Insights, Key Highlights & Recommendations */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Actionable Recommendations */}
        <div className="space-y-4">
          <Recommendations
            orgUnitId={overview.orgUnitId}
            items={overview.recommendations}
            aiAvailable={aiAvailable}
          />
        </div>

        {/* Right Column: Threshold Alerts & Quality Observations */}
        <div className="space-y-4">
          {/* Key Insight Pill */}
          {topScopeInfo && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-xs">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <Sparkles className="size-4 text-primary-text" aria-hidden />
                <span>Primary Emissions Driver</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                <strong className="text-foreground">{topScopeInfo.name}</strong> accounts for{" "}
                <strong className="text-foreground">{topScopeInfo.pct}%</strong> of current total
                carbon emissions ({fmt(topScopeInfo.val)} tCO₂e). Prioritizing interventions in this
                scope delivers the highest abatement leverage.
              </p>
            </div>
          )}

          {/* Threshold Alerts Panel */}
          <AlertsPanel alerts={alerts} settings={settings} isSuperAdmin={isSuperAdmin} />
        </div>
      </div>
    </div>
  );
}

/**
 * Clean SVG Visualizer for Year-wise Historical Trends with Stacked or Isolated Scope Views.
 */
function HistoricalTrendVisualizer({
  years,
  scopeFilter,
  onHoverYear,
  hoveredYear,
}: {
  years: YearSummary[];
  scopeFilter: "ALL" | ScopeCode | "TOTAL";
  onHoverYear: (y: YearSummary | null) => void;
  hoveredYear: YearSummary | null;
}) {
  const svgWidth = 800;
  const svgHeight = 220;
  const padLeft = 60;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 40;

  const chartW = svgWidth - padLeft - padRight;
  const chartH = svgHeight - padTop - padBottom;

  const maxVal = useMemo(() => {
    let max = 1;
    for (const y of years) {
      if (scopeFilter === "ALL" || scopeFilter === "TOTAL") {
        if (y.total > max) max = y.total;
      } else {
        const val = y.byScope[scopeFilter];
        if (val > max) max = val;
      }
    }
    return Math.ceil(max * 1.15);
  }, [years, scopeFilter]);

  const slotW = chartW / Math.max(1, years.length);
  const barW = Math.min(50, slotW * 0.55);

  const getY = (val: number) => padTop + chartH - (val / Math.max(1, maxVal)) * chartH;

  return (
    <div className="space-y-2">
      {/* Active Year Tooltip Pill */}
      <div className="min-h-[26px] text-xs">
        {hoveredYear ? (
          <div className="flex items-center gap-3 text-muted-foreground animate-in fade-in duration-100">
            <span className="font-bold text-foreground">{hoveredYear.label}</span>
            <span>
              Total:{" "}
              <strong className="font-mono text-foreground">{fmt(hoveredYear.total)} tCO₂e</strong>
            </span>
            <span>
              Scope 1: <span className="font-mono">{fmt(hoveredYear.byScope.SCOPE_1)}</span>
            </span>
            <span>
              Scope 2: <span className="font-mono">{fmt(hoveredYear.byScope.SCOPE_2)}</span>
            </span>
            <span>
              Scope 3: <span className="font-mono">{fmt(hoveredYear.byScope.SCOPE_3)}</span>
            </span>
            <StatusBadge tone={hoveredYear.complete ? "success" : "warning"}>
              {hoveredYear.complete ? "Complete" : "Partial"}
            </StatusBadge>
          </div>
        ) : (
          <span className="text-muted-foreground text-[11px]">
            Hover over any financial year bar to inspect scope breakdowns.
          </span>
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="h-auto w-full min-w-[550px] overflow-visible select-none"
        >
          <defs>
            <pattern
              id="hatch-partial"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="var(--primary-text)" opacity="0.2" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--primary-text)" strokeWidth="2" />
            </pattern>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((r) => {
            const v = Math.round(maxVal * r);
            const y = getY(v);
            return (
              <g key={r}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="currentColor"
                  className="text-border/60"
                  strokeDasharray="3,3"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] font-mono"
                >
                  {v}
                </text>
              </g>
            );
          })}

          {/* Y Axis unit */}
          <text
            x={padLeft - 8}
            y={padTop - 12}
            textAnchor="end"
            className="fill-muted-foreground text-[9px] font-medium uppercase"
          >
            tCO₂e
          </text>

          {/* Bars */}
          {years.map((y, i) => {
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            const isHovered = hoveredYear?.financialYear === y.financialYear;

            if (scopeFilter === "ALL") {
              // Stacked Scope 1, 2, 3
              const s1H = (y.byScope.SCOPE_1 / maxVal) * chartH;
              const s2H = (y.byScope.SCOPE_2 / maxVal) * chartH;
              const s3H = (y.byScope.SCOPE_3 / maxVal) * chartH;

              const s1Y = padTop + chartH - s1H;
              const s2Y = s1Y - s2H;
              const s3Y = s2Y - s3H;
              const totalY = getY(y.total);

              return (
                <g
                  key={y.financialYear}
                  onMouseEnter={() => onHoverYear(y)}
                  onMouseLeave={() => onHoverYear(null)}
                  className="cursor-pointer"
                >
                  {/* Invisible hit box */}
                  <rect
                    x={padLeft + i * slotW}
                    y={padTop}
                    width={slotW}
                    height={chartH}
                    fill="transparent"
                  />
                  {/* Scope 1 segment */}
                  {s1H > 0 && (
                    <rect
                      x={x}
                      y={s1Y}
                      width={barW}
                      height={s1H}
                      fill="#f43f5e"
                      opacity={y.complete ? 0.9 : 0.6}
                      rx={s2H === 0 && s3H === 0 ? 3 : 0}
                    />
                  )}
                  {/* Scope 2 segment */}
                  {s2H > 0 && (
                    <rect
                      x={x}
                      y={s2Y}
                      width={barW}
                      height={s2H}
                      fill="#f59e0b"
                      opacity={y.complete ? 0.9 : 0.6}
                      rx={s3H === 0 ? 3 : 0}
                    />
                  )}
                  {/* Scope 3 segment */}
                  {s3H > 0 && (
                    <rect
                      x={x}
                      y={s3Y}
                      width={barW}
                      height={s3H}
                      fill="#3b82f6"
                      opacity={y.complete ? 0.9 : 0.6}
                      rx={3}
                    />
                  )}

                  {/* Total Label above bar */}
                  <text
                    x={x + barW / 2}
                    y={totalY - 6}
                    textAnchor="middle"
                    className="fill-foreground text-[10px] font-mono font-bold"
                  >
                    {fmt(y.total)}
                  </text>

                  {/* X Axis label */}
                  <text
                    x={x + barW / 2}
                    y={svgHeight - padBottom + 18}
                    textAnchor="middle"
                    className={`text-[10px] ${
                      isHovered ? "fill-primary font-bold" : "fill-muted-foreground"
                    }`}
                  >
                    {y.label}
                  </text>
                  {!y.complete && (
                    <text
                      x={x + barW / 2}
                      y={svgHeight - padBottom + 30}
                      textAnchor="middle"
                      className="fill-amber-600 dark:fill-amber-400 text-[9px] font-medium"
                    >
                      (partial)
                    </text>
                  )}
                </g>
              );
            }

            // Single selected scope / total bar
            const val = scopeFilter === "TOTAL" ? y.total : y.byScope[scopeFilter];
            const h = maxVal > 0 ? (val / maxVal) * chartH : 0;
            const top = padTop + chartH - h;

            return (
              <g
                key={y.financialYear}
                onMouseEnter={() => onHoverYear(y)}
                onMouseLeave={() => onHoverYear(null)}
                className="cursor-pointer"
              >
                <rect
                  x={padLeft + i * slotW}
                  y={padTop}
                  width={slotW}
                  height={chartH}
                  fill="transparent"
                />
                {h > 0 && (
                  <rect
                    x={x}
                    y={top}
                    width={barW}
                    height={h}
                    fill={y.complete ? "var(--primary-text)" : "url(#hatch-partial)"}
                    stroke={y.complete ? "none" : "var(--primary-text)"}
                    strokeWidth={y.complete ? 0 : 1}
                    rx={3}
                  />
                )}
                <text
                  x={x + barW / 2}
                  y={top - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] font-mono font-bold"
                >
                  {fmt(val)}
                </text>
                <text
                  x={x + barW / 2}
                  y={svgHeight - padBottom + 18}
                  textAnchor="middle"
                  className={`text-[10px] ${
                    isHovered ? "fill-primary font-bold" : "fill-muted-foreground"
                  }`}
                >
                  {y.label}
                </text>
                {!y.complete && (
                  <text
                    x={x + barW / 2}
                    y={svgHeight - padBottom + 30}
                    textAnchor="middle"
                    className="fill-amber-600 dark:fill-amber-400 text-[9px] font-medium"
                  >
                    (partial)
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Scope Legend when All Scopes selected */}
      {scopeFilter === "ALL" && (
        <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-rose-500" aria-hidden />
            <span>Scope 1 (Direct)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-amber-500" aria-hidden />
            <span>Scope 2 (Electricity)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded bg-blue-500" aria-hidden />
            <span>Scope 3 (Value Chain)</span>
          </div>
        </div>
      )}
    </div>
  );
}
