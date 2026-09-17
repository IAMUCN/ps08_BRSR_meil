"use server";

import { runAction } from "@/lib/trpc/server";

export async function retryOcrJobAction(jobId: string) {
  return runAction((api) => api.ocr.retry({ jobId }));
}

export async function ocrJobFieldsAction(jobId: string) {
  return runAction((api) => api.ocr.jobFields({ jobId }));
}
