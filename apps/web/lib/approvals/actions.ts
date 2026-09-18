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
