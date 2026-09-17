"use server";

import { runAction } from "@/lib/trpc/server";

export async function createRoleAction(input: { code: string; name: string; description: string }) {
  return runAction((api) => api.roles.create(input));
}

export async function setRolePermissionsAction(input: { roleId: string; permissionIds: string[] }) {
  return runAction((api) => api.roles.setPermissions(input));
}

export async function deleteRoleAction(input: { roleId: string }) {
  return runAction((api) => api.roles.delete(input));
}
