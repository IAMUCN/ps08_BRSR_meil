"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Employee register (migration 0070): each procedure checks the permission and the org scope again.

export async function confirmRegisterAction(input: { id: string }) {
  const result = await runAction((api) => api.register.confirm(input));
  if (result.ok) revalidatePath("/app/employee-register");
  return result;
}

export async function decideRegisterAction(input: {
  id: string;
  decision: "approve" | "return";
  note?: string;
}) {
  const result = await runAction((api) => api.register.decide(input));
  if (result.ok) revalidatePath("/app/employee-register");
  return result;
}

export async function registerPeopleAction(input: { id: string }) {
  return runAction((api) => api.register.people(input));
}
