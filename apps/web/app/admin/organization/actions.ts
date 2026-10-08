"use server";

import { runAction } from "@/lib/trpc/server";
import type { OrgUnitType } from "@/lib/org/rules";

export async function createOrgUnitAction(input: {
  parentId: string;
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
