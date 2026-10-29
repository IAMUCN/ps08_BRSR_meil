"use server";

import { currentSessionId, touchSession, type SessionClock } from "@/lib/auth/session-limits";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Called by the signed-in shell (components/shell/session-keeper.tsx). Identity comes from the session
// cookie, as everywhere; nothing the browser sends is trusted, and the worst a caller can do is keep
// their own session busy until the absolute limit ends it anyway.

// A failure (the database cannot be reached) is thrown, not reported as "expired": the page must not send
// someone to sign in again over a hiccup.
async function clock(activity: boolean): Promise<SessionClock> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user) {
    // No answer from Supabase Auth is not the same as "no session".
    if (error && (!error.status || error.status >= 500)) throw error;
    return { state: "expired" };
  }
  return touchSession(await currentSessionId(supabase), user.id, activity);
}

/** The person did something on the page (a key, a click, a scroll): the idle clock starts again. */
export async function reportActivity(): Promise<SessionClock> {
  return clock(true);
}

/** When this sign-in will end, without counting as activity. */
export async function sessionClock(): Promise<SessionClock> {
  return clock(false);
}
