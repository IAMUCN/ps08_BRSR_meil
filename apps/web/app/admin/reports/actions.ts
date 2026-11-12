"use server";

import { revalidatePath } from "next/cache";
import type { FyInputs } from "@/lib/reports/inputs";
import type { ReportTemplate } from "@/lib/reports/templates";
import { runAction } from "@/lib/trpc/server";

// Reports (03_APP_FLOW.md §2.2). The procedures check `report.generate` and audit the request; generation
// itself runs after the response and reports back through a notification.

export async function generateReportAction(input: {
  orgUnitId: string;
  periodId?: string;
  financialYear?: number;
  from?: string;
  to?: string;
  template?: ReportTemplate;
}) {
  const result = await runAction((api) => api.reports.generate(input));
  if (result.ok) revalidatePath("/admin/reports");
  return result;
}

export async function reportedRecordAction(input: {
  recordId: string;
  calculationId: string | null;
}) {
  return runAction((api) => api.reports.reportedRecord(input));
}

export async function reportInputsAction(input: { financialYear: number }) {
  return runAction((api) => api.reports.inputs(input));
}

export async function saveReportInputsAction(input: { financialYear: number } & FyInputs) {
  return runAction((api) => api.reports.saveInputs(input));
}

export async function bundlePreviewAction(input: {
  orgUnitId: string;
  periodId?: string;
  financialYear?: number;
}) {
  return runAction((api) => api.reports.bundlePreview(input));
}

// Forwarding a report for verification (Phase 4); the procedures check who may.
export async function forwardReportAction(input: {
  reportRunId: string;
  fromForwardId?: string;
  note?: string;
}) {
  return runAction((api) => api.reportForwarding.forward(input));
}

export async function decideForwardAction(input: {
  forwardId: string;
  decision: "verify" | "return";
  reason?: string;
}) {
  return runAction((api) => api.reportForwarding.decide(input));
}
