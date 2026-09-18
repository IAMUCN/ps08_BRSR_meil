"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

export async function reviewRecordAction(input: {
  recordId: string;
  decision: "accept" | "return";
  reason: string;
}) {
  const result = await runAction((api) => api.validation.review(input));
  if (result.ok) revalidatePath("/admin/validation-queue");
  return result;
}
