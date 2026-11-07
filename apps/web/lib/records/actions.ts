"use server";

import { runAction } from "@/lib/trpc/server";

// The shared record drawer asks for one record's detail; the procedure is Admin-only and re-checks it.
export async function recordDetailAction(recordId: string) {
  return runAction((api) => api.records.detail({ recordId }));
}

export async function correctDocumentTypeAction(input: {
  recordId: string;
  documentTypeId: string;
  reason: string;
}) {
  return runAction((api) => api.records.setDocumentType(input));
}

export async function returnWrongActivityAction(input: { recordId: string; reason: string }) {
  return runAction((api) => api.records.returnWrongActivity(input));
}
