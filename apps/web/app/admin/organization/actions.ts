"use server";

import { runAction } from "@/lib/trpc/server";
import type { OrgUnitType } from "@/lib/org/rules";

export async function createOrgUnitAction(input: {
  /** Null: a new group, a separate organization with its own tree. */
  parentId: string | null;
  unitType: OrgUnitType;
  name: string;
  code: string;
}) {
  return runAction((api) => api.organization.create(input));
}

export async function updateOrgUnitAction(input: { id: string; name: string; code: string }) {
  return runAction((api) => api.organization.update(input));
}

export async function moveOrgUnitAction(input: { id: string; newParentId: string }) {
  return runAction((api) => api.organization.move(input));
}

export async function addOrgUnitParentAction(input: { id: string; parentId: string }) {
  return runAction((api) => api.organization.addParent(input));
}

export async function removeOrgUnitParentAction(input: { id: string; parentId: string }) {
  return runAction((api) => api.organization.removeParent(input));
}

export async function orgUnitDeleteCheckAction(input: { id: string }) {
  return runAction((api) => api.organization.deleteCheck(input));
}

export async function deleteOrgUnitAction(input: { id: string }) {
  return runAction((api) => api.organization.delete(input));
}

export async function setOrgUnitStatusAction(input: { id: string; status: "active" | "inactive" }) {
  return runAction((api) => api.organization.setStatus(input));
}

export async function orgUnitImpactAction(input: { id: string }) {
  return runAction((api) => api.organization.impact(input));
}

export async function orgExpectationsAction(input: { orgUnitId: string }) {
  return runAction((api) => api.organization.expectations(input));
}

export async function setExpectationAction(input: {
  orgUnitId: string;
  metricId: string;
  expected: boolean;
}) {
  return runAction((api) => api.organization.setExpectation(input));
}

export async function addLevelAction(input: { label: string; afterCode: string }) {
  return runAction((api) => api.organization.addLevel(input));
}

export async function renameLevelAction(input: { code: string; label: string }) {
  return runAction((api) => api.organization.renameLevel(input));
}

export async function removeLevelAction(input: { code: string }) {
  return runAction((api) => api.organization.removeLevel(input));
}
