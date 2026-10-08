"use server";

import { runAction } from "@/lib/trpc/server";

export async function inviteUserAction(input: {
  email: string;
  displayName: string;
  roleId: string;
  orgUnitId: string;
}) {
  return runAction((api) => api.users.invite(input));
}

export async function resendInviteAction(input: { userId: string }) {
  return runAction((api) => api.users.resendInvite(input));
}

export async function addAssignmentAction(input: {
  userId: string;
  roleId: string;
  orgUnitId: string;
}) {
  return runAction((api) => api.users.addAssignment(input));
}

export async function revokeAssignmentAction(input: { assignmentId: string }) {
  return runAction((api) => api.users.revokeAssignment(input));
}

export async function deactivateUserAction(input: { userId: string }) {
  return runAction((api) => api.users.deactivate(input));
}

export async function reactivateUserAction(input: { userId: string }) {
  return runAction((api) => api.users.reactivate(input));
}

export async function deleteUserAction(input: { userId: string }) {
  return runAction((api) => api.users.delete(input));
}
