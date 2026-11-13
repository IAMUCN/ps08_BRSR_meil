import assert from "node:assert/strict";
import { test } from "node:test";
import { quarterOfRange, quarterRange, rangeLabel } from "../lib/consolidation/aggregate.ts";

test("a financial year's quarters are April-June, July-September, October-December, January-March", () => {
  assert.deepEqual(quarterRange(2026, 1), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(quarterRange(2026, 2), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(quarterRange(2026, 3), { from: "2026-10-01", to: "2026-12-31" });
  assert.deepEqual(quarterRange(2026, 4), { from: "2027-01-01", to: "2027-03-31" });
});

test("a range that is exactly a quarter is named as one", () => {
  assert.deepEqual(quarterOfRange("2027-01-01", "2027-03-31"), { startYear: 2026, quarter: 4 });
  assert.equal(quarterOfRange("2026-04-01", "2026-05-31"), null);
  assert.equal(rangeLabel("2026-07-01", "2026-09-30"), "Q2 FY 2026-27 (1 Jul 2026 to 30 Sep 2026)");
  assert.equal(rangeLabel("2026-08-01", "2026-09-30"), "1 Aug 2026 to 30 Sep 2026");
});
