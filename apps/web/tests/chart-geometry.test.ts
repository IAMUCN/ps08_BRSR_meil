import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arcPath,
  donutLayout,
  formatNumber,
  linePath,
  linear,
  niceTicks,
  polar,
  stackLayout,
} from "../lib/charts/geometry.ts";

test("polar: 0 is twelve o'clock and angles grow clockwise", () => {
  assert.deepEqual(polar(50, 50, 10, 0), { x: 50, y: 40 });
  assert.deepEqual(polar(50, 50, 10, Math.PI / 2), { x: 60, y: 50 });
  assert.deepEqual(polar(50, 50, 10, Math.PI), { x: 50, y: 60 });
});

test("donut: shares sum to 1, zero and negative slices are dropped, order is kept", () => {
  const { total, arcs } = donutLayout([
    { key: "a", label: "A", value: 30 },
    { key: "z", label: "Zero", value: 0 },
    { key: "n", label: "Negative", value: -5 },
    { key: "b", label: "B", value: 70 },
  ]);
  assert.equal(total, 100);
  assert.deepEqual(
    arcs.map((a) => a.key),
    ["a", "b"],
  );
  assert.ok(Math.abs(arcs.reduce((s, a) => s + a.share, 0) - 1) < 1e-9);
  assert.ok(arcs[0].end <= arcs[1].start, "slices do not overlap");
});

test("donut: nothing to draw gives no arcs; one slice has no gap and draws a full ring", () => {
  assert.equal(donutLayout([]).arcs.length, 0);
  assert.equal(donutLayout([{ key: "a", label: "A", value: 0 }]).total, 0);
  const one = donutLayout([{ key: "a", label: "A", value: 5 }]);
  assert.equal(one.arcs[0].start, 0);
  assert.ok(Math.abs(one.arcs[0].end - Math.PI * 2) < 1e-9);
  assert.ok(arcPath(50, 50, 40, 25, one.arcs[0].start, one.arcs[0].end).startsWith("M"));
});

test("arcPath: a long segment uses the large-arc flag, an empty one draws nothing", () => {
  assert.match(arcPath(50, 50, 40, 25, 0, Math.PI * 1.5), /A40 40 0 1 1/);
  assert.match(arcPath(50, 50, 40, 25, 0, Math.PI / 2), /A40 40 0 0 1/);
  assert.equal(arcPath(50, 50, 40, 25, 1, 1), "");
});

test("niceTicks: round steps that cover the data, zero included", () => {
  assert.deepEqual(niceTicks(0, 100), [0, 25, 50, 75, 100]);
  assert.deepEqual(niceTicks(0, 7), [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(-3, 10).includes(0), true);
  assert.deepEqual(niceTicks(0, 0), [0, 1]);
  assert.deepEqual(niceTicks(NaN, 5), [0, 1]);
  const t = niceTicks(0, 12345);
  assert.ok(t[0] <= 0 && t[t.length - 1] >= 12345);
});

test("linear: maps ends and middle; a flat domain sits in the middle", () => {
  const s = linear(0, 10, 100, 0);
  assert.equal(s(0), 100);
  assert.equal(s(10), 0);
  assert.equal(s(5), 50);
  assert.equal(linear(3, 3, 0, 10)(3), 5);
});

test("linePath: a missing value breaks the line instead of drawing a zero", () => {
  const d = linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, null, { x: 3, y: 4 }, { x: 4, y: 5 }]);
  assert.equal(d, "M0 1 L1 2 M3 4 L4 5");
  assert.equal(
    linePath([{ x: 0, y: 0 }, null, { x: 2, y: 2 }]),
    "",
    "lone points are dots, not lines",
  );
  assert.equal(linePath([]), "");
});

test("stackLayout: offsets accumulate, negatives and gaps count as zero, max is the tallest stack", () => {
  const { rows, totals, max } = stackLayout(
    [
      { key: "s1", label: "S1", values: [2, 5, -1] },
      { key: "s2", label: "S2", values: [3, 1] },
    ],
    3,
  );
  assert.deepEqual(
    rows[0].map((s) => [s.from, s.to]),
    [
      [0, 2],
      [2, 5],
    ],
  );
  assert.deepEqual(totals, [5, 6, 0]);
  assert.equal(max, 6);
});

test("formatNumber: Indian grouping", () => {
  assert.equal(formatNumber(1234567.891, 1), "12,34,567.9");
  assert.equal(formatNumber(0), "0");
});
