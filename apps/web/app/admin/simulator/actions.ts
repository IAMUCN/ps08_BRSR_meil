"use server";

import { runAction } from "@/lib/trpc/server";

/**
 * Server action to retrieve authorized emissions baseline data for the simulator.
 */
export async function simulatorBaselineAction(input: {
  orgUnitId: string;
  periodId: string;
}) {
  return runAction((api) => api.simulator.baseline(input));
}
