import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findAlerts,
  readAlertSettings,
  DEFAULT_ALERT_SETTINGS,
  type UnitPeriodScope,
} from "../lib/analytics/alerts.ts";
import { recommend } from "../lib/analytics/recommend.ts";
import {
  buildTrends,
  compare,
  monthsLabel,
  type EmissionRow,
  type PeriodInfo,
} from "../lib/analytics/trends.ts";
import { checkWording, numbersIn, wordingMessages } from "../lib/analytics/wording.ts";

// feature_enhancement.md Phase 7: year-wise trends, suggestions and threshold alerts (lib/analytics/*).

/** Monthly periods from April of `fromFy` for `years` years, closed. */
function months(fromFy: number, years: number, status = "closed"): PeriodInfo[] {
  const out: PeriodInfo[] = [];
  for (let i = 0; i < years * 12; i++) {
    const m = ((3 + i) % 12) + 1;
    const y = fromFy + Math.floor((3 + i) / 12);
    const mm = String(m).padStart(2, "0");
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    out.push({
      id: `p-${y}-${mm}`,
      label: `${"Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")[m - 1]} ${y}`,
      startDate: `${y}-${mm}-01`,
      endDate: `${y}-${mm}-${last}`,
      type: "monthly",
      status,
    });
  }
  return out;
}

const row = (
  periodId: string,
  metricCode: string,
  t: number,
  extra: Partial<EmissionRow> = {},
): EmissionRow => ({
  periodId,
  metricCode,
  metricName: metricCode,
  scopeCode: metricCode.startsWith("BUSINESS")
    ? "SCOPE_3"
    : metricCode === "GRID_ELECTRICITY"
      ? "SCOPE_2"
      : "SCOPE_1",
  approvedT: t,
  approvedCount: t > 0 ? 1 : 0,
  pendingCount: 0,
  notCalculatedCount: 0,
  ...extra,
});

test("months of a financial year are named from April", () => {
  assert.equal(monthsLabel([0, 1, 2, 3, 4, 5]), "Apr–Sep");
  assert.equal(monthsLabel([0, 2]), "Apr, Jun");
  assert.equal(monthsLabel(Array.from({ length: 12 }, (_, i) => i)), "the full year");
});

test("a complete year is compared in full, an incomplete one only on the months both have", () => {
  const periods = months(2024, 2);
  const rows = periods.flatMap((p) => {
    const fy25 = p.startDate >= "2025-04-01";
    // FY 2025-26 has only April-June approved, at double the rate.
    if (fy25 && p.startDate >= "2025-07-01") return [];
    return [row(p.id, "DIESEL_CONSUMPTION", fy25 ? 20 : 10)];
  });
  const trends = buildTrends({ periods, rows, gaps: [], today: "2026-05-01" });
  assert.equal(trends.years.length, 2);
  const [y24, y25] = trends.years;
  assert.equal(y24.complete, true);
  assert.equal(y24.total, 120);
  assert.equal(y25.complete, false);
  assert.match(y25.notes.join(" "), /3 of 12 months \(Apr–Jun\)/);
  assert.equal(y25.change.kind, "same_months");
  if (y25.change.kind === "same_months") {
    assert.deepEqual(y25.change.months, [0, 1, 2]);
    assert.equal(y25.change.current, 60);
    assert.equal(y25.change.previous, 30);
    assert.equal(y25.change.changePct, 100);
  }
});

test("awaiting, uncalculated and missing submissions are named and never counted as zero", () => {
  const periods = months(2024, 1);
  const rows = periods.map((p, i) =>
    row(p.id, "GRID_ELECTRICITY", 5, i === 0 ? { pendingCount: 2, notCalculatedCount: 1 } : {}),
  );
  const trends = buildTrends({
    periods,
    rows,
    gaps: [{ periodId: periods[3].id, missingExpected: 4 }],
    today: "2025-06-01",
  });
  const [y] = trends.years;
  assert.equal(y.complete, false);
  assert.equal(y.total, 60);
  const notes = y.notes.join(" ");
  assert.match(notes, /2 record\(s\) awaiting approval/);
  assert.match(notes, /1 record\(s\) could not be calculated/);
  assert.match(notes, /4 expected submission\(s\)/);
});

