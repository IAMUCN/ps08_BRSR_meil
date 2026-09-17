"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/lib/trpc/server";

// Verify Extraction server actions (.grill/phase-7-ocr-verification-decisions.md). Identity, scope and
// the guard rail are re-checked inside the procedures — the browser only supplies values.

export async function setDocumentTypeAction(documentId: string, documentTypeId: string) {
  return runAction((api) => api.verification.setDocumentType({ documentId, documentTypeId }));
}

export async function checkInvoiceDuplicatesAction(documentId: string, invoiceNumber: string) {
  return runAction((api) => api.verification.invoiceDuplicates({ documentId, invoiceNumber }));
}

/** After a lifecycle change the submissions list and dashboard counts must be re-rendered. */
function revalidateWorkspace() {
  revalidatePath("/app");
  revalidatePath("/app/submissions");
}

export async function confirmVerificationAction(input: {
  documentId: string;
  fields: { id: string; value: string; acknowledged: boolean }[];
  acknowledgeDuplicate: boolean;
}) {
  const result = await runAction((api) => api.verification.confirm(input));
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function confirmManualEntryAction(input: {
  documentId: string;
  values: { key: string; value: string }[];
  justification: string;
  acknowledgeDuplicate: boolean;
}) {
  const result = await runAction((api) => api.verification.confirmManual(input));
  if (result.ok) revalidateWorkspace();
  return result;
}

export async function rejectDocumentAction(documentId: string, reason: string) {
  const result = await runAction((api) => api.verification.reject({ documentId, reason }));
  if (result.ok) revalidateWorkspace();
  return result;
}
