import { arcPath } from "@/lib/charts/geometry";
import { seriesColor } from "./frame";

const SIZE = 120;
const C = SIZE / 2;

/**
 * One percentage as a ring (completion, readiness). `value` null means there was nothing to measure and says
 * so; it is never drawn as 0 % or 100 %. The number is always printed, so the ring is a reinforcement only.
 */
export function RadialChart({
  value,
  label,
  index = 0,
}: {
  value: number | null;
  label: string;
  /** Which series colour; the same measure keeps the same colour on every dashboard. */
  index?: number;
}) {
  const v = value === null ? null : Math.min(100, Math.max(0, value));
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={
        v === null ? `${label}: nothing to measure` : `${label}: ${Math.round(v)} percent`
      }
      className="block h-auto w-full max-w-28"
    >
      <path d={arcPath(C, C, 54, 42, 0, Math.PI * 2)} className="fill-muted" />
      {v !== null && v > 0 ? (
        <path d={arcPath(C, C, 54, 42, 0, (v / 100) * Math.PI * 2)} fill={seriesColor(index)} />
      ) : null}
      <text
        x={C}
        y={C + 6}
        textAnchor="middle"
        className="fill-foreground font-mono text-lg font-semibold"
      >
        {v === null ? "—" : `${Math.round(v)} %`}
      </text>
    </svg>
  );
}
