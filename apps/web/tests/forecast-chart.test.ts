import assert from "node:assert/strict";
import { test } from "node:test";
import { computeVisibleTicks, formatAxisDate } from "../lib/forecast/chart.ts";

// =========================================================================
// 1. FORMAT AXIS DATE VERIFICATION
// =========================================================================

test("FORECAST CHART: formatAxisDate strips verbose (Est) marker", () => {
  assert.equal(formatAxisDate("May 2026 (Est)"), "May 2026");
  assert.equal(formatAxisDate("Q3 2026 (Est)"), "Q3 2026");
  assert.equal(formatAxisDate("FY 2026-27 (Est)"), "FY 2026-27");
});

test("FORECAST CHART: formatAxisDate converts raw ISO dates to standard Month Year", () => {
  assert.equal(formatAxisDate("2025-04-01"), "Apr 2025");
  assert.equal(formatAxisDate("2025-12-31"), "Dec 2025");
  assert.equal(formatAxisDate("2026-01-15"), "Jan 2026");
});

test("FORECAST CHART: formatAxisDate preserves standard historical labels intact", () => {
  assert.equal(formatAxisDate("Apr 2025"), "Apr 2025");
  assert.equal(formatAxisDate("Q2 2025-26"), "Q2 2025-26");
  assert.equal(formatAxisDate("FY 2024-25"), "FY 2024-25");
});

// =========================================================================
// 2. INTELLIGENT TICK SELECTION ALGORITHM VERIFICATION
// =========================================================================

test("FORECAST CHART: Final historical date and first forecast date NEVER overlap", () => {
  // 12 historical monthly points (indices 0..11) + 3 forecast points (indices 12..14)
  const totalPoints = 15;
  const chartWidth = 735;
  const lastActualIndex = 11;
  const firstForecastIndex = 12;

  const ticks = computeVisibleTicks({
    totalPoints,
    chartWidth,
    containerWidth: 860,
    minLabelSpacingPx: 85,
    lastActualIndex,
    firstForecastIndex,
  });

  // CRITICAL: Indices 11 and 12 are adjacent (ΔX ~ 52px < 85px). Both MUST NOT be rendered.
  assert.ok(
    !(ticks.has(lastActualIndex) && ticks.has(firstForecastIndex)),
    "Final historical date and first forecast date must never be simultaneous visible ticks",
  );

  // Verify that any two adjacent visible ticks have at least 85px separation
  const sorted = Array.from(ticks).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const pixelDist = ((sorted[i] - sorted[i - 1]) / (totalPoints - 1)) * chartWidth;
    assert.ok(
      pixelDist >= 85,
      `Adjacent visible ticks at index ${sorted[i - 1]} and ${sorted[i]} are only ${pixelDist.toFixed(1)}px apart (< 85px)`,
    );
  }
});

test("FORECAST CHART: Short dataset renders all points when spacing is ample", () => {
  // 3 historical points + 1 forecast point = 4 points total
  // 735px / 3 = 245px spacing >> 85px
  const ticks = computeVisibleTicks({
    totalPoints: 4,
    chartWidth: 735,
    containerWidth: 860,
    minLabelSpacingPx: 85,
    lastActualIndex: 2,
    firstForecastIndex: 3,
  });

  assert.equal(ticks.size, 4);
  assert.ok(ticks.has(0));
  assert.ok(ticks.has(1));
  assert.ok(ticks.has(2));
  assert.ok(ticks.has(3));
});

test("FORECAST CHART: Long monthly timeline renders readable subset (no crowding)", () => {
  // 24 historical points + 4 forecast points = 28 points total
  const ticks = computeVisibleTicks({
    totalPoints: 28,
    chartWidth: 735,
    containerWidth: 860,
    minLabelSpacingPx: 85,
    lastActualIndex: 23,
    firstForecastIndex: 24,
  });

  // Must select between 4 and 7 labels
  assert.ok(ticks.size >= 4 && ticks.size <= 7, `Expected 4-7 ticks, got ${ticks.size}`);

  const sorted = Array.from(ticks).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const pixelDist = ((sorted[i] - sorted[i - 1]) / 27) * 735;
    assert.ok(
      pixelDist >= 85,
      `Ticks ${sorted[i - 1]} and ${sorted[i]} are too close: ${pixelDist.toFixed(1)}px`,
    );
  }
});

test("FORECAST CHART: Quarterly timeline (10 points) selects quarterly cadence", () => {
  // 8 historical quarters + 2 forecast quarters = 10 points
  const ticks = computeVisibleTicks({
    totalPoints: 10,
    chartWidth: 735,
    containerWidth: 860,
    minLabelSpacingPx: 85,
    lastActualIndex: 7,
    firstForecastIndex: 8,
  });

  assert.ok(ticks.size >= 3 && ticks.size <= 6);
  assert.ok(!(ticks.has(7) && ticks.has(8)), "Quarterly boundary points 7 and 8 must not overlap");
});

test("FORECAST CHART: Annual timeline (6 points) fits cleanly", () => {
  // 4 historical years + 2 forecast years = 6 points
  // 735 / 5 = 147px >> 85px
  const ticks = computeVisibleTicks({
    totalPoints: 6,
    chartWidth: 735,
    containerWidth: 860,
    minLabelSpacingPx: 85,
    lastActualIndex: 3,
    firstForecastIndex: 4,
  });

  assert.equal(ticks.size, 6);
});

test("FORECAST CHART: Responsiveness scales tick density down on mobile/tablet containers", () => {
  const totalPoints = 20;
  const chartWidth = 735;

  // Desktop (860px container):
  const desktopTicks = computeVisibleTicks({
    totalPoints,
    chartWidth,
    containerWidth: 860,
    minLabelSpacingPx: 85,
  });

  // Tablet (600px container):
  const tabletTicks = computeVisibleTicks({
    totalPoints,
    chartWidth,
    containerWidth: 600,
    minLabelSpacingPx: 85,
  });

  // Mobile (360px container):
  const mobileTicks = computeVisibleTicks({
    totalPoints,
    chartWidth,
    containerWidth: 360,
    minLabelSpacingPx: 85,
  });

  // Tick density must decrease gracefully on smaller viewports
  assert.ok(
    desktopTicks.size >= tabletTicks.size,
    `Desktop (${desktopTicks.size}) should have >= tablet (${tabletTicks.size})`,
  );
  assert.ok(
    tabletTicks.size >= mobileTicks.size,
    `Tablet (${tabletTicks.size}) should have >= mobile (${mobileTicks.size})`,
  );
  assert.ok(
    mobileTicks.size >= 2 && mobileTicks.size <= 3,
    `Mobile should have 2-3 ticks, got ${mobileTicks.size}`,
  );
});
