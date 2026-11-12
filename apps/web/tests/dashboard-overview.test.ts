import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emissionFigures,
  hierarchyRows,
  isComplete,
  levelRings,
  percent,
  type EmissionRow,
  type UnitRow,
} from "../lib/dashboard/overview.ts";

const u = (
  id: string,
  parent: string | null,
  level: string,
  order: number,
  expected: number,
  approved: number,
): UnitRow => ({
  id,
  name: id.toUpperCase(),
  parent_id: parent,
  level,
  level_label: level[0].toUpperCase() + level.slice(1),
  level_order: order,
  expected,
  approved,
});

//   g ── s1 ── p1 (done)      g: 6 expected, 3 approved
//     └─ s2 ── p2 (half)      s1: 2/2, s2: 4/1 ... p2 has nothing of its own beyond s2's 4 (expected 4, approved 1)
const units = [
  u("g", null, "group", 1, 6, 3),
  u("s1", "g", "subsidiary", 2, 2, 2),
  u("s2", "g", "subsidiary", 2, 4, 1),
  u("p1", "s1", "project", 3, 2, 2),
  u("p2", "s2", "project", 3, 4, 1),
  u("p3", "s2", "project", 3, 0, 0),
];

test("a unit is finished only when something is expected and all of it is approved", () => {
  assert.equal(isComplete({ expected: 2, approved: 2 }), true);
  assert.equal(isComplete({ expected: 2, approved: 1 }), false);
  assert.equal(isComplete({ expected: 0, approved: 0 }), false);
});

test("percent: nothing expected is null, never 0 or 100", () => {
  assert.equal(percent(0, 0), null);
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(2, 2), 100);
});

test("levelRings: per level, shallowest first, units with nothing expected are not counted", () => {
  const rings = levelRings(units);
  assert.deepEqual(
    rings.map((r) => [r.label, r.done, r.total, r.pct]),
    [
      ["Group", 0, 1, 0],
      ["Subsidiary", 1, 2, 50],
      ["Project", 1, 2, 50],
    ],
  );
  assert.deepEqual(levelRings([]), []);
});

test("hierarchyRows: roots then their direct units; the limit says how many were left out", () => {
  const { rows, more } = hierarchyRows(units, ["g"], 10);
  assert.deepEqual(
    rows.map((r) => [r.id, r.depth]),
    [
      ["g", 0],
      ["s1", 1],
      ["s2", 1],
    ],
  );
  assert.equal(more, 0);
  assert.equal(rows[0].pct, 50);
  const cut = hierarchyRows(units, ["g"], 2);
  assert.equal(cut.rows.length, 2);
  assert.equal(cut.more, 1);
  assert.deepEqual(hierarchyRows(units, ["missing"]).rows, []);
});

const em = (scope: string, period: string, start: string, tonnes: number | null): EmissionRow => ({
  scope_code: scope,
  period_id: period,
  label: period.toUpperCase(),
  start_date: start,
  tonnes,
});

test("emissionFigures: the selected period split by scope, a trend of the latest periods, oldest first", () => {
  const rows = [
    em("SCOPE_1", "p1", "2026-01-01", 10),
    em("SCOPE_2", "p1", "2026-01-01", 5),
    em("SCOPE_1", "p2", "2026-02-01", 20),
    em("SCOPE_3", "p2", "2026-02-01", 4),
    em("SCOPE_2", "p2", "2026-02-01", null),
  ];
  const sel = emissionFigures(rows, "p2");
  assert.deepEqual(
    sel.slices.map((s) => [s.key, s.value]),
    [
      ["SCOPE_1", 20],
      ["SCOPE_2", 0],
      ["SCOPE_3", 4],
    ],
  );
  assert.equal(sel.total, 24);
  assert.deepEqual(sel.trend, { categories: ["P1", "P2"], values: [15, 24] });
  // No period chosen: the latest period with data.
  assert.equal(emissionFigures(rows, null).total, 24);
  // Only the last `count` periods are kept.
  assert.deepEqual(emissionFigures(rows, "p2", 1).trend.categories, ["P2"]);
  assert.equal(emissionFigures([], null).total, 0);
});

import {
  areaCounts,
  certificateState,
  fyStartYear,
  parseCertificateDate,
} from "../lib/dashboard/overview.ts";

test("fyStartYear: April to March", () => {
  assert.equal(fyStartYear("2026-04-01"), 2026);
  assert.equal(fyStartYear("2026-03-31"), 2025);
  assert.equal(fyStartYear("2026-11-12"), 2026);
});

test("parseCertificateDate: common printed forms, impossible dates refused", () => {
  assert.equal(parseCertificateDate("2026-03-31"), "2026-03-31");
  assert.equal(parseCertificateDate("31/03/2026"), "2026-03-31");
  assert.equal(parseCertificateDate("1-4-2026"), "2026-04-01");
  assert.equal(parseCertificateDate("31.03.2026"), "2026-03-31");
  assert.equal(parseCertificateDate("31/02/2026"), null);
  assert.equal(parseCertificateDate("March 2026"), null);
  assert.equal(parseCertificateDate(null), null);
  assert.equal(parseCertificateDate(""), null);
});

test("certificateState: expired, expiring within the window, valid, unreadable", () => {
  const today = "2026-11-12";
  assert.deepEqual(certificateState("2026-11-11", today), { state: "expired", days: -1 });
  assert.deepEqual(certificateState("2026-11-12", today), { state: "expiring", days: 0 });
  assert.deepEqual(certificateState("2027-01-11", today), { state: "expiring", days: 60 });
  assert.deepEqual(certificateState("2027-01-12", today), { state: "valid", days: 61 });
  assert.deepEqual(certificateState("soon", today), { state: "unreadable", days: null });
  assert.equal(certificateState("2027-01-12", today, 90).state, "expiring");
});

test("areaCounts: tabs grouped for the donut, rejected left out, every group present", () => {
  const got = areaCounts([
    "approved",
    "approved",
    "processing",
    "validated",
    "rejected",
    "returned",
  ]);
  assert.deepEqual(
    got.map((g) => [g.key, g.value]),
    [
      ["approved", 2],
      ["pending_approval", 0],
      ["needs_verification", 0],
      ["returned", 1],
      ["in_progress", 2],
    ],
  );
});
