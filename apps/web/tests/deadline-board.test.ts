import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBoard, type BoardTask, type BoardUnit } from "../lib/deadlines/board.ts";

const unit = (id: string, name: string, parentId: string | null, order: number): BoardUnit => ({
  id,
  name,
  parentId,
  levelLabel: ["Group", "Subsidiary", "Project"][order],
  levelOrder: order,
});
const group = unit("g", "MEIL", null, 0);
const sub = unit("s", "Olectra", "g", 1);
const projA = unit("a", "BEST Mumbai", "s", 2);
const projB = unit("b", "MSRTC", "s", 2);
const idle = unit("i", "Idle depot", "s", 2);
const other = unit("o", "EVEY", "g", 1);

const asha = { userId: "u1", displayName: "Asha", email: "a@x", roleName: "Project Manager" };
const ravi = { userId: "u2", displayName: "Ravi", email: "r@x", roleName: "HR" };
const task = ({
  id,
  ...over
}: Partial<BoardTask> & { id: string; orgUnitId: string }): BoardTask => ({
  expectationId: id,
  metricName: "Diesel",
  categoryName: "Scope 1",
  submissionStatus: "missing",
  daysOverdue: 0,
  assignedOwners: [asha],
  ...over,
});
const tasks = [
  task({ id: "1", orgUnitId: "a", submissionStatus: "approved" }),
  task({
    id: "2",
    orgUnitId: "a",
    metricName: "Grid",
    submissionStatus: "validated",
    daysOverdue: 2,
  }),
  task({
    id: "3",
    orgUnitId: "b",
    metricName: "Workforce",
    assignedOwners: [ravi],
    daysOverdue: 2,
  }),
  task({ id: "4", orgUnitId: "b", metricName: "Water", assignedOwners: [], daysOverdue: 0 }),
  task({ id: "5", orgUnitId: "o", submissionStatus: "approved" }),
];

test("every unit shows its own figures and everything beneath it", () => {
  const rows = buildBoard([group, sub, projA, projB, idle, other], tasks);
  const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
  assert.deepEqual(
    rows.map((r) => [r.name, r.depth]),
    [
      ["MEIL", 0],
      ["EVEY", 1],
      ["Olectra", 1],
      ["BEST Mumbai", 2],
      ["MSRTC", 2],
    ],
  );
  assert.deepEqual(
    [
      byName.Olectra.total,
      byName.Olectra.approved,
      byName.Olectra.inProgress,
      byName.Olectra.missing,
    ],
    [4, 1, 1, 2],
  );
  assert.equal(byName.MEIL.total, 5, "the group counts both subsidiaries");
  assert.equal(byName.MEIL.approved, 2);
});

test("overdue counts what is missing or stuck past the due date, never what is approved", () => {
  const rows = buildBoard([group, sub, projA, projB, idle, other], tasks);
  assert.equal(rows.find((r) => r.name === "BEST Mumbai")?.overdue, 1);
  assert.equal(rows.find((r) => r.name === "Olectra")?.overdue, 2);
});

test("who is behind: the owners of what is not started, here and beneath", () => {
  const rows = buildBoard([group, sub, projA, projB, idle, other], tasks);
  assert.deepEqual(rows.find((r) => r.name === "MSRTC")?.behind, ["Ravi"]);
  assert.deepEqual(
    rows.find((r) => r.name === "BEST Mumbai")?.behind,
    [],
    "its stuck one is on file",
  );
  assert.deepEqual(rows.find((r) => r.name === "Olectra")?.behind, ["Ravi"]);
});

test("a unit's own items list what is not approved first, the longest late first", () => {
  const rows = buildBoard([group, sub, projA, projB], tasks);
  assert.deepEqual(
    rows.find((r) => r.name === "BEST Mumbai")?.items.map((i) => [i.metric, i.status, i.daysLate]),
    [
      ["Grid", "validated", 2],
      ["Diesel", "approved", 0],
    ],
  );
  assert.deepEqual(
    rows.find((r) => r.name === "MSRTC")?.items.map((i) => i.metric),
    ["Workforce", "Water"],
  );
  assert.deepEqual(rows.find((r) => r.name === "MSRTC")?.items[1].owners, []);
});

test("an Administrator sees only the units they oversee, the top of which is the first row", () => {
  const rows = buildBoard(
    [sub, projA, projB, idle],
    tasks.filter((t) => t.orgUnitId !== "o"),
  );
  assert.deepEqual(
    rows.map((r) => [r.name, r.depth]),
    [
      ["Olectra", 0],
      ["BEST Mumbai", 1],
      ["MSRTC", 1],
    ],
  );
  assert.equal(rows[0].total, 4);
});

test("nothing expected, no rows", () => {
  assert.deepEqual(buildBoard([group, sub], []), []);
});
