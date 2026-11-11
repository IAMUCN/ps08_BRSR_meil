"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

export async function setContactedAction(input: { id: string; contacted: boolean }) {
  const result = await runAction((api) => api.demoRequests.setContacted(input));
  if (result.ok) revalidatePath("/admin/demo-requests");
  return result;
}
