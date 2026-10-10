import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateDaysRemaining,
  calculateDeadlineKPIs,
  evaluateDeadlineStatus,
  formatDateInTimezone,
} from "../lib/deadlines/engine.ts";
import type { DeadlineStatus } from "../lib/deadlines/types.ts";

test("formatDateInTimezone formats dates consistently in target timezones", () => {
  // 2026-10-11T00:30:00+05:30 is 2026-10-10T19:00:00Z
  const dateUtc = new Date("2026-10-10T19:00:00Z");
  assert.equal(formatDateInTimezone(dateUtc, "Asia/Kolkata"), "2026-10-11");
  assert.equal(formatDateInTimezone(dateUtc, "UTC"), "2026-10-10");
});

test("calculateDaysRemaining calculates calendar days accurately", () => {
  // Reference date: 2026-10-11 in Asia/Kolkata
  const refDate = new Date("2026-10-11T10:00:00+05:30");

  // Future dates
  assert.equal(calculateDaysRemaining("2026-10-21", refDate), 10);
  assert.equal(calculateDaysRemaining("2026-10-18", refDate), 7);
  assert.equal(calculateDaysRemaining("2026-10-14", refDate), 3);
  assert.equal(calculateDaysRemaining("2026-10-12", refDate), 1);

  // Due today
  assert.equal(calculateDaysRemaining("2026-10-11", refDate), 0);

  // Past due
  assert.equal(calculateDaysRemaining("2026-10-10", refDate), -1);
  assert.equal(calculateDaysRemaining("2026-10-08", refDate), -3);
  assert.equal(calculateDaysRemaining("2026-10-04", refDate), -7);
});

test("calculateDaysRemaining handles month and leap year boundaries", () => {
  // Leap year 2028: Feb 28 to Feb 29
  const feb28 = new Date("2028-02-28T12:00:00Z");
  assert.equal(calculateDaysRemaining("2028-02-29", feb28, "UTC"), 1);

  // Feb 28 to Mar 1 in leap year 2028 (2 days)
  assert.equal(calculateDaysRemaining("2028-03-01", feb28, "UTC"), 2);

  // Year boundary: Dec 31 to Jan 1
  const dec31 = new Date("2026-12-31T12:00:00Z");
  assert.equal(calculateDaysRemaining("2027-01-01", dec31, "UTC"), 1);

  // Gracefully handles invalid dates
  assert.equal(calculateDaysRemaining("", dec31, "UTC"), 0);
  assert.equal(calculateDaysRemaining("invalid-date", dec31, "UTC"), 0);
});

test("evaluateDeadlineStatus: completed workflows always take highest precedence", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");

  // Even if overdue by 20 days, completed tasks must not be overdue or escalated
  const resPast = evaluateDeadlineStatus({
    dueDate: "2026-09-20",
    isCompleted: true,
    referenceDate: refDate,
  });
  assert.equal(resPast.status, "completed");
  assert.equal(resPast.escalationLevel, 0);
  assert.equal(resPast.daysOverdue, 0);
  assert.equal(resPast.eligibleReminderStage, "none");

  // Future completed tasks are also completed
  const resFuture = evaluateDeadlineStatus({
    dueDate: "2026-10-25",
    isCompleted: true,
    referenceDate: refDate,
  });
  assert.equal(resFuture.status, "completed");
  assert.equal(resFuture.escalationLevel, 0);
});

test("evaluateDeadlineStatus: upcoming status when > 7 days remaining", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");
  const res = evaluateDeadlineStatus({
    dueDate: "2026-10-25", // 14 days remaining
    isCompleted: false,
    referenceDate: refDate,
  });

  assert.equal(res.status, "upcoming");
  assert.equal(res.daysRemaining, 14);
  assert.equal(res.daysOverdue, 0);
  assert.equal(res.escalationLevel, 0);
  assert.equal(res.eligibleReminderStage, "none");
});

