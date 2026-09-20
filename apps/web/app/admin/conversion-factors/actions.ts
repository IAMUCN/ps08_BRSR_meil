"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Conversion Factor Management (03_APP_FLOW.md §2.2). Every write goes through the tRPC procedures, which
// check the `factor.manage` permission and write the audit entry in the same transaction.

type VersionValues = {
  value: number;
  inputUnit: string;
  outputUnit: string;
  sourceReference: string;
  geography?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  notes?: string;
};

export async function createFactorAction(
  input: { activityType: string; name: string } & VersionValues,
) {
  const result = await runAction((api) => api.factors.create(input));
  if (result.ok) revalidatePath("/admin/conversion-factors");
  return result;
}

export async function addFactorVersionAction(input: { factorId: string } & VersionValues) {
  const result = await runAction((api) => api.factors.addVersion(input));
  if (result.ok) revalidatePath("/admin/conversion-factors");
  return result;
}

export async function setFactorVersionStatusAction(input: {
  versionId: string;
  status: "active" | "retired";
}) {
  const result = await runAction((api) => api.factors.setStatus(input));
  if (result.ok) revalidatePath("/admin/conversion-factors");
  return result;
}
