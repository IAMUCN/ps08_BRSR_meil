import type { YearSummary } from "@/lib/analytics/trends";

// Year-wise emissions as small multiples: one bar chart for the total and one per scope, each in one colour,
// every bar labelled with its value. The scopes are not stacked by colour: the app's scope colours are accents
// and are too close to each other in the Special and Dark themes to tell segments apart (dataviz check,
// 2026-11-09). A year that is not complete is drawn hatched and marked "partial". The same figures are in the
// table below the charts.

const fmt = (n: number) =>
  n.toLocaleString("en-IN", { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });

const W = 280;
const H = 150;
const PAD_TOP = 22;
const PAD_BOTTOM = 34;

function MiniChart({
  title,
  years,
  pick,
  id,
}: {
  title: string;
  years: YearSummary[];
  pick: (y: YearSummary) => number;
  id: string;
}) {
  const values = years.map(pick);
  const max = Math.max(0, ...values);
  const slot = W / Math.max(years.length, 1);
  const barW = Math.min(36, slot * 0.6);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  return (
    <figure className="min-w-0 rounded-md border border-border bg-card p-3">
      <figcaption className="text-sm font-medium">
        {title} <span className="font-normal text-muted-foreground">tCO2e</span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 h-auto w-full"
        role="img"
        aria-label={`${title} by financial year: ${years
          .map((y, i) => `${y.label} ${fmt(values[i])} tCO2e${y.complete ? "" : " (partial)"}`)
          .join("; ")}`}
      >
        <defs>
          <pattern
            id={`hatch-${id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--primary-text)" opacity="0.25" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--primary-text)" strokeWidth="2.5" />
          </pattern>
        </defs>
        <line
          x1="0"
          x2={W}
          y1={H - PAD_BOTTOM}
          y2={H - PAD_BOTTOM}
          stroke="var(--border)"
          strokeWidth="1"
        />
        {years.map((y, i) => {
          const v = values[i];
          const h = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * plotH) : 0;
          const x = i * slot + (slot - barW) / 2;
          const top = H - PAD_BOTTOM - h;
          const r = Math.min(4, h / 2, barW / 2);
          return (
            <g key={y.financialYear}>
              <title>{`${y.label}: ${fmt(v)} tCO2e${y.complete ? "" : " — partial: " + y.notes.join(" ")}`}</title>
              {/* A transparent target taller than the bar, so hovering a short bar still finds it. */}
              <rect
                x={i * slot}
                y={PAD_TOP - 18}
                width={slot}
                height={plotH + 18}
                fill="transparent"
              />
              {h > 0 ? (
                <path
                  d={`M${x},${H - PAD_BOTTOM} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - PAD_BOTTOM} Z`}
                  fill={y.complete ? "var(--primary-text)" : `url(#hatch-${id})`}
                  stroke={y.complete ? "none" : "var(--primary-text)"}
                  strokeWidth={y.complete ? 0 : 1}
                />
              ) : null}
              <text
                x={x + barW / 2}
                y={top - 5}
                textAnchor="middle"
                className="fill-foreground font-mono"
                fontSize="10"
              >
                {v > 0 ? fmt(v) : "—"}
              </text>
              <text
                x={x + barW / 2}
                y={H - PAD_BOTTOM + 13}
                textAnchor="middle"
                className="fill-muted-foreground"
                fontSize="10"
              >
                {y.label.replace("FY ", "")}
              </text>
              {!y.complete ? (
                <text
                  x={x + barW / 2}
                  y={H - PAD_BOTTOM + 26}
                  textAnchor="middle"
                  className="fill-muted-foreground"
                  fontSize="9"
                >
                  partial
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function YearCharts({ years }: { years: YearSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MiniChart id="total" title="Total" years={years} pick={(y) => y.total} />
      <MiniChart id="s1" title="Scope 1" years={years} pick={(y) => y.byScope.SCOPE_1} />
      <MiniChart id="s2" title="Scope 2" years={years} pick={(y) => y.byScope.SCOPE_2} />
      <MiniChart id="s3" title="Scope 3" years={years} pick={(y) => y.byScope.SCOPE_3} />
    </div>
  );
}
