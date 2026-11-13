"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// BRSR Disclosures (.grill/full-brsr-report-decisions.md). The procedure is Admin-only and audits the change.
export async function saveDisclosureAction(input: {
  indicatorId: string;
  financialYear: number;
  answer: string;
}) {
  return runAction((api) => api.brsr.saveDisclosure(input));
}

/** SEBI's typed tables (migration 0087): one table from the editor, or every sheet of an Excel import. */
export async function saveTablesAction(input: {
  financialYear: number;
  tables: { code: string; cells: Record<string, Record<string, unknown>>; notes: string | null }[];
}) {
  const result = await runAction((api) => api.brsrTables.save(input));
  if (result.ok) revalidatePath("/admin/disclosures");
  return result;
}
