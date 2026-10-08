"use server";

import { runAction } from "@/lib/trpc/server";

// BRSR Disclosures (.grill/full-brsr-report-decisions.md). The procedure is Admin-only and audits the change.
export async function saveDisclosureAction(input: {
  indicatorId: string;
  financialYear: number;
  answer: string;
}) {
  return runAction((api) => api.brsr.saveDisclosure(input));
}
