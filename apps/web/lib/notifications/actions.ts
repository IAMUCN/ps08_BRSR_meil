"use server";

import { runAction } from "@/lib/trpc/server";

// Poll-based notification updates (.grill/phase-6-ocr-integration-decisions.md): the bell calls these
// from the browser; identity comes from the session inside the procedures.

export async function pollNotificationsAction() {
  return runAction((api) => api.notifications.list({ limit: 5 }));
}

export async function markNotificationReadAction(id: string) {
  return runAction((api) => api.notifications.markRead({ id }));
}

export async function markAllNotificationsReadAction() {
  return runAction((api) => api.notifications.markAllRead());
}
