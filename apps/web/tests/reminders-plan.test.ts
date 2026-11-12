import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ESCALATION,
  DEFAULT_SCHEDULE,
  daysBetween,
  planReminders,
  readEscalation,
  levelsOf,
  readSchedule,
  type MissingItem,
  type Schedule,
} from "../lib/reminders/plan.ts";

const asha = { userId: "u-asha", name: "Asha", email: "asha@x.test" };
const ravi = { userId: "u-ravi", name: "Ravi", email: "ravi@x.test" };
const admin = { userId: "u-admin", name: "Olectra Admin", email: "oa@x.test" };
const superAdmin = { userId: "u-super", name: "Super", email: "s@x.test" };
const item = (over: Partial<MissingItem>): MissingItem => ({
  status: "missing",
  periodId: "sep",
  periodName: "September 2026",
  dueDate: "2026-10-15",
  orgUnitId: "ev",
  orgUnitName: "EV project",
  metricName: "Diesel",
  owners: [asha],
  adminLevels: [],
  ...over,
});
const plan = (today: string, missing: MissingItem[], schedule: Schedule = DEFAULT_SCHEDULE) =>
  planReminders({
    today,
    schedule,
    pending: missing,
    overseers: [
      { ...admin, unitIds: new Set(["ev", "depot"]) },
      { ...superAdmin, unitIds: "all" },
    ],
    superAdminIds: new Set(["u-super"]),
  });

test("days are counted on the calendar", () => {
  assert.equal(daysBetween("2026-10-08", "2026-10-15"), 7);
  assert.equal(daysBetween("2026-10-15", "2026-10-15"), 0);
  assert.equal(daysBetween("2026-10-16", "2026-10-15"), -1);
});

test("each schedule day: from 14 days out, email on 14, 7, 3 and the day itself", () => {
  const channels = (today: string) =>
    plan(today, [item({})])
      .find((m) => m.kind === "owner")
      ?.channels.join("+") ?? "none";
  assert.equal(channels("2026-09-30"), "none", "15 days before: not yet");
  assert.equal(channels("2026-10-01"), "in_app+email", "14");
  assert.equal(channels("2026-10-02"), "none", "13: not a schedule day");
  assert.equal(channels("2026-10-05"), "in_app", "10");
  assert.equal(channels("2026-10-08"), "in_app+email", "7");
  assert.equal(channels("2026-10-10"), "in_app", "5");
  assert.equal(channels("2026-10-12"), "in_app+email", "3");
  assert.equal(channels("2026-10-13"), "in_app", "2");
  assert.equal(channels("2026-10-14"), "in_app", "1");
  assert.equal(channels("2026-10-15"), "in_app+email", "the due date");
});

test("one message per owner, listing everything of theirs that is missing", () => {
  const messages = plan("2026-10-12", [
    item({ metricName: "Diesel" }),
    item({ metricName: "Grid electricity", owners: [asha, ravi] }),
  ]);
  const toAsha = messages.filter((m) => m.kind === "owner" && m.recipient.userId === "u-asha");
  assert.equal(toAsha.length, 1);
  assert.deepEqual(toAsha[0].lines, ["Diesel — EV project", "Grid electricity — EV project"]);
  assert.match(toAsha[0].title, /2 submissions due in 3 days for September 2026/);
  assert.equal(messages.filter((m) => m.recipient.userId === "u-ravi")[0].missingCount, 1);
});

test("Administrators get a summary of their units only; Super Admins on email days only", () => {
  const missing = [
    item({ orgUnitId: "ev", orgUnitName: "EV project" }),
    item({ orgUnitId: "depot", orgUnitName: "Depot", metricName: "Water" }),
    item({ orgUnitId: "evey", orgUnitName: "EVEY", metricName: "Coal" }),
  ];
  const emailDay = plan("2026-10-12", missing);
  const digest = emailDay.find((m) => m.kind === "digest" && m.recipient.userId === "u-admin")!;
  assert.equal(digest.missingCount, 2, "not EVEY, which is not theirs");
  assert.deepEqual(digest.lines, [
    "Depot: 1 not started (Asha)",
    "EV project: 1 not started (Asha)",
  ]);
  const groupSummary = emailDay.find((m) => m.recipient.userId === "u-super");
  assert.equal(groupSummary?.missingCount, 3);
  const inAppDay = plan("2026-10-13", missing);
  assert.ok(
    inAppDay.some((m) => m.recipient.userId === "u-admin"),
    "Administrators daily",
  );
  assert.ok(
    !inAppDay.some((m) => m.recipient.userId === "u-super"),
    "Super Admins not on in-app days",
  );
});

