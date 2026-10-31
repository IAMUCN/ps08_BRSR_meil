"use server";

import { runAction } from "@/lib/trpc/server";

export async function createPeriodAction(input: {
  label: string;
  periodType: "monthly" | "annual";
  startDate: string;
  endDate: string;
  submissionOpensOn: string;
  submissionClosesOn: string;
}) {
  return runAction((api) => api.reportingPeriods.create(input));
}

export async function updatePeriodWindowAction(input: {
  id: string;
  submissionOpensOn: string;
  submissionClosesOn: string;
}) {
  return runAction((api) => api.reportingPeriods.updateWindow(input));
}

export async function transitionPeriodAction(input: {
  id: string;
  to: "open" | "closed";
  reason?: string;
  acknowledgeUnresolved?: boolean;
  newClosesOn?: string;
}) {
  return runAction((api) => api.reportingPeriods.transition(input));
}
