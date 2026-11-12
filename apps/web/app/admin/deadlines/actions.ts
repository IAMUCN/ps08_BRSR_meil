"use server";

import { runAction } from "@/lib/trpc/server";
import type { DeadlineFilter } from "@/lib/deadlines/types";

/**
 * Server action to manually send an immediate reminder for a specific task.
 */
export async function remindTaskAction(input: { expectationId: string; periodId: string }) {
  return runAction((api) => api.deadlines.remindTask(input));
}

/**
 * Server action to fetch refreshed or filtered deadline data.
 */
export async function fetchDeadlinesAction(filter?: DeadlineFilter) {
  return runAction((api) => api.deadlines.list(filter));
}

/** Phase 5: send today's reminders now (Super Admin). */
export async function runRemindersAction() {
  return runAction((api) => api.deadlines.runReminders());
}

/** Phase 5: save the reminder schedule (Super Admin). */
export async function saveScheduleAction(input: {
  days: { before: number; email: boolean }[];
  escalation?: { unitAdminAfter: number; parentAdminAfter: number; superAdminAfter: number };
}) {
  return runAction((api) => api.deadlines.setSchedule(input));
}
