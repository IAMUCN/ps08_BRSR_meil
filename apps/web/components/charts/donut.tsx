"use client";

import { arcPath, donutLayout, formatNumber, type Slice } from "@/lib/charts/geometry";
import { ChartFrame, seriesColor } from "./frame";
import { ChartCanvas, Mark, useTip } from "./mark";

export type DonutSlice = Slice & { href?: string };

const SIZE = 200;
const C = SIZE / 2;

/** Share of a whole (Scope 1 / 2 / 3 split, readiness by status). The centre says the total. */
export function DonutChart({
  title,
  description,
  slices,
  unit = "",
  centreLabel,
  empty = "Nothing to show yet.",
}: {
  title: string;
  description?: string;
  slices: DonutSlice[];
  unit?: string;
  centreLabel?: string;
  empty?: string;
}) {
  const { tip, show, hide } = useTip();
  const { total, arcs } = donutLayout(slices);
  const hrefOf = new Map(slices.map((s) => [s.key, s.href]));
  const pct = (share: number) => `${formatNumber(share * 100, 1)} %`;
  const fmt = (v: number) => `${formatNumber(v)}${unit ? ` ${unit}` : ""}`;
  return (
    <ChartFrame
      title={title}
      description={description}
      empty={total === 0 ? empty : undefined}
      legend={arcs.map((a) => ({
        key: a.key,
        label: a.label,
        value: `${fmt(a.value)} · ${pct(a.share)}`,
      }))}
      table={{
        columns: ["Part", unit ? `Value (${unit})` : "Value", "Share"],
        rows: arcs.map((a) => [a.label, formatNumber(a.value), pct(a.share)]),
      }}
    >
      <div className="mx-auto w-full max-w-48">
        <ChartCanvas width={SIZE} height={SIZE} tip={tip} label={title}>
          {arcs.map((a, i) => {
            const mid = (a.start + a.end) / 2;
            return (
              <Mark
                key={a.key}
                href={hrefOf.get(a.key)}
                label={`${a.label}: ${fmt(a.value)}, ${pct(a.share)}`}
                at={{ x: C + 80 * Math.sin(mid), y: C - 80 * Math.cos(mid) }}
                text={`${a.label}: ${fmt(a.value)} (${pct(a.share)})`}
                show={show}
                hide={hide}
              >
                <path d={arcPath(C, C, 90, 58, a.start, a.end)} fill={seriesColor(i)} />
              </Mark>
            );
          })}
          <text
            x={C}
            y={C - 2}
            textAnchor="middle"
            className="fill-foreground font-mono text-xl font-semibold"
          >
            {formatNumber(total)}
          </text>
          <text x={C} y={C + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {centreLabel ?? unit}
          </text>
        </ChartCanvas>
      </div>
    </ChartFrame>
  );
}
