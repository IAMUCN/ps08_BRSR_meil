import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SCHEDULE,
  daysBetween,
  planReminders,
  readSchedule,
  type MissingItem,
} from "../lib/reminders/plan.ts";

const asha = { userId: "u-asha", name: "Asha", email: "asha@x.test" };
const ravi = { userId: "u-ravi", name: "Ravi", email: "ravi@x.test" };
const admin = { userId: "u-admin", name: "Olectra Admin", email: "oa@x.test" };
const superAdmin = { userId: "u-super", name: "Super", email: "s@x.test" };
const item = (over: Partial<MissingItem>): MissingItem => ({
  periodId: "sep",
  periodName: "September 2026",
  dueDate: "2026-10-15",
  orgUnitId: "ev",
  orgUnitName: "EV project",
  metricName: "Diesel",
  owners: [asha],
  ...over,
});
const plan = (today: string, missing: MissingItem[]) =>
  planReminders({
    today,
    schedule: DEFAULT_SCHEDULE,
    missing,
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

test("each schedule day: in-app daily in the last week, email on 7, 5, 3 and the day itself", () => {
  const channels = (today: string) =>
    plan(today, [item({})])
      .find((m) => m.kind === "owner")
      ?.channels.join("+") ?? "none";
  assert.equal(channels("2026-10-07"), "none", "8 days before: not yet");
  assert.equal(channels("2026-10-08"), "in_app+email", "7");
  assert.equal(channels("2026-10-09"), "in_app", "6");
  assert.equal(channels("2026-10-10"), "in_app+email", "5");
  assert.equal(channels("2026-10-11"), "in_app", "4");
  assert.equal(channels("2026-10-12"), "in_app+email", "3");
  assert.equal(channels("2026-10-13"), "in_app", "2");
  assert.equal(channels("2026-10-14"), "in_app", "1");
  assert.equal(channels("2026-10-15"), "in_app+email", "the due date");
  assert.equal(
    channels("2026-10-16"),
    "none",
    "after the due date: the overdue escalations take over",
  );
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
  assert.deepEqual(digest.lines, ["Depot: 1 missing", "EV project: 1 missing"]);
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
});
