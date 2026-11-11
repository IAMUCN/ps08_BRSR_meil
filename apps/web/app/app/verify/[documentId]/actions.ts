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

/** Where each field was read and why one was not (Phase 3, the field grid's highlighting). */
export async function fieldSourcesAction(documentId: string) {
  return runAction((api) => api.verification.sources({ documentId }));
}

/** The uploader changes the document's optional description (migration 0063). */
export async function setDescriptionAction(documentId: string, description: string) {
  const result = await runAction((api) =>
    api.documents.setDescription({ documentId, description }),
  );
  if (result.ok) revalidatePath(`/app/verify/${documentId}`);
  return result;
}

/** The eye button (migration 0065): remember the choice on the person's account. */
export async function setShowExtractionBoxesAction(show: boolean) {
  return runAction((api) => api.profile.setShowExtractionBoxes({ show }));
}
