"use server";

import { runAction } from "@/lib/trpc/server";

// Submission Monitoring. The procedure is Admin-only and audits what it sent.
export async function remindMissingAction(input: { orgUnitId: string; periodId: string }) {
  return runAction((api) => api.records.remindMissing(input));
}