test("nothing missing, nothing sent", () => {
  assert.deepEqual(plan("2026-10-12", []), []);
});

test("a saved schedule is read defensively", () => {
  assert.deepEqual(readSchedule(null), DEFAULT_SCHEDULE);
  assert.deepEqual(readSchedule({ days: [] }), DEFAULT_SCHEDULE);
  const custom = readSchedule({
    days: [
      { before: 10, email: true },
      { before: 10, email: false },
      { before: -1, email: true },
      "x",
    ],
  });
  assert.deepEqual(custom.days, [{ before: 10, email: false }]);
  assert.deepEqual(custom.escalation, DEFAULT_ESCALATION, "no escalation saved: the default climb");
});

test("Administrators at the same distance from a unit are one level, nearest level first", () => {
  assert.deepEqual(
    levelsOf([
      { depth: 0, person: projAdmin },
      { depth: 1, person: subAdmin },
      { depth: 1, person: asha },
      { depth: 3, person: ravi },
    ]),
    [[projAdmin], [subAdmin, asha], [ravi]],
  );
  assert.deepEqual(levelsOf([]), []);
});

test("the climb's days are read defensively and must climb", () => {
  assert.deepEqual(readEscalation(null), DEFAULT_ESCALATION);
  assert.deepEqual(readEscalation({ unitAdminAfter: 2, parentAdminAfter: 4, superAdminAfter: 9 }), {
    unitAdminAfter: 2,
    parentAdminAfter: 4,
    superAdminAfter: 9,
  });
  assert.deepEqual(
    readEscalation({ unitAdminAfter: 5, parentAdminAfter: 3, superAdminAfter: 9 }),
    DEFAULT_ESCALATION,
    "out of order",
  );
  assert.deepEqual(
    readEscalation({ unitAdminAfter: 0, parentAdminAfter: 3, superAdminAfter: 9 }),
    DEFAULT_ESCALATION,
    "day 0 is not after the due date",
  );
});

// Overdue: the alert climbs one step at a time (owner's decision of 2026-11-13). Due date 15 October.
const projAdmin = { userId: "u-pa", name: "Project Admin", email: "pa@x.test" };
const subAdmin = { userId: "u-sa", name: "Subsidiary Admin", email: "sa@x.test" };
const overdue = (today: string, schedule: Schedule = DEFAULT_SCHEDULE) =>
  plan(
    today,
    [
      // A project whose own Administrator and the subsidiary's can both be told.
      item({ orgUnitId: "ev", orgUnitName: "EV project", adminLevels: [[projAdmin], [subAdmin]] }),
      // A project with no Administrator of its own: the subsidiary's is the first to be told.
      item({
        orgUnitId: "depot",
        orgUnitName: "Depot",
        metricName: "Water",
        owners: [ravi],
        adminLevels: [[subAdmin]],
      }),
      // Nobody administers it below the group: only the Super Admins ever hear.
      item({
        orgUnitId: "lone",
        orgUnitName: "Lone site",
        metricName: "Coal",
        owners: [],
        adminLevels: [],
      }),
    ],
    schedule,
  );
const told = (messages: ReturnType<typeof overdue>, kind: "escalation" | "owner") =>
  new Map(messages.filter((m) => m.kind === kind).map((m) => [m.recipient.userId, m]));

test("1 day late: the owners, and the nearest Administrator of each unit", () => {
  const messages = overdue("2026-10-16");
  const owners = told(messages, "owner");
  assert.equal(owners.get("u-asha")?.channels.join("+"), "in_app+email");
  assert.match(owners.get("u-asha")!.title, /1 submission overdue for September 2026, 1 day late/);
  const climb = told(messages, "escalation");
  assert.deepEqual(climb.get("u-pa")?.lines, ["Diesel — EV project · owner: Asha"]);
  assert.deepEqual(
    climb.get("u-sa")?.lines,
    ["Water — Depot · owner: Ravi"],
    "Depot only: no project Administrator",
  );
  assert.ok(!climb.has("u-super"), "not yet");
  assert.equal(climb.get("u-pa")?.daysBefore, -1);
});

test("2 days late: only the owners, in the app", () => {
  const messages = overdue("2026-10-17");
  assert.equal(told(messages, "owner").get("u-asha")?.channels.join("+"), "in_app");
  assert.equal(told(messages, "escalation").size, 0);
});

