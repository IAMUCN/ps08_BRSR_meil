"use server";

import { runAction } from "@/lib/trpc/server";

type FileTarget = {
  orgUnitId: string;
  metricId: string;
  mimeType: string;
  acknowledgeDuplicates: boolean;
  replacesDocumentId?: string;
};

export async function prepareUploadAction(
  input: FileTarget & { fileSize: number; sha256: string },
) {
  return runAction((api) => api.documents.prepareUpload(input));
}

export async function completeUploadAction(
  input: FileTarget & { documentId: string; reportingPeriodId: string; fileName: string },
) {
  return runAction((api) => api.documents.completeUpload(input));
}
