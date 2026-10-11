"use server";

import { runAction } from "@/lib/trpc/server";
import type { ForecastScopeTarget } from "@/lib/forecast/engine";

/**
 * Server action to retrieve authorized emissions forecast data.
 */
export async function getForecastAction(input: {
  orgUnitId: string;
  scopeTarget?: ForecastScopeTarget;
  horizon?: number;
}) {
  return runAction((api) => api.forecast.getForecast(input));
}
