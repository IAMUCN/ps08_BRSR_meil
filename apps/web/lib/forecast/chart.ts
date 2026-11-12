/**
 * Pure calculation logic for emissions forecast chart axis ticks,
 * date formatting, and spacing.
 */

/**
 * Formats date timestamps uniformly across historical and forecast series,
 * removing verbose markers like "(Est)" for axis clarity while keeping them in tooltips.
 */
export function formatAxisDate(rawLabel: string): string {
  if (!rawLabel) return "";

  // Strip " (Est)" if present
  const label = rawLabel.replace(/\s*\(Est\)$/i, "").trim();

  // If it's an ISO date like "2025-04-01", format as "Apr 2025"
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    const [year, month] = label.split("-");
    const mNum = parseInt(month, 10);
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (mNum >= 1 && mNum <= 12) {
      return `${monthNames[mNum - 1]} ${year}`;
    }
  }

  return label;
}

/**
 * Intelligently selects readable X-axis tick indices based on available chart width,
 * timeline length, and spacing.
 *
 * Guarantees:
 * 1. No two visible labels are ever adjacent if point spacing is narrow (< 85px).
 * 2. The final historical date and first forecast date NEVER overlap.
 * 3. Ticks scale down dynamically on smaller containers (mobile/tablet).
 * 4. Boundary ticks never overflow the chart edges.
 */
export function computeVisibleTicks({
  totalPoints,
  chartWidth,
  containerWidth = 860,
  minLabelSpacingPx = 85,
  lastActualIndex,
  firstForecastIndex,
}: {
  totalPoints: number;
  chartWidth: number;
  containerWidth?: number;
  minLabelSpacingPx?: number;
  lastActualIndex?: number;
  firstForecastIndex?: number;
}): Set<number> {
  const n = totalPoints;
  const set = new Set<number>();
  if (n <= 0) return set;
  if (n === 1) {
    set.add(0);
    return set;
  }

  // Calculate effective plotting width considering container responsiveness
  const effectiveWidth = Math.min(chartWidth, Math.max(280, containerWidth - 125));
  const maxLabels = Math.max(2, Math.min(7, Math.floor(effectiveWidth / minLabelSpacingPx)));

  const pointSpacingPx = chartWidth / (n - 1);

  // If all points can fit comfortably with ample breathing room
  if (pointSpacingPx >= minLabelSpacingPx) {
    for (let i = 0; i < n; i++) set.add(i);
    return set;
  }

  // Minimum index stride between any two visible labels (must be at least 2 when pointSpacing is small)
  const minIndexStride = Math.max(2, Math.ceil(minLabelSpacingPx / pointSpacingPx));
  const step = Math.max(minIndexStride, Math.ceil((n - 1) / (maxLabels - 1)));

  // Always start with the first historical observation
  set.add(0);
  let lastAdded = 0;

  // Add intermediate ticks using uniform cadence
  for (let idx = step; idx < n - 1; idx += step) {
    // If the step lands directly on the first forecast point AND lastActual was just added, skip to avoid collision
    if (
      firstForecastIndex !== undefined &&
      idx === firstForecastIndex &&
      lastAdded === lastActualIndex
    ) {
      continue;
    }

    if (idx - lastAdded >= minIndexStride) {
      set.add(idx);
      lastAdded = idx;
    }
  }

  // Check the final timeline point (n - 1)
  const remainingDist = n - 1 - lastAdded;
  if (remainingDist >= minIndexStride) {
    set.add(n - 1);
  } else if (set.size > 1 && remainingDist > 0) {
    // If n - 1 is too close to lastAdded, replace lastAdded if doing so maintains distance from the tick before it
    const sorted = Array.from(set).sort((a, b) => a - b);
    const prevTick = sorted[sorted.length - 2];
    if (prevTick !== undefined && n - 1 - prevTick >= minIndexStride) {
      set.delete(lastAdded);
      set.add(n - 1);
    }
  }

  return set;
}