test("3 days late: the next Administrator up joins, the ones below stay told", () => {
  const climb = told(overdue("2026-10-18"), "escalation");
  assert.deepEqual(climb.get("u-pa")?.lines, ["Diesel — EV project · owner: Asha"]);
  assert.deepEqual(climb.get("u-sa")?.lines, [
    "Water — Depot · owner: Ravi",
    "Diesel — EV project · owner: Asha",
  ]);
  assert.ok(!climb.has("u-super"));
});

test("7 days late: the Super Admins hear of everything, including a unit nobody administers", () => {
  const climb = told(overdue("2026-10-22"), "escalation");
  assert.deepEqual(climb.get("u-super")?.lines, [
    "Water — Depot · owner: Ravi",
    "Diesel — EV project · owner: Asha",
    "Coal — Lone site · owner: no one assigned",
  ]);
  assert.equal(climb.get("u-super")?.channels.join("+"), "in_app+email");
  assert.ok(climb.has("u-pa") && climb.has("u-sa"));
});

test("the HR, EHS and Procurement owners are owners of their own items only, never part of the climb", () => {
  const messages = overdue("2026-10-22");
  const toRavi = messages.filter((m) => m.recipient.userId === "u-ravi");
  assert.deepEqual(
    toRavi.map((m) => m.kind),
    ["owner"],
    "Ravi owns Water: reminded, not escalated to",
  );
  assert.deepEqual(toRavi[0].lines, ["Water — Depot"]);
});

test("the climb's days follow the schedule", () => {
  const custom: Schedule = {
    ...DEFAULT_SCHEDULE,
    escalation: { unitAdminAfter: 2, parentAdminAfter: 4, superAdminAfter: 9 },
  };
  assert.equal(told(overdue("2026-10-16", custom), "escalation").size, 0, "1 day late: too early");
  assert.ok(told(overdue("2026-10-17", custom), "escalation").has("u-pa"), "2 days late");
  assert.ok(told(overdue("2026-10-24", custom), "escalation").has("u-super"), "9 days late");
});

test("an Administrator of two levels of one item hears of it once", () => {
  const messages = plan("2026-10-18", [
    item({ adminLevels: [[projAdmin], [projAdmin, subAdmin]] }),
  ]).filter((m) => m.kind === "escalation" && m.recipient.userId === "u-pa");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].missingCount, 1);
});

test("the summary says, unit by unit, who is behind and how many more are on file but not approved", () => {
  const messages = plan("2026-10-12", [
    item({ metricName: "Diesel", owners: [asha] }),
    item({ metricName: "Grid electricity", owners: [asha, ravi] }),
    item({ metricName: "Petrol", status: "validated" }),
    item({ metricName: "LPG", status: "draft" }),
  ]);
  const digest = messages.find((m) => m.kind === "digest" && m.recipient.userId === "u-admin")!;
  assert.deepEqual(digest.lines, [
    "EV project: 2 not started, 2 on file, not approved (Asha, Ravi)",
  ]);
  assert.equal(digest.missingCount, 2, "only what is not started is counted as missing");
  assert.ok(
    !messages.some((m) => m.kind === "owner" && m.lines.some((l) => l.startsWith("Petrol"))),
    "an item already on file is not the owner's to chase",
  );
});

test("on file but not approved is no reason for a summary before the due date", () => {
  assert.deepEqual(
    plan("2026-10-12", [item({ status: "validated" }), item({ status: "draft" })]),
    [],
  );
});

test("past the due date, what is stuck on file climbs too, with where it is stuck, but its owner is not nagged", () => {
  const stuck = [
    item({
      metricName: "Diesel",
      status: "validated",
      owners: [asha],
      adminLevels: [[projAdmin], [subAdmin]],
    }),
    item({
      metricName: "Petrol",
      status: "user_verified",
      owners: [asha],
      adminLevels: [[projAdmin], [subAdmin]],
    }),
    item({
      metricName: "Coal",
      status: "draft",
      owners: [ravi],
      adminLevels: [[projAdmin], [subAdmin]],
    }),
  ];
  const day1 = plan("2026-10-16", stuck);
  assert.ok(!day1.some((m) => m.kind === "owner"), "the owners have done their part");
  const toAdmin = day1.find((m) => m.kind === "escalation" && m.recipient.userId === "u-pa")!;
  assert.deepEqual(toAdmin.lines, [
    "Coal — EV project · uploaded, not yet verified · owner: Ravi",
    "Diesel — EV project · awaiting approval · owner: Asha",
    "Petrol — EV project · verified, under review · owner: Asha",
  ]);
  assert.equal(toAdmin.missingCount, 3);
  assert.ok(!day1.some((m) => m.recipient.userId === "u-sa"), "the next one up joins on day 3");
});