test("evaluateDeadlineStatus: due soon status and reminder stages within 7 days", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");

  // 7 days before
  const res7 = evaluateDeadlineStatus({
    dueDate: "2026-10-18",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res7.status, "due_soon");
  assert.equal(res7.daysRemaining, 7);
  assert.equal(res7.eligibleReminderStage, "7_days_before");

  // 3 days before
  const res3 = evaluateDeadlineStatus({
    dueDate: "2026-10-14",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res3.status, "due_soon");
  assert.equal(res3.daysRemaining, 3);
  assert.equal(res3.eligibleReminderStage, "3_days_before");

  // 1 day before
  const res1 = evaluateDeadlineStatus({
    dueDate: "2026-10-12",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res1.status, "due_soon");
  assert.equal(res1.daysRemaining, 1);
  assert.equal(res1.eligibleReminderStage, "1_day_before");
});

test("evaluateDeadlineStatus: due today triggers urgent due_today stage", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");
  const res = evaluateDeadlineStatus({
    dueDate: "2026-10-11",
    isCompleted: false,
    referenceDate: refDate,
  });

  assert.equal(res.status, "due_today");
  assert.equal(res.daysRemaining, 0);
  assert.equal(res.daysOverdue, 0);
  assert.equal(res.escalationLevel, 0);
  assert.equal(res.eligibleReminderStage, "due_today");
});

test("evaluateDeadlineStatus: overdue past due date (< 3 days)", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");

  // 1 day overdue
  const res1 = evaluateDeadlineStatus({
    dueDate: "2026-10-10",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res1.status, "overdue");
  assert.equal(res1.daysRemaining, -1);
  assert.equal(res1.daysOverdue, 1);
  assert.equal(res1.escalationLevel, 0);
  assert.equal(res1.eligibleReminderStage, "none");

  // 2 days overdue
  const res2 = evaluateDeadlineStatus({
    dueDate: "2026-10-09",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res2.status, "overdue");
  assert.equal(res2.daysRemaining, -2);
  assert.equal(res2.daysOverdue, 2);
  assert.equal(res2.escalationLevel, 0);
});

test("evaluateDeadlineStatus: triggers Level 1 escalation at 3 days overdue (PM alerted)", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");
  const res = evaluateDeadlineStatus({
    dueDate: "2026-10-08", // 3 days overdue
    isCompleted: false,
    referenceDate: refDate,
  });

  assert.equal(res.status, "escalated");
  assert.equal(res.daysRemaining, -3);
  assert.equal(res.daysOverdue, 3);
  assert.equal(res.escalationLevel, 1);
  assert.equal(res.eligibleReminderStage, "overdue_l1");
});

test("evaluateDeadlineStatus: triggers Level 2 escalation at 7+ days overdue (Corporate ESG alerted)", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");
  const res = evaluateDeadlineStatus({
    dueDate: "2026-10-04", // 7 days overdue
    isCompleted: false,
    referenceDate: refDate,
  });

  assert.equal(res.status, "escalated");
  assert.equal(res.daysRemaining, -7);
  assert.equal(res.daysOverdue, 7);
  assert.equal(res.escalationLevel, 2);
  assert.equal(res.eligibleReminderStage, "overdue_l2");

  // 14 days overdue
  const res14 = evaluateDeadlineStatus({
    dueDate: "2026-09-27",
    isCompleted: false,
    referenceDate: refDate,
  });
  assert.equal(res14.status, "escalated");
  assert.equal(res14.escalationLevel, 2);
  assert.equal(res14.eligibleReminderStage, "overdue_l2");
});

test("evaluateDeadlineStatus: supports custom configurable thresholds", () => {
  const refDate = new Date("2026-10-11T10:00:00+05:30");
  const customConfig = {
    dueSoonThresholdDays: 10,
    escalationL1ThresholdDays: 5,
    escalationL2ThresholdDays: 10,
  };

  // 4 days overdue: with default would be escalated L1, but with custom threshold (5) is still overdue L0
  const res = evaluateDeadlineStatus({
    dueDate: "2026-10-07", // 4 days overdue
    isCompleted: false,
    referenceDate: refDate,
    config: customConfig,
  });
  assert.equal(res.status, "overdue");
  assert.equal(res.escalationLevel, 0);

  // 5 days overdue: now triggers L1
  const resL1 = evaluateDeadlineStatus({
    dueDate: "2026-10-06",
    isCompleted: false,
    referenceDate: refDate,
    config: customConfig,
  });
  assert.equal(resL1.status, "escalated");
  assert.equal(resL1.escalationLevel, 1);
});

test("calculateDeadlineKPIs aggregates task metrics correctly", () => {
  const sampleTasks: Array<{ status: DeadlineStatus }> = [
    { status: "upcoming" },
    { status: "upcoming" },
    { status: "due_soon" },
    { status: "due_today" },
    { status: "overdue" },
    { status: "escalated" },
    { status: "escalated" },
    { status: "completed" },
    { status: "completed" },
    { status: "completed" },
  ];

  const kpis = calculateDeadlineKPIs(sampleTasks);
  assert.equal(kpis.totalTasks, 10);
  assert.equal(kpis.upcoming, 2);
  assert.equal(kpis.dueSoon, 1);
  assert.equal(kpis.dueToday, 1);
  assert.equal(kpis.overdue, 1);
  assert.equal(kpis.escalated, 2);
  assert.equal(kpis.completed, 3);
  assert.equal(kpis.completionRate, 30); // 3 / 10 = 30%
});

test("calculateDeadlineKPIs handles empty list gracefully", () => {
  const kpis = calculateDeadlineKPIs([]);
  assert.equal(kpis.totalTasks, 0);
  assert.equal(kpis.completionRate, 0);
});
