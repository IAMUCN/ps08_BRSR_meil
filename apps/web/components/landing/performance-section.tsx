import { ArrowUp } from "lucide-react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SectionHeading } from "@/components/landing/section-heading";

// Sample figures for the illustration (labelled "sample" on the page). The drawings are computed from them, so a
// bar or a point always agrees with the number printed beside it (feature_enhancement.md 8.2).
const TREND = [
  { month: "Jan", value: 48 },
  { month: "Feb", value: 52 },
  { month: "Mar", value: 60 },
  { month: "Apr", value: 57 },
  { month: "May", value: 72 },
  { month: "Jun", value: 78 },
];
const SCOPES = [
  { label: "Scope 1 (Direct Fuel)", value: 32400, color: "#313490" },
  { label: "Scope 2 (Electricity)", value: 56210, color: "#E91029" },
  { label: "Scope 3 (Value chain)", value: 34810, color: "#333333" },
];
const SCOPE_MAX = Math.max(...SCOPES.map((s) => s.value));

/** A plain line chart: straight segments between the points (no smoothing that invents values), round markers,
 * y labels on their grid lines, one label per month under its point. */
function TrendChart() {
  const W = 260;
  const H = 170;
  const left = 26;
  const right = 10;
  const top = 10;
  const bottom = 24;
  const [min, max] = [30, 90];
  const ticks = [30, 50, 70, 90];
  const x = (i: number) => left + (i * (W - left - right)) / (TREND.length - 1);
  const y = (v: number) => top + ((max - v) * (H - top - bottom)) / (max - min);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-4 h-auto w-full"
      role="img"
      aria-label={`Sample monthly emissions: ${TREND.map((t) => `${t.month} ${t.value}`).join(", ")}`}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={left}
            x2={W - right}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeDasharray="3 3"
          />
          <text
            x={left - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="9"
            fontWeight="600"
            fill="#64748b"
          >
            {t}
          </text>
        </g>
      ))}
      <polyline
        points={TREND.map((t, i) => `${x(i)},${y(t.value)}`).join(" ")}
        fill="none"
        stroke="#313490"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {TREND.map((t, i) => (
        <g key={t.month}>
          <circle cx={x(i)} cy={y(t.value)} r="4" fill="#313490" stroke="#fff" strokeWidth="2">
            <title>{`${t.month}: ${t.value}`}</title>
          </circle>
          <text
            x={x(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="#64748b"
          >
            {t.month}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function PerformanceSection() {
  return (
    <section id="reporting" className="py-14 sm:py-20 px-3 sm:px-6 lg:px-8 bg-slate-50/70">
      <div className="max-w-7xl mx-auto">
        <SectionHeading eyebrow="Control tower" title="Reporting readiness at a glance">
          Consolidated emissions and readiness across your organization hierarchy. Sample data
          shown.
        </SectionHeading>

        {/* 3 Dashboard Metric Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
          {/* Card 1: Emissions Trend */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-slate-200/90 shadow-2xs flex flex-col justify-between min-h-[320px] sm:h-[340px]">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Emissions Trend <span className="font-normal text-slate-500">(sample)</span>
              </h3>
            </div>

            <TrendChart />
          </div>

          {/* Card 2: Scope Composition */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-slate-200/90 shadow-2xs flex flex-col justify-between min-h-[320px] sm:h-[340px]">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Scope Composition{" "}
                <span className="font-normal text-slate-500">(sample, tCO₂e)</span>
              </h3>
            </div>

            <div className="space-y-6 flex-1 flex flex-col justify-center">
              {SCOPES.map((scope) => (
                <div key={scope.label}>
                  <div className="flex justify-between items-center text-xs font-bold mb-2">
                    <span className="text-slate-700">{scope.label}</span>
                    <span className="text-slate-900">{scope.value.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="w-full h-4 bg-slate-100 rounded-md overflow-hidden">
                    {/* Length is the figure against the largest one, so the bars agree with the numbers. */}
                    <div
                      className="h-full rounded-md"
                      style={{
                        width: `${Math.round((scope.value / SCOPE_MAX) * 100)}%`,
                        backgroundColor: scope.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: BRSR Readiness */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-8 border border-slate-200/90 shadow-2xs flex flex-col justify-between items-center min-h-[320px] sm:h-[340px]">
            <div className="w-full text-left">
              <h3 className="text-base font-bold text-slate-900">
                BRSR Readiness <span className="font-normal text-slate-500">(sample)</span>
              </h3>
            </div>

            {/* Circular Gauge */}
            <div className="relative flex items-center justify-center my-auto">
              <svg className="w-40 h-40 transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  className="stroke-sky-100"
                  strokeWidth="12"
                  fill="none"
                />
                {/* Progress Ring with bright cyan/green */}
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  stroke="#10b981"
                  strokeWidth="12"
                  strokeDasharray="301.59"
                  strokeDashoffset={301.59 * (1 - 0.78)}
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-4xl font-black text-slate-950 tracking-tight">
                  <NumberTicker value={78} />%
                </span>
                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 mt-0.5">
                  <ArrowUp className="w-3.5 h-3.5 stroke-[3]" /> 12%
                </span>
              </div>
            </div>

            <div className="text-xs font-medium text-slate-600">
              Indicators with approved evidence (sample)
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Readiness is an internal management indicator, not an official regulatory score.
        </p>
      </div>
    </section>
  );
}
