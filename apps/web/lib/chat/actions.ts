"use server";

import { runAction } from "@/lib/trpc/server";

// The chat panel calls these from the browser (.grill/chat-analyst-decisions.md); identity and org scope
// come from the session inside the procedures.

export async function listConversationsAction() {
  return runAction((api) => api.chat.conversations());
}

export async function loadConversationAction(id: string) {
  return runAction((api) => api.chat.conversation({ id }));
}

export async function sendChatMessageAction(input: {
  conversationId?: string;
  message: string;
  page?: { orgUnitId?: string; periodId?: string; path?: string };
}) {
  return runAction((api) => api.chat.send(input));
}

export async function deleteConversationAction(id: string) {
  return runAction((api) => api.chat.delete({ id }));
}
