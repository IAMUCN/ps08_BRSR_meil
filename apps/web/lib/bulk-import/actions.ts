"use server";

import type { OrgUnitType } from "@/lib/org/rules";
import { runAction } from "@/lib/trpc/server";

export async function bulkImportUsersOptionsAction() {
  return runAction((api) => api.users.bulkImportOptions());
}

export async function bulkImportUsersAction(input: {
  rows: {
    employeeId: string;
    displayName: string;
    email: string;
    roleCode: string;
    orgUnitCode: string;
  }[];
}) {
  return runAction((api) => api.users.bulkImport(input));
}

export async function bulkImportOrgUnitsOptionsAction() {
  return runAction((api) => api.organization.bulkImportOptions());
}

export async function bulkImportOrgUnitsAction(input: {
  parentId: string;
  rows: { unitType: OrgUnitType; name: string; code: string }[];
}) {
  return runAction((api) => api.organization.bulkImport(input));
}
