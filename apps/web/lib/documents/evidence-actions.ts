"use server";

import { runAction } from "@/lib/trpc/server";

// Supporting evidence for an existing record (.grill/audit-p2-decisions.md). The procedures decide who may
// see and add files; these only carry the calls from the browser.

export async function recordEvidenceAction(recordId: string) {
  return runAction((api) => api.documents.recordEvidence({ recordId }));
}

export async function prepareSupportingAction(input: {
  recordId: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
}) {
  return runAction((api) => api.documents.prepareSupporting(input));
}

export async function completeSupportingAction(input: {
  recordId: string;
  documentId: string;
  mimeType: string;
  fileName: string;
}) {
  return runAction((api) => api.documents.completeSupporting(input));
}
