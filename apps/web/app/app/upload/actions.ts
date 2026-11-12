"use server";

import { runAction } from "@/lib/trpc/server";

type FileTarget = {
  reportingPeriodId?: string;
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
  input: FileTarget & {
    documentId: string;
    reportingPeriodId: string;
    fileName: string;
    description?: string;
  },
) {
  return runAction((api) => api.documents.completeUpload(input));
}

// Every upload of bills: one or more files, split on the review page (lib/trpc/routers/bundles.ts).
export async function prepareBundleUploadAction(input: {
  reportingPeriodId?: string;
  orgUnitId: string;
  files: { fileSize: number; sha256: string; mimeType: string }[];
  acknowledgeDuplicates: boolean;
}) {
  return runAction((api) => api.bundles.prepareUpload(input));
}

export async function completeBundleUploadAction(input: {
  orgUnitId: string;
  documentId: string;
  reportingPeriodId: string;
  sources: { id: string; fileName: string; mimeType: string }[];
  acknowledgeDuplicates: boolean;
  description?: string;
}) {
  return runAction((api) => api.bundles.completeUpload(input));
}

export async function confirmBundleAction(input: {
  documentId: string;
  acknowledgeDuplicates: boolean;
  parts: {
    pageFrom: number;
    pageTo: number;
    metricId: string | null;
    skip: boolean;
    reportingPeriodId?: string;
  }[];
}) {
  return runAction((api) => api.bundles.confirm(input));
}

export async function discardBundleAction(input: { documentId: string }) {
  return runAction((api) => api.bundles.discard(input));
}

/** The expected submissions of the chosen project and period, with what is on file (Upload page). */
export async function expectedProgressAction(input: { orgUnitId: string; periodId: string }) {
  return runAction((api) => api.documents.expectedProgress(input));
}
