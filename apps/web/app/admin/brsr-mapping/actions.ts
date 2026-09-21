"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// BRSR Mapping (03_APP_FLOW.md §2.2). The procedures check `brsr_mapping.manage` and audit every change.

export async function saveMappingAction(input: {
  mappingId?: string;
  metricId: string;
  indicatorId: string;
  notes?: string;
  isApplicable: boolean;
}) {
  const result = await runAction((api) => api.brsr.save(input));
  if (result.ok) revalidatePath("/admin/brsr-mapping");
  return result;
}

export async function removeMappingAction(mappingId: string) {
  const result = await runAction((api) => api.brsr.remove({ mappingId }));
  if (result.ok) revalidatePath("/admin/brsr-mapping");
  return result;
}
