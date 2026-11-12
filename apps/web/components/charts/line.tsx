"use client";

import { formatNumber, linePath, linear, niceTicks, type Point } from "@/lib/charts/geometry";
import { ChartFrame, seriesColor } from "./frame";
import { ChartCanvas, Mark, useTip } from "./mark";

export type LineSeries = {
  key: string;
  label: string;
  /** One value per category; null is a gap in the data, drawn as a gap. */
  values: (number | null)[];
  hrefs?: (string | undefined)[];
};

const W = 520;
const H = 220;
const M = { top: 12, right: 12, bottom: 28, left: 44 };

/** Trend over periods or years (emissions year on year, KPI by financial year). */
export function LineChart({
  title,
  description,
  categories,
  series,
  unit = "",
  empty = "No data for these periods yet.",
}: {
  title: string;
  description?: string;
  categories: string[];
  series: LineSeries[];
  unit?: string;
  empty?: string;
}) {
  const { tip, show, hide } = useTip();
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const x = linear(0, Math.max(1, categories.length - 1), M.left, W - M.right);
  // One category sits in the middle, not against the axis.
  const xAt = (i: number) => (categories.length === 1 ? (M.left + W - M.right) / 2 : x(i));
  const y = linear(ticks[0], ticks[ticks.length - 1], H - M.bottom, M.top);
  const fmt = (v: number) => `${formatNumber(v)}${unit ? ` ${unit}` : ""}`;
  // Thin the labels when there are many categories.
  const every = Math.ceil(categories.length / 8);
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={all.length === 0 ? empty : undefined}
      legend={series.length > 1 ? series.map((s) => ({ key: s.key, label: s.label })) : undefined}
      table={{
        columns: ["Period", ...series.map((s) => s.label)],
        rows: categories.map((c, i) => [
          c,
          ...series.map((s) => (s.values[i] === null ? null : formatNumber(s.values[i]!))),
        ]),
      }}
    >
      <ChartCanvas width={W} height={H} tip={tip} label={title}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-border"
              strokeWidth={t === 0 ? 1.5 : 1}
            />
            <text
              x={M.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-muted-foreground font-mono text-[10px]"
            >
              {formatNumber(t)}
            </text>
          </g>
        ))}
        {categories.map((c, i) =>
          i % every === 0 ? (
            <text
              key={c}
              x={xAt(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {c}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts: (Point | null)[] = s.values.map((v, i) =>
            v === null ? null : { x: xAt(i), y: y(v) },
          );
          return (
            <g key={s.key}>
              <path
                d={linePath(pts)}
                fill="none"
                stroke={seriesColor(si)}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {pts.map((p, i) =>
                p ? (
                  <Mark
                    key={i}
                    href={s.hrefs?.[i]}
                    label={`${s.label}, ${categories[i]}: ${fmt(s.values[i]!)}`}
                    at={p}
                    text={`${s.label} · ${categories[i]}: ${fmt(s.values[i]!)}`}
                    show={show}
                    hide={hide}
                  >
                    {/* The wide transparent circle is the touch target; the small one is what is seen. */}
                    <circle cx={p.x} cy={p.y} r={12} fill="transparent" />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={3.5}
                      fill={seriesColor(si)}
                      className="stroke-card"
                      strokeWidth={1.5}
                    />
                  </Mark>
                ) : null,
              )}
            </g>
          );
        })}
      </ChartCanvas>
    </ChartFrame>
  );
}
