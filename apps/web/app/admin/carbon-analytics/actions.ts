"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Carbon Analytics (feature_enhancement.md Phase 7; A47). Every check is in lib/trpc/routers/analytics.ts.

export async function wordRecommendationAction(input: {
  orgUnitId: string;
  recommendationId: string;
}) {
  return runAction((api) => api.analytics.wordRecommendation(input));
}

export async function acknowledgeAlertAction(input: { id: string; note: string }) {
  const result = await runAction((api) => api.analytics.acknowledge(input));
  if (result.ok) revalidatePath("/admin/carbon-analytics");
  return result;
}

export async function updateAlertSettingsAction(input: {
  enabled: boolean;
  thresholdPct: { SCOPE_1: number; SCOPE_2: number; SCOPE_3: number };
  minBaselineYears: number;
  minIncreaseTco2e: number;
  lookbackDays: number;
}) {
  const result = await runAction((api) => api.analytics.updateAlertSettings(input));
  if (result.ok) revalidatePath("/admin/carbon-analytics");
  return result;
}

export async function runAlertsAction() {
  const result = await runAction((api) => api.analytics.runAlerts());
  if (result.ok) revalidatePath("/admin/carbon-analytics");
  return result;
}

/** Which projects a suggestion's emissions come from, largest first (owner's request, 2026-11-11). */
export async function emissionsByUnitAction(input: {
  orgUnitId: string;
  recommendationId: string;
}) {
  return runAction((api) => api.analytics.byUnit(input));
}