test("no months in common means no comparison", () => {
  const a = { monthly: new Map([[0, 5]]), annual: null, total: 5 };
  const b = { monthly: new Map([[6, 5]]), annual: null, total: 5 };
  assert.equal(compare(a, b, false).kind, "none");
});

test("rising business travel gives a travel-policy suggestion with its figures", () => {
  const periods = months(2024, 2);
  const rows = periods.flatMap((p) => [
    row(p.id, "BUSINESS_TRAVEL_AIR", p.startDate >= "2025-04-01" ? 3 : 2),
    row(p.id, "GRID_ELECTRICITY", 10),
  ]);
  const recs = recommend({ periods, rows, completeYears: new Set([2024, 2025]) });
  const travel = recs.find((r) => r.id === "business_travel");
  assert.ok(travel, JSON.stringify(recs.map((r) => r.id)));
  assert.deepEqual(travel.triggers, ["rising"]);
  assert.equal(travel.priority, "high");
  assert.match(travel.reason, /36 tCO2e in FY 2025-26, up 50% from 24 tCO2e in FY 2024-25/);
  assert.match(travel.policy, /travel policy/i);
  assert.equal(travel.evidence.periods.length, 24);
  // Grid electricity is flat: not rising, but it is the largest source.
  const grid = recs.find((r) => r.id === "grid_electricity");
  assert.deepEqual(grid?.triggers, ["largest"]);
  assert.equal(grid?.priority, "low");
  // One suggestion per activity group.
  assert.equal(new Set(recs.map((r) => r.id)).size, recs.length);
});

test("one unusually high month is a spike; small or flat data suggests nothing", () => {
  const periods = months(2025, 1);
  const rows = periods.map((p, i) => row(p.id, "REFRIGERANT_R32", i === 5 ? 12 : 4));
  const recs = recommend({ periods, rows, completeYears: new Set() });
  const spike = recs.find((r) => r.id === "refrigerants");
  assert.ok(spike);
  assert.deepEqual(spike.triggers, ["spike"]);
  assert.match(spike.title, /emissions were unusually high in Sep 2025/);
  assert.match(spike.reason, /^Refrigerant and SF6 top-ups emissions in Sep 2025 were 12 tCO2e/);
  assert.match(spike.reason, /3\.0 times the usual month/);
  assert.ok(spike.caveats.some((c) => /not complete/.test(c)));

  const flat = periods.map((p) => row(p.id, "BUSINESS_TRAVEL_AIR", 0.1));
  const few = recommend({
    periods,
    rows: [...flat, ...periods.map((p) => row(p.id, "GRID_ELECTRICITY", 10))],
    completeYears: new Set(),
  });
  assert.ok(!few.some((r) => r.groupKey === "business_travel"));
});

test("settings out of range fall back to the defaults", () => {
  assert.deepEqual(readAlertSettings(null), DEFAULT_ALERT_SETTINGS);
  const s = readAlertSettings({
    enabled: false,
    thresholdPct: { SCOPE_1: 35, SCOPE_2: -4 },
    lookbackDays: 9999,
  });
  assert.equal(s.enabled, false);
  assert.equal(s.thresholdPct.SCOPE_1, 35);
  assert.equal(s.thresholdPct.SCOPE_2, 20);
  assert.equal(s.lookbackDays, 180);
});

function figures(
  periods: PeriodInfo[],
  value: (p: PeriodInfo) => number,
  extra: Partial<UnitPeriodScope> = {},
) {
  return periods.map((p): UnitPeriodScope => ({
    orgUnitId: "u1",
    periodId: p.id,
    scopeCode: "SCOPE_2",
    approvedT: value(p),
    approvedCount: 1,
    pendingCount: 0,
    notCalculatedCount: 0,
    missingExpected: 0,
    ...extra,
  }));
}

test("an alert compares a month with the same month of earlier years", () => {
  const periods = months(2023, 3);
  // Every July is high (season); only July 2025 is far above earlier Julys.
  const value = (p: PeriodInfo) =>
    p.startDate === "2025-07-01" ? 30 : p.startDate.slice(5, 7) === "07" ? 20 : 10;
  const found = findAlerts({
    periods,
    figures: figures(periods, value),
    settings: DEFAULT_ALERT_SETTINGS,
    today: "2025-10-15",
  });
  assert.equal(found.length, 1);
  const [a] = found;
  assert.equal(a.periodId, "p-2025-07");
  assert.equal(a.baselineT, 20);
  assert.equal(a.measuredT, 30);
  assert.deepEqual(
    a.baselinePeriods.map((b) => b.periodId),
    ["p-2024-07", "p-2023-07"],
  );
});

