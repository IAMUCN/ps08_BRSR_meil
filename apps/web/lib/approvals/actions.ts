"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Approval decisions from either mount of the Approval Queue (/admin/approval-queue, /app/approvals).
export async function decideApprovalAction(
  input:
    | { recordId: string; decision: "approve" }
    | { recordId: string; decision: "return"; reason: string },
) {
  const result = await runAction((api) => api.approvals.decide(input));
  if (result.ok) {
    revalidatePath("/admin/approval-queue");
    revalidatePath("/app/approvals");
  }
  return result;
}

/** Re-runs the calculation engine for a record whose factor was missing (needs `factor.manage`). */
export async function recalculateAction(recordId: string) {
  const result = await runAction((api) => api.factors.recalculate({ recordId }));
  if (result.ok) {
    revalidatePath("/admin/approval-queue");
    revalidatePath("/app/approvals");
  }
  return result;
}
