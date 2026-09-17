"use server";

import { runAction } from "@/lib/trpc/server";

export async function updateDisplayNameAction(input: { displayName: string }) {
  return runAction((api) => api.profile.updateDisplayName(input));
}

export async function changePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return runAction((api) => api.profile.changePassword(input));
}
