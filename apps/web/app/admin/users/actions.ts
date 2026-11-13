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

export async function setEmployeeIdAction(input: { userId: string; employeeId: string }) {
  return runAction((api) => api.users.setEmployeeId(input));
}

export async function updateInvitedUserAction(input: {
  userId: string;
  displayName: string;
  email: string;
}) {
  return runAction((api) => api.users.updateInvited(input));
}

export async function resendInviteAction(input: { userId: string }) {
  return runAction((api) => api.users.resendInvite(input));
}

export async function revokeInviteAction(input: { userId: string }) {
  return runAction((api) => api.users.revokeInvite(input));
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

/** Super Admin only (checked in the action): removes the person's authenticator app. */
export async function resetUserMfaAction(input: { userId: string }) {
  const { resetUserMfa } = await import("@/lib/auth/mfa-actions");
  const result = await resetUserMfa(input.userId);
  return result.ok
    ? ({ ok: true, data: { removed: result.removed } } as const)
    : ({ ok: false, error: result.error } as const);
}
