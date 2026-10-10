"use server";

import { runAction } from "@/lib/trpc/server";
import type { DeadlineFilter } from "@/lib/deadlines/types";

/**
 * Server action to execute an automated deadline reminder and escalation sweep.
 */
export async function runEscalationSweepAction(input?: { periodId?: string }) {
  return runAction((api) => api.deadlines.runSweep(input));
}

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
