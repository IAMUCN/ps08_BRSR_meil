"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Reports (03_APP_FLOW.md §2.2). The procedures check `report.generate` and audit the request; generation
// itself runs after the response and reports back through a notification.

export async function generateReportAction(input: {
  orgUnitId: string;
  periodId?: string;
  financialYear?: number;
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
