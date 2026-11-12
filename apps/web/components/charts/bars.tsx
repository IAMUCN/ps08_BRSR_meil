"use client";

import Link from "next/link";
import { formatNumber, linear, niceTicks, stackLayout } from "@/lib/charts/geometry";
import { ChartFrame, seriesColor } from "./frame";
import { ChartCanvas, Mark, useTip } from "./mark";

export type BarSeries = {
  key: string;
  label: string;
  values: number[];
  hrefs?: (string | undefined)[];
};

const W = 520;
const H = 220;
const M = { top: 12, right: 12, bottom: 28, left: 44 };

/**
 * Columns per category. One series is a plain bar chart; several are stacked (Scope 1/2/3 by period, status by
 * unit). Negative and missing values draw nothing, and the table beside the chart says what they were.
 */
export function BarChart({
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
  series: BarSeries[];
  unit?: string;
  empty?: string;
}) {
  const { tip, show, hide } = useTip();
  const { rows, totals, max } = stackLayout(series, categories.length);
  const ticks = niceTicks(0, max);
  const y = linear(0, ticks[ticks.length - 1], H - M.bottom, M.top);
  const band = (W - M.left - M.right) / Math.max(1, categories.length);
  const barW = Math.min(48, band * 0.6);
  const fmt = (v: number) => `${formatNumber(v)}${unit ? ` ${unit}` : ""}`;
  const every = Math.ceil(categories.length / 8);
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={max === 0 ? empty : undefined}
      legend={series.length > 1 ? series.map((s) => ({ key: s.key, label: s.label })) : undefined}
      table={{
        columns: ["Period", ...series.map((s) => s.label), ...(series.length > 1 ? ["Total"] : [])],
        rows: categories.map((c, i) => [
          c,
          ...series.map((s) => formatNumber(s.values[i] ?? 0)),
          ...(series.length > 1 ? [formatNumber(totals[i])] : []),
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
        {categories.map((c, i) => {
          const cx = M.left + band * i + band / 2;
          return (
            <g key={c}>
              {i % every === 0 ? (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {c}
                </text>
              ) : null}
              {rows[i].map((seg, si) =>
                seg.value > 0 ? (
                  <Mark
                    key={seg.key}
                    href={series[si].hrefs?.[i]}
                    label={`${series[si].label}, ${c}: ${fmt(seg.value)}`}
                    at={{ x: cx, y: y(seg.to) }}
                    text={`${series[si].label} · ${c}: ${fmt(seg.value)}${series.length > 1 ? ` of ${fmt(totals[i])}` : ""}`}
                    show={show}
                    hide={hide}
                  >
                    {/* A hairline in the card colour keeps stacked segments apart without relying on hue. */}
                    <rect
                      x={cx - barW / 2}
                      y={y(seg.to)}
                      width={barW}
                      height={Math.max(1, y(seg.from) - y(seg.to))}
                      fill={seriesColor(si)}
                      className="stroke-card"
                      strokeWidth={1}
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

export type BarRow = { key: string; label: string; value: number; href?: string };

/**
 * Ranked horizontal bars with the value printed on every row (units, projects, activities). Rows keep the order
 * given; the longest bar is the largest value in the list.
 */
export function BarList({
  title,
  description,
  rows,
  unit = "",
  index = 0,
  empty = "Nothing to show yet.",
}: {
  title: string;
  description?: string;
  rows: BarRow[];
  unit?: string;
  index?: number;
  empty?: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  const fmt = (v: number) => `${formatNumber(v)}${unit ? ` ${unit}` : ""}`;
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={max === 0 ? empty : undefined}
      table={{
        columns: ["Name", unit ? `Value (${unit})` : "Value"],
        rows: rows.map((r) => [r.label, formatNumber(r.value)]),
      }}
    >
      <ul className="space-y-2">
        {rows.map((r) => {
          const inner = (
            <>
              <div className="flex items-baseline justify-between gap-3 text-sm leading-5">
                <span className="min-w-0 truncate">{r.label}</span>
                <span className="font-mono text-xs tabular-nums">{fmt(r.value)}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-sm bg-muted" aria-hidden>
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${max === 0 ? 0 : (Math.max(0, r.value) / max) * 100}%`,
                    background: seriesColor(index),
                  }}
                />
              </div>
            </>
          );
          return (
            <li key={r.key}>
              {r.href ? (
                <Link
                  href={r.href}
                  className="block rounded-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}
