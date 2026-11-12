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
  /** The row(s) typed for this upload (migration 0077). */
  declarations?: {
    metricId: string;
    reportingPeriodId: string;
    mode: "bill" | "pages_of_one" | "total";
    values: Record<string, string>;
  }[];
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
    declaration?: number | null;
    values?: Record<string, string>;
  }[];
  dropDeclarations?: number[];
}) {
  return runAction((api) => api.bundles.confirm(input));
}

/** A typed upload that has been read: recorded at once when its bills pair cleanly with its rows. */
export async function autoConfirmBundleAction(input: { documentId: string }) {
  return runAction((api) => api.bundles.autoConfirm(input));
}

export async function rowStatusAction(input: { documentIds: string[] }) {
  return runAction((api) => api.bundles.rowStatus(input));
}

export async function saveUploadDraftAction(input: { rows: Record<string, unknown>[] }) {
  return runAction((api) => api.bundles.saveDraft(input));
}

export async function clearUploadDraftAction() {
  return runAction((api) => api.bundles.clearDraft());
}

export async function discardBundleAction(input: { documentId: string }) {
  return runAction((api) => api.bundles.discard(input));
}

/** The expected submissions of the chosen project and period, with what is on file (Upload page). */
export async function expectedProgressAction(input: { orgUnitId: string; periodId: string }) {
  return runAction((api) => api.documents.expectedProgress(input));
}
