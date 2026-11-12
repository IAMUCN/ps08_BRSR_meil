// Pure geometry for the dashboard's own SVG chart kit (no chart library, no DOM). Everything the
// components in components/charts/ compute lives here so it can be unit tested.

export type Point = { x: number; y: number };

const round = (n: number) => Math.round(n * 100) / 100;

/** Point on a circle; angle 0 is 12 o'clock and grows clockwise (radians). */
export function polar(cx: number, cy: number, r: number, angle: number): Point {
  return { x: round(cx + r * Math.sin(angle)), y: round(cy - r * Math.cos(angle)) };
}

/**
 * Path of one donut segment from `start` to `end` (radians, clockwise from 12 o'clock). A segment that
 * covers the whole circle is drawn as two halves, because an SVG arc cannot start and end on one point.
 */
export function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  start: number,
  end: number,
): string {
  const full = Math.PI * 2;
  const sweep = Math.min(end - start, full - 0.0001);
  if (sweep <= 0) return "";
  const e = start + sweep;
  const large = sweep > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, rOuter, start);
  const o2 = polar(cx, cy, rOuter, e);
  const i1 = polar(cx, cy, rInner, e);
  const i2 = polar(cx, cy, rInner, start);
  return [
    `M${o1.x} ${o1.y}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${o2.x} ${o2.y}`,
    `L${i1.x} ${i1.y}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${i2.x} ${i2.y}`,
    "Z",
  ].join(" ");
}

export type Slice = { key: string; label: string; value: number };

/** Donut layout: only slices with a positive value, in order, each with its share and angles. */
export function donutLayout(slices: Slice[], gap = 0.02) {
  const kept = slices.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = kept.reduce((a, s) => a + s.value, 0);
  if (total === 0)
    return { total: 0, arcs: [] as (Slice & { share: number; start: number; end: number })[] };
  const full = Math.PI * 2;
  // A single slice has no neighbour to separate from.
  const g = kept.length > 1 ? gap : 0;
  let at = 0;
  const arcs = kept.map((s) => {
    const share = s.value / total;
    const start = at + g / 2;
    const end = at + share * full - g / 2;
    at += share * full;
    return { ...s, share, start, end };
  });
  return { total, arcs };
}

/** "Nice" axis ticks covering [0, max] (and below zero when `min` is negative). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0, 1];
  const rough = (hi - lo) / Math.max(1, count - 1);
  const pow = 10 ** Math.floor(Math.log10(rough));
  const f = rough / pow;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  const ticks: number[] = [];
  for (
    let t = Math.floor(lo / step) * step;
    t <= Math.ceil(hi / step) * step + step / 1e6;
    t += step
  ) {
    ticks.push(round(t));
  }
  return ticks;
}

/** Linear scale from a domain to a range. A flat domain maps to the middle of the range. */
export function linear(d0: number, d1: number, r0: number, r1: number) {
  return (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));
}

/**
 * A polyline path through the points. A null value breaks the line (a gap is a gap, never a zero), and a
 * lone point between gaps is drawn as a dot by the component, so it returns no path segment of its own.
 */
export function linePath(points: (Point | null)[]): string {
  let d = "";
  let run: Point[] = [];
  const flush = () => {
    if (run.length > 1) d += `${d ? " " : ""}M${run.map((p) => `${p.x} ${p.y}`).join(" L")}`;
    run = [];
  };
  for (const p of points) {
    if (p) run.push(p);
    else flush();
  }
  flush();
  return d;
}

export type StackSeries = { key: string; label: string; values: number[] };

/** Stacked bar layout: per category, each series' [from, to] offsets, negatives and nulls counted as zero. */
export function stackLayout(series: StackSeries[], categories: number) {
  const totals: number[] = [];
  const rows = Array.from({ length: categories }, (_, i) => {
    let at = 0;
    const segments = series.map((s) => {
      const v = Math.max(0, s.values[i] ?? 0);
      const seg = { key: s.key, from: at, to: at + v, value: v };
      at += v;
      return seg;
    });
    totals[i] = at;
    return segments;
  });
  return { rows, totals, max: Math.max(0, ...totals) };
}

/** A figure for a label or tooltip: Indian digit grouping, at most `digits` decimals. */
export function formatNumber(v: number, digits = 1): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(v);
}
