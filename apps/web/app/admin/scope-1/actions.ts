"use server";

import type { CalculationState } from "@/lib/calculation/trace";
import { api } from "@/lib/trpc/server";

// The drill-down drawer asks for one record's stored calculation. The procedure re-checks the session and
// the caller's scope, so this is just the bridge from the Client Component.
export async function recordTraceAction(recordId: string): Promise<CalculationState> {
  return (await api()).scope.recordTrace({ recordId });
}