test("no alert when the period or its baseline is incomplete, too old, open, or within the threshold", () => {
  const periods = months(2023, 3);
  const high = (p: PeriodInfo) => (p.startDate === "2025-07-01" ? 30 : 10);
  const run = (
    figs: UnitPeriodScope[],
    over: Partial<{ today: string; periods: PeriodInfo[] }> = {},
  ) =>
    findAlerts({
      periods: over.periods ?? periods,
      figures: figs,
      settings: DEFAULT_ALERT_SETTINGS,
      today: over.today ?? "2025-10-15",
    });

  assert.equal(run(figures(periods, high)).length, 1);
  // Something awaiting approval in the month itself.
  assert.equal(
    run(
      figures(periods, high).map((f) =>
        f.periodId === "p-2025-07" ? { ...f, pendingCount: 1 } : f,
      ),
    ).length,
    0,
  );
  // An expected submission missing.
  assert.equal(
    run(
      figures(periods, high).map((f) =>
        f.periodId === "p-2025-07" ? { ...f, missingExpected: 1 } : f,
      ),
    ).length,
    0,
  );
  // Only one earlier July is complete.
  assert.equal(
    run(
      figures(periods, high).map((f) =>
        f.periodId === "p-2023-07" ? { ...f, notCalculatedCount: 2 } : f,
      ),
    ).length,
    0,
  );
  // More than 180 days after the period ended.
  assert.equal(run(figures(periods, high), { today: "2026-03-01" }).length, 0);
  // The period is still open.
  assert.equal(
    run(figures(periods, high), {
      periods: periods.map((p) => (p.id === "p-2025-07" ? { ...p, status: "open" } : p)),
    }).length,
    0,
  );
  // 11 against 10 is within 20%.
  assert.equal(run(figures(periods, (p) => (p.startDate === "2025-07-01" ? 11.9 : 10))).length, 0);
  // Switched off.
  assert.equal(
    findAlerts({
      periods,
      figures: figures(periods, high),
      settings: { ...DEFAULT_ALERT_SETTINGS, enabled: false },
      today: "2025-10-15",
    }).length,
    0,
  );
});

test("AI wording with a figure that was not given is refused", () => {
  const periods = months(2024, 2);
  const rows = periods.map((p) =>
    row(p.id, "BUSINESS_TRAVEL_AIR", p.startDate >= "2025-04-01" ? 3 : 2),
  );
  const [rec] = recommend({ periods, rows, completeYears: new Set([2024, 2025]) });
  assert.ok(rec);
  assert.deepEqual(numbersIn("up 1,234.5 tCO2e and 38%"), [1234.5, 2, 38]);
  const good =
    "Business travel emissions rose to 36 tCO2e in FY 2025-26, up 50% on the year before. Air travel carries the " +
    "highest emissions per kilometre, so a travel policy that prefers rail would help. Start by reviewing who flew and why.";
  assert.equal(checkWording(good, rec).ok, true);
  const invented = good.replace("Start by", "This could save 12 tCO2e. Start by");
  assert.deepEqual(checkWording(invented, rec), { ok: false, reason: "new figures" });
  // A number it was given, but with another unit, is refused; a year next to a word is not a tonnage.
  const swapped = good.replace("up 50% on", "up 36% on");
  assert.deepEqual(checkWording(swapped, rec), { ok: false, reason: "new figures" });
  const yearThenWord = `${good} FY 2025-26 then shows the change.`;
  assert.equal(checkWording(yearThenWord, rec).ok, true);
  assert.equal(checkWording("ok", rec).ok, false);
  assert.equal(
    checkWording("## Heading\n- a list of things that is quite long enough to pass", rec).ok,
    false,
  );
  // The model sees the suggestion, not the org unit or any person.
  assert.doesNotMatch(String(wordingMessages(rec)[1].content), /orgUnit|@/);
});
