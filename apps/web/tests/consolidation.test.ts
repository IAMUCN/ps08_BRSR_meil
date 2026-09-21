import assert from "node:assert/strict";
import { test } from "node:test";
import {
  consolidate,
  financialYearLabel,
  financialYearOf,
  financialYearRange,
} from "../lib/consolidation/aggregate.ts";

const row = (
  unit: string | null,
  approved: number,
  awaiting = 0,
  records = 1,
  notCalculated = 0,
) => ({
  unit,
  approved,
  awaiting,
  records,
  notCalculated,
});

test("calculated metrics sum per result unit and never mix units", () => {
  const r = consolidate(
    { unit: "L", requiresCalculation: true, ratio: null },
    [row("kgCO2e", 100, 10, 2), row("tCO2e", 1), row(null, 0, 0, 0, 3)],
    [],
  );
  assert.equal(r.method, "sum");
  assert.deepEqual(
    r.figures.map((f) => [f.unit, f.approved, f.awaiting, f.records]),
    [
      ["kgCO2e", 100, 10, 2],
      ["tCO2e", 1, 0, 1],
    ],
  );
  assert.equal(r.notCalculated, 3, "a missing calculation is counted, never read as zero");
});

test("percentages are re-derived from summed counts, not averaged", () => {
  // Site A: 10 of 20 (50 %), site B: 10 of 180 (5.6 %). Together 20 of 200 = 10 %; averaging the two
  // percentages would give 27.8 %, summing them 55.6 %.
  const r = consolidate(
    {
      unit: "%",
      requiresCalculation: true,
      ratio: { part: "women", whole: "total", partLabel: "Women", wholeLabel: "Total employees" },
    },
    [row("%", 55.6, 0, 2)],
    [
      { key: "women", approved: 20, awaiting: 0 },
      { key: "total", approved: 200, awaiting: 0 },
    ],
  );
  assert.equal(r.method, "ratio");
  assert.equal(r.figures[0].approved, 10);
  assert.equal(r.figures[0].awaiting, null, "no pending whole → no pending percentage, not 0 %");
  assert.deepEqual(r.basis?.approved, { part: 20, whole: 200 });
});

test("recorded amounts normalise the spellings of the metric's unit", () => {
  const r = consolidate(
    { unit: "INR", requiresCalculation: false, ratio: null },
    [row("Rs", 500000), row("INR", 25000), row("USD", 10)],
    [],
  );
  assert.equal(r.method, "recorded");
  assert.deepEqual(
    r.figures.map((f) => [f.unit, f.approved]),
    [
      ["INR", 525000],
      ["USD", 10],
    ],
  );
});

test("the Indian financial year runs April to March", () => {
  assert.equal(financialYearOf("2026-09-01"), 2026);
  assert.equal(financialYearOf("2027-03-01"), 2026);
  assert.equal(financialYearOf("2026-03-31"), 2025);
  assert.equal(financialYearLabel(2026), "FY 2026-27");
  assert.deepEqual(financialYearRange(2026), { from: "2026-04-01", to: "2027-03-31" });
});
