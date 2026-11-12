"use server";

import { runAction } from "@/lib/trpc/server";

// The top-bar search calls this from the browser; who is asking comes from the session (lib/search/global.ts).
export async function globalSearchAction(input: { q: string; pathname: string }) {
  return runAction((api) => api.search.global(input));
}
