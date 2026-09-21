"use server";

import { runAction } from "@/lib/trpc/server";

// The shared record drawer asks for one record's detail; the procedure is Admin-only and re-checks it.
export async function recordDetailAction(recordId: string) {
  return runAction((api) => api.records.detail({ recordId }));
}
